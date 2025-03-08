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

let dropdownElement = null
/**
 * 创建多选下拉框
 * @returns {Promise<HTMLSelectElement|null>}
 */
async function updateDropdownElement() {
    const templates = BASE.TableTemplate().loadAllUserTemplates()
    if (dropdownElement === null) {
        dropdownElement = document.createElement('select');
        dropdownElement.id = 'table_template';
        dropdownElement.classList.add('select2_multi_sameline', 'select2_choice_clickable', 'select2_choice_clickable_buttonstyle'); // 添加所有必要的 class
        dropdownElement.multiple = true;
    }
    // 清空dropdownElement的所有子元素
    dropdownElement.innerHTML = '';

    for (const t of templates) {
        let optionText, optionValue;

        if (typeof t === 'string') {
            optionText = t;
            optionValue = t;
        } else if (typeof t === 'object' && t !== null) {
            if (t.name && t.uid) {
                optionText = t.name;
                optionValue = t.uid;
            } else if (t.name) {
                optionText = t.name;
                optionValue = t.name;
            } else {
                console.warn("templates 中的项缺少 name 属性，已跳过:", t);
                continue;
            }
        } else {
            console.warn("templates 中的项类型不正确，应为字符串或对象，已跳过:", t);
            continue;
        }

        const optionElement = document.createElement('option');
        optionElement.value = optionValue;
        optionElement.textContent = optionText;
        dropdownElement.appendChild(optionElement);
    }

    return dropdownElement;
}

/**
 * 初始化Select2下拉框
 * @param {HTMLSelectElement} dropdownElement 下拉框元素
 */
function initializeSelect2Dropdown(dropdownElement) {
    $(dropdownElement).select2({
        closeOnSelect: false,
        templateResult: function (data) {
            if (!data.id) {
                return data.text;
            }
            var $wrapper = $('<span class="select2-option" style="width: 100%"></span>');
            var $checkbox = $('<input type="checkbox" class="select2-option-checkbox"/>');
            $checkbox.prop('checked', data.selected);
            // $wrapper.append($checkbox);
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
    const tableMultipleSelectionDropdown = $('<span class="select2-option" style="width: 100%"></span>');
    const checkboxForParent = $('<input type="checkbox" class="select2-option-checkbox"/>');
    tableMultipleSelectionDropdown.append(checkboxForParent);
    tableMultipleSelectionDropdown.append(firstOptionText);

    const parentFileBox = $('#parentFileBox');
    if (parentFileBox.length) {
        parentFileBox.append(tableMultipleSelectionDropdown);
    } else {
        console.warn('未找到 ID 为 parentFileBox 的父文件框，请检查您的 HTML 结构。');
    }

    const select2MultipleSelection = $(dropdownElement).next('.select2-container--default');
    if (select2MultipleSelection.length) {
        select2MultipleSelection.css('width', '100%');
    }
}


let table_editor_container = null
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

    userTableEditInfo.editAble = findNextChatWhitTableData(mesId).index === -1

    // 添加初始化下拉多选表格模板
    dropdownElement = await updateDropdownElement()
    $(tableEditTips).after(dropdownElement)
    initializeSelect2Dropdown(dropdownElement);

    // 添加表格编辑工具栏
    tableHeaderToolbar = $(tableHeaderEditToolbarDom).hide();
    $(tableContainer).append(tableHeaderToolbar);

    // 添加拖拽空间表格
    $(contentContainer).empty()
    drag = new EDITOR.Drag();
    contentContainer.append(drag.render);
    drag.add('tableContainer', tableContainer);
    drag.add('tableHeaderToolbar', tableHeaderToolbar[0]);

    // 获取最新表格数据并渲染（该方法为旧版本，待移除）
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

    // 设置编辑提示
    // 点击添加表格模板
    $(document).on('click', '#add_table_template_button', function () {
        BASE.TableTemplate().createNew()
        updateDropdownElement();
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
    // 点击销毁所有表格模板按钮
    $(document).on('click', '#destroy_table_template_button', function () {
        BASE.TableTemplate().destroyAll()
        updateDropdownElement();
    })

    return table_editor_container;
}

export async function getEditView(mesId = -1) {
    return table_editor_container || await initTableEdit(mesId);
}
