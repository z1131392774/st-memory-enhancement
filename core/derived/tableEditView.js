// tableEditView.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import { findLastestTableData } from "../../index.js";
import { PopupMenu } from '../source/popupMenu.js'; // Corrected import path

const userSheetEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}
let drag = null;
let currentPopupMenu = null; // 用于跟踪当前弹出的菜单

let dropdownElement = null;

// Helper function to convert column index to letter (A, B, C...)
function getColumnLetter(colIndex) {
    let letter = '';
    let num = colIndex;
    while (num >= 0) {
        letter = String.fromCharCode('A'.charCodeAt(0) + (num % 26)) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
}


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
    const container = $(drag.render).find('#tableContainer');

    // 清空 Drag 区域
    container.empty();
    if (currentPopupMenu) { // 关闭之前的菜单
        currentPopupMenu.destroy();
        currentPopupMenu = null;
    }

    if (!selectedSheetUids || selectedSheetUids.length === 0) {
        container.append(`<p>未选择任何表格模板</p>`);
        return;
    }

    // Add CSS styles directly to the component for borders and dimensions
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .drag-table { border-collapse: collapse; width: max-content; } /* Set table width to max-content */
        .drag-table caption { text-align: left; padding-bottom: 5px; font-weight: bold; caption-side: top; } /* Caption at the top */
        .drag-header-cell-top { text-align: center; border: 1px solid #ccc; padding: 2px; font-weight: bold; } /* Top header style */
        .drag-header-cell-left { text-align: center; border: 1px solid #ccc; padding: 2px; font-weight: bold; } /* Left header style */
        .drag-cell { border: 1px solid #ccc; padding: 2px; min-width: 50px; min-height: 20px; text-align: center; vertical-align: middle; } /* Cell style with center alignment and min dimensions */
    `;
    drag.dragSpace.appendChild(styleElement);


    for (const uid of selectedSheetUids) {
        const sheet = BASE.SheetTemplate(uid); // 加载选中的 SheetTemplate

        if (!sheet || !sheet.cellSheet) {
            console.warn(`无法加载模板或模板数据为空，UID: ${uid}`);
            continue;
        }

        const tableElement = document.createElement('table');
        tableElement.classList.add('drag-table'); // Add style class
        tableElement.style.position = 'relative'; // Ensure relative positioning for caption

        const captionElement = document.createElement('caption');
        captionElement.textContent = sheet.name || "Unnamed Table"; // Display table name
        tableElement.appendChild(captionElement);


        sheet.cellSheet.forEach((rowUids, rowIndex) => {
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                const cellElement = document.createElement('td');
                cellElement.classList.add('drag-cell');

                if (rowIndex === 0 && colIndex === 0) {
                    // Origin Cell [0, 0] - leave textContent empty
                } else if (rowIndex === 0) {
                    cellElement.textContent = getColumnLetter(colIndex - 1); // Column headers (A, B, C...)
                    cellElement.classList.add('drag-header-cell-top'); // Apply top header style
                    cellElement.style.height = '15px'; // Set header height
                } else if (colIndex === 0) {
                    cellElement.textContent = rowIndex; // Row headers (1, 2, 3...)
                    cellElement.classList.add('drag-header-cell-left'); // Apply left header style
                    cellElement.style.width = '20px'; // Set header width
                } else {
                    // Other cells - leave textContent empty
                }


                // --- Debugging Start ---
                cellElement.addEventListener('click', (event) => {
                    event.stopPropagation();

                    if (currentPopupMenu) {
                        currentPopupMenu.destroy();
                        currentPopupMenu = null;
                    }

                    currentPopupMenu = new PopupMenu();
                    currentPopupMenu.add('Insert Row Above', () => { console.log('Insert Row Above at row:', rowIndex, 'col:', colIndex, 'cellUid:', cellUid); });
                    currentPopupMenu.add('Insert Row Below', () => { console.log('Insert Row Below at row:', rowIndex, 'col:', colIndex, 'cellUid:', cellUid); });
                    currentPopupMenu.add('Insert Column Left', () => { console.log('Insert Column Left at row:', rowIndex, 'col:', colIndex, 'cellUid:', cellUid); });
                    currentPopupMenu.add('Insert Column Right', () => { console.log('Insert Column Right at row:', rowIndex, 'col:', colIndex, 'cellUid:', cellUid); });
                    currentPopupMenu.add('Delete Row', () => { console.log('Delete Row at row:', rowIndex, 'col:', colIndex, 'cellUid:', cellUid); });
                    currentPopupMenu.add('Delete Column', () => { console.log('Delete Column at row:', rowIndex, 'col:', colIndex, 'cellUid:', cellUid); });
                    currentPopupMenu.add('Edit Cell', () => { console.log('Edit Cell at row:', rowIndex, 'col:', colIndex, 'cellUid:', cellUid); });

                    const rect = cellElement.getBoundingClientRect();
                    const dragSpaceRect = drag.dragSpace.getBoundingClientRect();

                    let popupX = rect.left - dragSpaceRect.left;
                    let popupY = rect.top - dragSpaceRect.top;

                    // Apply inverse scaling
                    popupX /= drag.scale;
                    popupY /= drag.scale;

                    // Adjust vertical position to align with bottom-left of cell
                    popupY += rect.height / drag.scale;

                    currentPopupMenu.render(drag.dragSpace);
                    currentPopupMenu.show(popupX, popupY);
                });
                // --- Debugging End ---

                rowElement.appendChild(cellElement);
            });
            tableElement.appendChild(rowElement);
        });
        container.append(tableElement);
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


    if (!userSheetEditInfo.editAble) {
        $('#contentContainer #paste_table_button').hide();
    } else {
        $('#contentContainer #paste_table_button').show();
    }

    // 设置编辑提示
    // 点击添加表格模板
    $(document).on('click', '#add_table_template_button', async function () { // 修改为 async
        const newTemplate = BASE.SheetTemplate().createNew(); // 直接使用 SheetTemplate().createNew() 创建模板
        await updateDropdownElement(); // 等待下拉框更新完成
        // 选择新创建的模板并更新表格
        const newTemplateUid = newTemplate.uid; // 从新创建的模板实例中获取 UID
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
    $(document).on('click', '#destroy_table_template_button', async function () { // 修改为 async
        BASE.SheetTemplate().destroyAll()
        await updateDropdownElement(); // 等待下拉框更新完成
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
