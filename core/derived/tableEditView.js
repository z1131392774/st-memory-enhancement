import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import { findLastestTableData } from "../../index.js";

const userSheetEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}
let drag = null


/**
 * 渲染所有表格DOM及编辑栏
 * @param {Array} sheets 所有表格数据
 * @param {Element} sheetContainer 表格DOM容器
 * @param {boolean} isEdit 是否可以编辑
 */
function renderSheetsDOM(sheets = [], sheetContainer, isEdit = false) {
    $(sheetContainer).empty()
    for (let sheet of sheets) {
        $(sheetContainer).append(sheet.render()).append(`<hr />`)
    }
    // if (userSheetEditInfo.editAble) {
    //     for (let table of tables) {
    //         // table.cellClickEvent(onTdClick) // 绑定单元格点击事件
    //     }
    // }
}

let dropdownElement = null;
/**
 * 创建多选下拉框
 * @returns {Promise<HTMLSelectElement|null>}
 */
async function updateDropdownElement() {
    const templates = BASE.SheetTemplate().loadAllUserTemplates();
    if (dropdownElement === null) {
        dropdownElement = document.createElement('select');
        dropdownElement.id = 'table_template';
        dropdownElement.classList.add('select2_multi_sameline', 'select2_choice_clickable', 'select2_choice_clickable_buttonstyle'); // 添加所有必要的 class
        dropdownElement.multiple = true;
    }
    // 清空dropdownElement的所有子元素
    dropdownElement.innerHTML = '';
    for (const t of templates) {
        const optionElement = document.createElement('option');
        optionElement.value = t.uid;
        optionElement.textContent = t.name;
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

    // 监听 change 事件, 保存选择结果
    $(dropdownElement).on('change', function () {
        USER.getSettings().tableEditorSelectedSheets = $(this).val();
        USER.saveSettings();
        // 触发更新表格
        updateDragTables();
    });

    // 初始化时恢复选项
    let selectedSheets = USER.getSettings().tableEditorSelectedSheets;
    if (selectedSheets === undefined) {
        selectedSheets = [];
    }
    $(dropdownElement).val(selectedSheets).trigger('change');


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
 * 根据已选择的表格模板更新 Drag 区域的表格
 */
async function updateDragTables() {
    if (!drag) return;

    const selectedSheetUids = USER.getSettings().tableEditorSelectedSheets;
    const selectedTemplateNames = [];

    if (selectedSheetUids && selectedSheetUids.length > 0) {
        const allTemplates = BASE.SheetTemplate().loadAllUserTemplates();
        for (const uid of selectedSheetUids) {
            const template = allTemplates.find(t => t.uid === uid);
            if (template) {
                selectedTemplateNames.push(template.name);
            }
        }
    }

    // 清空 Drag 区域
    $(drag.render).find('#tableContainer').empty();

    // 添加已选择模板的名称到 Drag 区域
    const container = $(drag.render).find('#tableContainer');
    if (selectedTemplateNames.length > 0) {
        container.append(`<p>已选择的表格模板：${selectedTemplateNames.join(', ')}</p>`);
    } else {
        container.append(`<p>未选择任何表格模板</p>`);
    }
}

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

    // userSheetEditInfo.editAble = findNextChatWhitTableData(mesId).index === -1

    // 添加初始化下拉多选表格模板
    dropdownElement = await updateDropdownElement()
    $(tableEditTips).after(dropdownElement)
    initializeSelect2Dropdown(dropdownElement);

    // 添加拖拽空间表格
    $(contentContainer).empty()
    drag = new EDITOR.Drag();
    contentContainer.append(drag.render);
    drag.add('tableContainer', tableContainer);
    // drag.add('tableHeaderToolbar', tableHeaderToolbar[0]);

    // 获取最新表格数据并渲染（该方法为旧版本，待移除）
    const { tables, index } = findLastestTableData(true, mesId)
    userSheetEditInfo.chatIndex = index
    userSheetEditInfo.tables = tables

    renderSheetsDOM(userSheetEditInfo.tables, tableContainer, userSheetEditInfo.editAble)
    tables[0].cellClickEvent(callback => {
        console.log(callback)
    })


    if (!userSheetEditInfo.editAble) {
        $('#contentContainer #paste_table_button').hide();
    } else {
        $('#contentContainer #paste_table_button').show();
    }

    // 设置编辑提示
    // 点击添加表格模板
    $(document).on('click', '#add_table_template_button', function () {
        BASE.SheetTemplate().createNew();
        updateDropdownElement();
        // 选择新创建的模板并更新表格
        const newTemplateUid = BASE.SheetTemplate().loadAllUserTemplates().slice(-1)[0].uid; // 获取最新模板的 UID
        USER.getSettings().tableEditorSelectedSheets = [newTemplateUid];
        USER.saveSettings();
        $(dropdownElement).val([newTemplateUid]).trigger('change');
    });
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
        BASE.SheetTemplate().destroyAll()
        updateDropdownElement();
        // 清空选择并更新表格
        USER.getSettings().tableEditorSelectedSheets = [];
        USER.saveSettings();
        $(dropdownElement).val([]).trigger('change');
    });

    // 初始更新表格
    updateDragTables();

    return table_editor_container;
}

export async function getEditView(mesId = -1) {
    return table_editor_container || await initTableEdit(mesId);
}
