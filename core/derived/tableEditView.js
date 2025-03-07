import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import {updateSystemMessageTableStatus} from "./tablePushToChat.js";
import {findLastestTableData, findNextChatWhitTableData, getTableEditActionsStr, handleEditStrInMessage, parseTableEditTag, replaceTableEditTag,} from "../../index.js";
import {rebuildTableActions, refreshTableActions} from "./absoluteRefresh.js";
import {initAllTable} from "../source/tableActions.js";
import {openTablePopup} from "./tableDataView.js";

const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}
let drag = null

/**
 * 表头编辑浮窗
 */
const tableHeaderEditToolbarDom = `
<div class="popup popup--animation-fast tableToolbar" id="tableHeaderToolbar">
    <button id="insertColumnLeft" class="menu_button">左侧插入列</button>
    <button id="insertColumnRight" class="menu_button">右侧插入列</button>
    <button id="deleteColumn" class="menu_button">删除列</button>
    <button id="renameColumn" class="menu_button">重命名列</button>
    <button id="sortColumnAsc" class="menu_button">升序排序</button>
    <button id="sortColumnDesc" class="menu_button">降序排序</button>
    <button id="filterColumn" class="menu_button">筛选列</button>
</div>`


let tableHeaderToolbar = null;



/**
 * 渲染所有表格DOM及编辑栏
 * @param {Array} tables 所有表格数据
 * @param {Element} tableContainer 表格DOM容器
 * @param {boolean} isEdit 是否可以编辑
 */
export function renderTablesDOM(tables = [], tableContainer, isEdit = false) {
    $(tableContainer).empty()
    for (let table of tables) {
        $(tableContainer).append(table.render()).append(`<hr />`)
    }
    if (userTableEditInfo.editAble) {
        for (let table of tables) {
            // table.cellClickEvent(onTdClick) // 绑定单元格点击事件
        }
    }
}

/**
 * 创建多选下拉框
 * @returns {Promise<HTMLSelectElement|null>}
 */
async function createDropdownElement() {
    if (!BASE.templates) {
        console.error("BASE.templates 未定义或不存在。");
        return null;
    }

    const templates = BASE.templates;

    if (!Array.isArray(templates)) {
        console.error("BASE.templates 必须是一个数组。");
        return null;
    }

    const selectElement = document.createElement('select');
    selectElement.id = 'table_template'; // 确保 ID 为 world_info
    selectElement.classList.add('select2_multi_sameline', 'select2_choice_clickable', 'select2_choice_clickable_buttonstyle'); // 添加所有必要的 class
    selectElement.multiple = true;

    for (const templateItem of templates) {
        let optionText, optionValue;

        if (typeof templateItem === 'string') {
            optionText = templateItem;
            optionValue = templateItem;
        } else if (typeof templateItem === 'object' && templateItem !== null) {
            if (templateItem.name && templateItem.uid) {
                optionText = templateItem.name;
                optionValue = templateItem.uid;
            } else if (templateItem.name) {
                optionText = templateItem.name;
                optionValue = templateItem.name;
            } else {
                console.warn("BASE.templates 中的项缺少 name 属性，已跳过:", templateItem);
                continue;
            }
        } else {
            console.warn("BASE.templates 中的项类型不正确，应为字符串或对象，已跳过:", templateItem);
            continue;
        }

        const optionElement = document.createElement('option');
        optionElement.value = optionValue;
        optionElement.textContent = optionText;
        selectElement.appendChild(optionElement);
    }

    return selectElement;
}

let initializedTableEdit = null

/**
 * 初始化表格编辑
 * @param mesId
 * @returns {Promise<Document|HTMLElement>}
 */
