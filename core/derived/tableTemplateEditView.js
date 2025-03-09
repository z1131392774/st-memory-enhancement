// tableTemplateEditView.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import { PopupMenu } from '../source/popupMenu.js';

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
const renderedTables = new Map(); // 用于存储已渲染的表格元素，key 为 sheet UID


/**
 * 创建多选下拉框
 * @returns {Promise<HTMLSelectElement|null>}
 */
async function updateDropdownElement() {
    const templates = BASE.loadUserAllTemplates();
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
        USER.getSettings().table_database_templates_selected = $(this).val();
        USER.saveSettings();
        updateDragTables();     // 触发更新表格
    });

    // 初始化时恢复选项
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

/**
 * 获取表格标题 HTML
 * @param {Sheet} sheet - Sheet 实例
 * @returns {string} - 表格标题 HTML 字符串
 */
function getSheetTitle(sheet) {
    const domainIcons = {
        [sheet.SheetDomain.global]: `<i class="fa-solid fa-earth-asia"></i> `,
        [sheet.SheetDomain.role]: `<i class="fa-solid fa-user-tag"></i> `,
        [sheet.SheetDomain.chat]: `<i class="fa-solid fa-comment"></i> `,
    };
    const typeIcons = {
        [sheet.SheetType.free]: `<i class="fa-solid fa-shuffle"></i><br> `,
        [sheet.SheetType.dynamic]: `<i class="fa-solid fa-arrow-down-wide-short"></i><br> `,
        [sheet.SheetType.fixed]: `<i class="fa-solid fa-thumbtack"></i><br> `,
        [sheet.SheetType.static]: `<i class="fa-solid fa-link"></i><br> `,
    };
    return  `<div style="color: var(--SmartThemeEmColor)">
        ${domainIcons[sheet.domain] || ''}
        ${typeIcons[sheet.type] || ''}
        <small style="font-size: 0.8rem; font-weight: normal; color: var(--SmartThemeEmColor)">
            ${sheet.name ? sheet.name : 'Unnamed Table'}
        </small>
    </div>`;
}


/**
 * 根据已选择的表格模板更新 Drag 区域的表格
 */
