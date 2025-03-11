// tableTemplateEditView.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import { PopupMenu } from '../methods/popupMenu.js';
import { Form } from '../methods/formManager.js';
import {openTableRendererPopup} from "./sheetStyleEditor.js";

const userSheetEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}
let drag = null;
let currentPopupMenu = null;
let dropdownElement = null;
const renderedTables = new Map();

const formConfigs = {
    sheet_origin: {
        formTitle: "编辑表格",
        formDescription: "单表格的整体设置。",
        fields: [

        ]
    },
    column_header: {
        formTitle: "编辑列",
        formDescription: "设置列的标题和描述信息。",
        fields: [
            { label: '列标题', id: 'dataTable_columnSetting_columnName', type: 'text', dataKey: 'columnName' },
            { label: '列描述', description: '(给AI解释此列的作用)', id: 'dataTable_columnSetting_note', type: 'textarea', dataKey: 'columnNote' },
            { label: '数据类型', id: 'dataTable_columnSetting_dataType', type: 'select', dataKey: 'columnDataType', options: ['text', 'number', 'date', 'select'] },
        ],
    },
    row_header: {
        formTitle: "编辑行",
        formDescription: "设置行的标题和描述信息。",
        fields: [
            { label: '行标题', id: 'dataTable_rowSetting_rowName', type: 'text', dataKey: 'rowName' },
            { label: '行描述', description: '(给AI解释此行的作用)', id: 'dataTable_rowSetting_note', type: 'textarea', dataKey: 'rowNote' },
        ],
    },
    cell: {
        formTitle: "编辑单元格",
        formDescription: "编辑单元格的具体内容。",
        fields: [
            { label: '单元格内容', id: 'dataTable_cellSetting_content', type: 'textarea', dataKey: 'cellContent' },
            { label: '单元格描述', description: '(给AI解释此单元格内容的作用)', id: 'dataTable_cellSetting_note', type: 'textarea', dataKey: 'cellNote' },
        ],
    },
    sheetConfig: {
        formTitle: "编辑表格属性",
        formDescription: "设置表格的域、类型和名称。",
        fields: [
            {
                label: '域', id: 'dataTable_sheetSetting_domain', type: 'select', dataKey: 'domain',
                options: [
                    { value: 'global', text: `<i class="fa-solid fa-earth-asia"></i> Global（该模板储存于用户数据中）` },
                    { value: 'role', text: `<i class="fa-solid fa-user-tag"></i> Role（该模板储存于当前所选角色）` },
                    { value: 'chat', text: `<i class="fa-solid fa-comment"></i> Chat（该模板储存于当前对话）` },
                ],
            },
            {
                label: '类型', id: 'dataTable_sheetSetting_type', type: 'select', dataKey: 'type',
                options: [
                    { value: 'free', text: `<i class="fa-solid fa-table"></i> Free（AI 可以任意修改此表格）` },
                    { value: 'dynamic', text: `<i class="fa-solid fa-arrow-down-wide-short"></i> Dynamic（AI 可进行插入列外的所有操作）` },
                    { value: 'fixed', text: `<i class="fa-solid fa-thumbtack"></i> Fixed（AI 无法删除或插入行与列）` },
                    { value: 'static', text: `<i class="fa-solid fa-link"></i> Static（该表对 AI 为只读）` }
                ],
            },
            { label: '表格名', id: 'dataTable_sheetSetting_tableName', type: 'text', dataKey: 'name' },
            { label: '推送至对话', description: '(开启时将该表格推送至对话)', id: 'dataTable_tableSetting_toChat', type: 'checkbox', dataKey: 'tableToChat' },
            // { label: '推送样式', description: '(编辑推送至对话的表格样式)', id: 'dataTable_tableSetting_tableRender', type: 'textarea', dataKey: 'tableRender' },
            // {
            //     type: 'button',
            //     id: 'renderButtonStyleButton',
            //     iconClass: 'fa-solid fa-bug tableEditor_renderButton',
            //     text: '在测试模式中编辑本表格样式',
            //     event: 'editRenderStyleEvent'
            // }
        ],
    },
    sheetSetting: {
        formTitle: "编辑表格整体提示词",
        formDescription: "表格的整体提示词，用于向AI解释表格的作用。",
        fields: [
            // { label: '表格名', id: 'dataTable_tableSetting_tableName', type: 'text', dataKey: 'tableName' },
            { label: '表格说明', description: '(给AI解释此表格的作用)', id: 'dataTable_tableSetting_note', type: 'textarea', dataKey: 'tableNote' },
            { label: '是否必填', id: 'dataTable_tableSetting_required', type: 'checkbox', dataKey: 'tableRequired' },
            { label: '初始化提示词', description: '(当表格为必填表时，但是又为空时，给AI的提示)', id: 'dataTable_tableSetting_initNode', type: 'textarea', dataKey: 'tableInitNode' },
            // { label: '插入提示词', description: '(解释什么时候应该插入行)', id: 'dataTable_tableSetting_insertNode', type: 'textarea', dataKey: 'tableInsertNode' },
            // { label: '更新提示词', description: '(解释什么时候应该更新行)', id: 'dataTable_tableSetting_updateNode', type: 'textarea', dataKey: 'tableUpdateNode' },
            // { label: '删除提示词', description: '(解释什么时候应该删除行)', id: 'dataTable_tableSetting_deleteNode', type: 'textarea', dataKey: 'tableDeleteNode' },
        ]
    },
};