async function initTableEdit(mesId) {
    const table_editor_container = await SYSTEM.htmlToDom(await SYSTEM.getComponent('editor'), 'table_editor_container');
    const tableEditTips = table_editor_container.querySelector('#tableEditTips');
    const tableContainer = table_editor_container.querySelector('#tableContainer');
    const contentContainer = table_editor_container.querySelector('#contentContainer');

    const tableTemplateInstance = BASE.TableTemplate()
    console.log(BASE.templates)
    tableTemplateInstance.create()
    console.log(BASE.templates)

    userTableEditInfo.editAble = findNextChatWhitTableData(mesId).index === -1

    tableHeaderToolbar = $(tableHeaderEditToolbarDom).hide();
    $(tableContainer).append(tableHeaderToolbar);

    $(contentContainer).empty()

    const dropdownElement = await createDropdownElement()
    $(tableEditTips).before(dropdownElement)

    drag = new EDITOR.Drag();
    contentContainer.append(drag.render);
    drag.add('tableContainer', tableContainer);
    drag.add('tableHeaderToolbar', tableHeaderToolbar[0]);


    const { tables, index } = findLastestTableData(true, mesId)
    userTableEditInfo.chatIndex = index
    userTableEditInfo.tables = tables

    if (userTableEditInfo.editAble && index !== -1 && (!DERIVED.any.waitingTableIndex || DERIVED.any.waitingTableIndex !== index)) {
        parseTableEditTag(USER.getContext().chat[index], -1, true)
    }

    renderTablesDOM(userTableEditInfo.tables, tableContainer, userTableEditInfo.editAble)
    tables[0].cellClickEvent(callback => {
        console.log(callback)
    })

    if (!userTableEditInfo.editAble) {
        $('#contentContainer #paste_table_button').hide();
    } else {
        $('#contentContainer #paste_table_button').show();
    }

    initializedTableEdit = table_editor_container;

    const tableMultipleSelectionDropdown = $('<span class="select2-option" style="width: 100%"></span>');

    $(dropdownElement).select2({
        closeOnSelect: false,
        templateResult: function (data) {
            if (!data.id) {
                return data.text;
            }
            var $wrapper = $('<span class="select2-option" style="width: 100%"></span>');
            var $checkbox = $('<input type="checkbox" class="select2-option-checkbox"/>');
            $checkbox.prop('checked', data.selected);
            $wrapper.append($checkbox);
            $wrapper.append(data.text);
            return $wrapper;
        },
        templateSelection: function (data) {
            return data.text;
        },
        escapeMarkup: function (markup) {
            return markup;
        }
    });

    const firstOptionText = $(dropdownElement).find('option:first-child').text();

    const checkboxForParent = $('<input type="checkbox" class="select2-option-checkbox"/>');
    tableMultipleSelectionDropdown.append(checkboxForParent);
    tableMultipleSelectionDropdown.append(firstOptionText);

    const parentFileBox = $('#parentFileBox');
    console.log(parentFileBox)
    if (parentFileBox.length) {
        parentFileBox.append(tableMultipleSelectionDropdown);
    } else {
        console.warn('未找到 ID 为 parentFileBox 的父文件框，请检查您的 HTML 结构。');
    }


    const select2MultipleSelection = $(dropdownElement).next('.select2-container--default');

    if (select2MultipleSelection.length) {
        select2MultipleSelection.css('width', '100%');
    } else {
    }

    // 设置编辑提示
    // 点击添加表格模板
    $(document).on('click', '#add_table_template_button', function () {
        // openTableEditorPopup();
    })
    // 点击重排序表格按钮
    $(document).on('click', '#sort_table_template_button', function () {

    })
    // 点击导入表格按钮
    $(document).on('click', '#import_table_template_button', function () {

    })
    // 点击导出表格按钮
    $(document).on('click', '#export_table_template_button', function () {

    })

    // 点击打开查看表格历史按钮
    $(document).on('click', '#table_template_history_button', function () {

    })

    return initializedTableEdit;
}

export async function getEditView(mesId = -1) {
    return initializedTableEdit || await initTableEdit(mesId);
}