async function updateDragTables() {
    if (!drag) return;

    const selectedSheetUids = USER.getSettings().table_database_templates_selected;
    const container = $(drag.render).find('#tableContainer');

    if (currentPopupMenu) { // 关闭之前的菜单
        currentPopupMenu.destroy();
        currentPopupMenu = null;
    }

    container.empty();

    if (!selectedSheetUids || selectedSheetUids.length === 0) {
        // 如果没有选择任何表格模板，则显示提示信息
        container.append(`<p>未选择任何表格模板</p>`);
        renderedTables.forEach((tableElement) => { // 移除 dragSpace 中的表格元素
            if (drag.dragSpace.contains(tableElement)) {
                drag.dragSpace.removeChild(tableElement);
            }
        });
        renderedTables.clear();
        return;
    }

    // 获取当前已渲染表格的 UID 列表
    const renderedTableUids = Array.from(renderedTables.keys()); // 获取当前已渲染表格的 UID 列表
    const uidsToRemove = renderedTableUids.filter(uid => !selectedSheetUids.includes(uid)); // 找出需要移除的 UID (已渲染但未被选中的 UID)

    uidsToRemove.forEach(uid => {
        const tableElement = renderedTables.get(uid);
        if (tableElement) {
            if (drag.dragSpace.contains(tableElement)) {
                drag.dragSpace.removeChild(tableElement); // 从 dragSpace 中移除表格元素
            }
            renderedTables.delete(uid); // 从 renderedTables 缓存中移除
        }
    });

    for (const uid of selectedSheetUids) {
        let sheet = new BASE.Sheet(uid, true);
        sheet.currentPopupMenu = currentPopupMenu;

        if (!sheet || !sheet.cellSheet) {
            console.warn(`无法加载模板或模板数据为空，UID: ${uid}`);
            continue;
        }

        // 单元格事件处理函数
        const cellEventHandler = (cell) => {
            cell.element.addEventListener('click', (event) => {
                event.stopPropagation();
                if (cell.parent.currentPopupMenu) {
                    cell.parent.currentPopupMenu.destroy();
                    cell.parent.currentPopupMenu = null;
                }
                cell.parent.currentPopupMenu = new PopupMenu();

                // 获取当前单元格的行列索引
                const [rowIndex, colIndex] = cell.position;

                if (rowIndex === 0 && colIndex === 0) {
                    cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑表头', (e) => { cell.newAction(cell.CellAction.editCell) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> 向右插入列', (e) => { cell.newAction(cell.CellAction.insertRightColumn) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { cell.newAction(cell.CellAction.insertDownRow) });
                } else if (rowIndex === 0) {
                    cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该列', (e) => { cell.newAction(cell.CellAction.editCell) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-left"></i> 向左插入列', (e) => { cell.newAction(cell.CellAction.insertLeftColumn) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> 向右插入列', (e) => { cell.newAction(cell.CellAction.insertRightColumn) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> 删除列', (e) => { cell.newAction(cell.CellAction.deleteSelfColumn) });
                } else if (colIndex === 0) {
                    cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该行', (e) => { cell.newAction(cell.CellAction.editCell) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-up"></i> 向上插入行', (e) => { cell.newAction(cell.CellAction.insertUpRow) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { cell.newAction(cell.CellAction.insertDownRow) });
                    cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> 删除行', (e) => { cell.newAction(cell.CellAction.deleteSelfRow) });
                } else {
                    cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该单元格', (e) => { cell.newAction(cell.CellAction.editCell) });
                }

                // 计算菜单弹出位置
                const rect = cell.element.getBoundingClientRect();
                const dragSpaceRect = drag.dragSpace.getBoundingClientRect();
                let popupX = rect.left - dragSpaceRect.left;
                let popupY = rect.top - dragSpaceRect.top;
                popupX /= drag.scale;
                popupY /= drag.scale;
                popupY += rect.height / drag.scale;

                drag.addToTop('menu', cell.parent.currentPopupMenu.render());
                cell.parent.currentPopupMenu.show(popupX, popupY);
            });
        };

        // 更新表格内容
        let tableElement = renderedTables.get(uid);
        if (tableElement) {
            // 如果表格已存在，则更新表格内容
            sheet.render(cellEventHandler); // 重新渲染表格内容和事件，传递新的 cellEventHandler
        } else {
            // 如果表格不存在，则创建新的表格
            tableElement = sheet.render(cellEventHandler);
            renderedTables.set(uid, tableElement);
            container.append(tableElement); // 添加到容器中
            drag.dragSpace.appendChild(tableElement); // 推入 dragSpace
        }
        // **[新增]：在表格渲染后，获取标题 HTML 并插入到 caption 元素**
        const captionElement = document.createElement('caption');
        captionElement.innerHTML = getSheetTitle(sheet); // 调用新的 getSheetTitle 函数
        if (tableElement.querySelector('caption')) {
            tableElement.querySelector('caption').replaceWith(captionElement); // 如果 caption 已存在，则替换
        } else {
            tableElement.insertBefore(captionElement, tableElement.firstChild); // 否则插入到表格的第一个子元素之前
        }
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
    $(document).on('click', '#add_table_template_button', async function () {
        const newTemplate = new BASE.Sheet('', true).createNew();
        const newTemplateUid = newTemplate.uid;

        // 获取当前 select2 选中的值 (数组)
        let currentSelectedValues = $(dropdownElement).val();
        if (!currentSelectedValues) { // 如果当前没有选中任何值，则初始化为空数组
            currentSelectedValues = [];
        }
        if (!Array.isArray(currentSelectedValues)) { // 确保 currentSelectedValues 是数组
            currentSelectedValues = [currentSelectedValues];
        }

        // 将新的模板 UID 添加到已选值数组中
        currentSelectedValues.push(newTemplateUid);

        USER.getSettings().table_database_templates_selected = currentSelectedValues;
        USER.saveSettings();
        await updateDropdownElement(); // 等待下拉框更新完成
        await updateDragTables(); // 调用 updateDragTables 更新表格
        $(dropdownElement).val(currentSelectedValues).trigger('change'); // 设置 select2 的值为更新后的数组
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
    $(document).on('click', '#destroy_table_template_button', async function () {
        BASE.destroyAllTemplates()
        await updateDropdownElement(); // 等待下拉框更新完成
        // 刷新表格
        $(dropdownElement).val([]).trigger('change');
        updateDragTables();
    });

    // 初始更新表格
    updateDragTables();

    return table_editor_container;
}

export async function getEditView(mesId = -1) {
    return table_editor_container || await initTableEdit(mesId);
}