async function updateDropdownElement() {
    const templates = BASE.loadUserAllTemplates();
    if (dropdownElement === null) {
        dropdownElement = document.createElement('select');
        dropdownElement.id = 'table_template';
        dropdownElement.classList.add('select2_multi_sameline', 'select2_choice_clickable', 'select2_choice_clickable_buttonstyle');
        dropdownElement.multiple = true;
    }
    dropdownElement.innerHTML = '';
    for (const t of templates) {
        const optionElement = document.createElement('option');
        optionElement.value = t.uid;
        optionElement.textContent = t.name;
        dropdownElement.appendChild(optionElement);
    }

    return dropdownElement;
}

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

    $(dropdownElement).on('change', function () {
        USER.getSettings().table_database_templates_selected = $(this).val();
        USER.saveSettings();
        updateDragTables();
    });

    let selectedSheets = USER.getSettings().table_database_templates_selected;
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


function getSheetTitle(sheet) {
    const titleBar = document.createElement('div');
    titleBar.className = 'table-title-bar';
    titleBar.style.display = 'flex';
    titleBar.style.alignItems = 'center';
    titleBar.style.minWidth = '500px';
    titleBar.style.gap = '5px';
    titleBar.style.color = 'var(--SmartThemeEmColor)';
    titleBar.style.fontSize = '0.8rem';
    titleBar.style.fontWeight = 'normal';

    const settingButton = $(`<i class="menu_button menu_button_icon fa-solid fa-wrench" style="cursor: pointer; height: 28px; width: 28px;" title="编辑表格属性"></i>`);
    settingButton.on('click', async () => {
        const initialData = {
            domain: sheet.domain,
            type: sheet.type,
            name: sheet.name
        };
        const formInstance = new Form(formConfigs.sheetConfig, initialData);
        const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, { large: false }, { okButton: "保存", cancelButton: "取消" });

        await popup.show();
        if (popup.result) {
            const formData = formInstance.getFormData();
            const diffData = {};
            Object.keys(formData).forEach(key => {
                if (formData[key] !== initialData[key]) {
                    diffData[key] = formData[key];
                }
            });
            if (Object.keys(diffData).length > 0) {
                sheet.editProps(diffData);
                const nameSpan = titleBar.querySelector('span');
                if (nameSpan) {
                    nameSpan.textContent = sheet.name ? sheet.name : 'Unnamed Table';
                }
            }
        }
    });
    const originButton = $(`<i class="menu_button menu_button_icon fa-solid fa-pen" style="cursor: pointer; height: 28px; width: 28px;" title="编辑表格属性"></i>`);
    originButton.on('click', async () => {
        const initialData = {

        };
        const formInstance = new Form(formConfigs.sheetSetting, initialData);
        const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, { large: false }, { okButton: "保存", cancelButton: "取消" });

        await popup.show();
        if (popup.result) {

        }
    })
    const styleButton = $(`<i class="menu_button menu_button_icon fa-solid fa-swatchbook" style="cursor: pointer; height: 28px; width: 28px;" title="编辑表格显示样式"></i>`);
    styleButton.on('click', async () => {
        // if (sheet.type !== 'fixed' || sheet.type !== 'static') {
        //     EDITOR.warning('只有 fixed 与 static 表格才可以编辑样式');
        //     return;
        // }
        openTableRendererPopup(sheet);
    })
    const nameSpan = $(`<span style="margin-left: 0px;">${sheet.name ? sheet.name : 'Unnamed Table'}</span>`);

    titleBar.appendChild(settingButton[0]);
    titleBar.appendChild(originButton[0]);
    titleBar.appendChild(styleButton[0]);
    titleBar.appendChild(nameSpan[0]);

    return titleBar;
}

async function templateCellDataEdit(cell) {
    const initialData = {...cell.data};
    const formInstance = new Form(formConfigs[cell.type], initialData);

    formInstance.on('editRenderStyleEvent', (formData) => {
        alert('编辑表格样式功能待实现' + JSON.stringify(formData));
    });


    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, { large: true, allowVerticalScrolling: true }, { okButton: "保存修改", cancelButton: "取消" });

    await popup.show();
    if (popup.result) {
        const formData = formInstance.getFormData();
        const diffData = {};
        Object.keys(formData).forEach(key => {
            if (formData[key] !== initialData[key]) {
                diffData[key] = formData[key];
            }
        });

        if (Object.keys(diffData).length === 0) {
            return;
        }
        cell.editProps(diffData);
    }
}


async function updateDragTables() {
    if (!drag) return;

    const selectedSheetUids = USER.getSettings().table_database_templates_selected || [];
    const container = $(drag.render).find('#tableContainer');

    if (currentPopupMenu) {
        currentPopupMenu.destroy();
        currentPopupMenu = null;
    }

    const renderedTableUids = Array.from(renderedTables.keys());
    const uidsToRemove = renderedTableUids.filter(uid => !selectedSheetUids.includes(uid));
    uidsToRemove.forEach(uid => {
        const tableElement = renderedTables.get(uid);
        if (tableElement) {
            if (drag.dragSpace.contains(tableElement)) {
                drag.dragSpace.removeChild(tableElement);
            }
            renderedTables.delete(uid);
            if (container.has(tableElement)) {
                container.empty();
            }
        }
    });

    const uidsToAdd = selectedSheetUids.filter(uid => !renderedTableUids.includes(uid));
    const uidsToUpdate = selectedSheetUids.filter(uid => renderedTableUids.includes(uid));

    let isFirstTable = true; // 添加一个标志来判断是否是第一个表格

    for (const uid of uidsToAdd) {
        let sheet = new BASE.Sheet(uid, true);
        sheet.currentPopupMenu = currentPopupMenu;

        if (!sheet || !sheet.cellSheet) {
            console.warn(`无法加载模板或模板数据为空，UID: ${uid}`);
            continue;
        }

        const cellEventHandler = (cell) => {
            cell.element.addEventListener('click', async (event) => {
                event.stopPropagation();
                if (cell.parent.currentPopupMenu) {
                    cell.parent.currentPopupMenu.destroy();
                    cell.parent.currentPopupMenu = null;
                }
                cell.parent.currentPopupMenu = new PopupMenu();

                const [rowIndex, colIndex] = cell.position;

                if (rowIndex === 0 && colIndex === 0) {
                    // cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑表头', async (e) => { await templateCellDataEdit(cell) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> 向右插入列', (e) => { cell.newAction(cell.CellAction.insertRightColumn) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { cell.newAction(cell.CellAction.insertDownRow) });
                } else if (rowIndex === 0) {
                    cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该列', async (e) => { await templateCellDataEdit(cell) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-left"></i> 向左插入列', (e) => { cell.newAction(cell.CellAction.insertLeftColumn) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> 向右插入列', (e) => { cell.newAction(cell.CellAction.insertRightColumn) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> 删除列', (e) => { cell.newAction(cell.CellAction.deleteSelfColumn) });
                } else if (colIndex === 0) {
                    cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该行', async (e) => { await templateCellDataEdit(cell) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-up"></i> 向上插入行', (e) => { cell.newAction(cell.CellAction.insertUpRow) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { cell.newAction(cell.CellAction.insertDownRow) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> 删除行', (e) => { cell.newAction(cell.CellAction.deleteSelfRow) });
                } else {
                    cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该单元格', async (e) => { await templateCellDataEdit(cell) });
                }

                const rect = cell.element.getBoundingClientRect();
                const dragSpaceRect = drag.dragSpace.getBoundingClientRect();
                let popupX = rect.left - dragSpaceRect.left;
                let popupY = rect.top - dragSpaceRect.top;
                popupX /= drag.scale;
                popupY /= drag.scale;
                popupY += rect.height / drag.scale;

                drag.add('menu', cell.parent.currentPopupMenu.render());
                cell.parent.currentPopupMenu.show(popupX, popupY);
            });
        };


        const tableElement = sheet.render(cellEventHandler);
        tableElement.style.marginLeft = '5px'
        renderedTables.set(uid, tableElement);
        container.append(tableElement);
        drag.dragSpace.appendChild(tableElement);

        // 在添加表格后，添加 hr 元素
        const hr = document.createElement('hr');
        drag.dragSpace.appendChild(hr);


        const captionElement = document.createElement('caption');
        captionElement.appendChild(getSheetTitle(sheet));
        if (tableElement.querySelector('caption')) {
            tableElement.querySelector('caption').replaceWith(captionElement);
        } else {
            tableElement.insertBefore(captionElement, tableElement.firstChild);
        }
    }

    for (const uid of uidsToUpdate) {
        const tableElement = renderedTables.get(uid);
        if (tableElement) {
            let sheet = new BASE.Sheet(uid, true);
            const captionElement = document.createElement('caption');
            captionElement.appendChild(getSheetTitle(sheet));
            const existingCaption = tableElement.querySelector('caption');
            if (existingCaption) {
                existingCaption.replaceWith(captionElement);
            } else {
                tableElement.insertBefore(captionElement, tableElement.firstChild);
            }
        }
    }
    // 如果没有表格显示，重置 isFirstTable 标志，避免下次添加表格时错误判断
    if (selectedSheetUids.length === 0) {
        isFirstTable = true;
    }
}


async function initTableEdit(mesId) {
    const table_editor_container = await SYSTEM.htmlToDom(await SYSTEM.getComponent('editor'), 'table_editor_container');
    const tableEditTips = table_editor_container.querySelector('#tableEditTips');
    const tableContainer = table_editor_container.querySelector('#tableContainer');
    const contentContainer = table_editor_container.querySelector('#contentContainer');

    dropdownElement = await updateDropdownElement()
    $(tableEditTips).after(dropdownElement)
    initializeSelect2Dropdown(dropdownElement);

    $(contentContainer).empty()
    drag = new EDITOR.Drag();
    contentContainer.append(drag.render);
    drag.add('tableContainer', tableContainer);


    if (!userSheetEditInfo.editAble) {
        $('#contentContainer #paste_table_button').hide();
    } else {
        $('#contentContainer #paste_table_button').show();
    }

    $(document).on('click', '#add_table_template_button', async function () {
        const newTemplate = new BASE.Sheet('', true).createNew();
        const newTemplateUid = newTemplate.uid;

        let currentSelectedValues = $(dropdownElement).val();
        if (!currentSelectedValues) {
            currentSelectedValues = [];
        }
        if (!Array.isArray(currentSelectedValues)) {
            currentSelectedValues = [currentSelectedValues];
        }

        currentSelectedValues.push(newTemplateUid);

        USER.getSettings().table_database_templates_selected = currentSelectedValues;
        USER.saveSettings();
        await updateDropdownElement();
        updateDragTables();
        $(dropdownElement).val(currentSelectedValues).trigger('change');
    });
    $(document).on('click', '#sort_table_template_button', function () {

    })
    $(document).on('click', '#import_table_template_button', function () {

    })
    $(document).on('click', '#export_table_template_button', function () {

    })

    $(document).on('click', '#table_template_history_button', function () {

    })
    $(document).on('click', '#destroy_table_template_button', async function () {
        BASE.destroyAllTemplates()
        await updateDropdownElement();
        $(dropdownElement).val([]).trigger('change');
        updateDragTables();
    });

    updateDragTables();

    return table_editor_container;
}

export async function getEditView(mesId = -1) {
    return table_editor_container || await initTableEdit(mesId);
}
