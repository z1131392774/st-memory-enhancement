import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../manager.js';
import {updateSystemMessageTableStatus} from "../renderer/tablePushToChat.js";
import {findNextChatWhitTableData,} from "../../index.js";
import {rebuildSheets} from "../runtime/absoluteRefresh.js";
import {openTableHistoryPopup} from "./tableHistory.js";
import {PopupMenu} from "../../components/popupMenu.js";

let tablePopup = null
let copyTableData = null
let selectedCell = null
let editModeSelectedRows = []
let viewSheetsContainer = null
const userTableEditInfo = {
    chatIndex: null,
    editAble: false,
    tables: null,
    tableIndex: null,
    rowIndex: null,
    colIndex: null,
}

/**
 * 复制表格
 * @param {*} tables 所有表格数据
 */
export async function copyTable(tables = []) {
    copyTableData = JSON.stringify(tables)
    const text = `正在复制表格数据 (#${SYSTEM.generateRandomString(4)})`
    $('#table_drawer_icon').click()

    EDITOR.confirm(text, '取消', '粘贴到当前对话').then(async (r) => {
        if (r) {
            await pasteTable(userTableEditInfo.chatIndex, viewSheetsContainer)
        }
        if ($('#table_drawer_icon').hasClass('closedIcon')) {
            $('#table_drawer_icon').click()
        }
    })
}

/**
 * 粘贴表格
 * @param {number} mesId 需要粘贴到的消息id
 * @param {Element} viewSheetsContainer 表格容器DOM
 */
async function pasteTable(mesId, viewSheetsContainer) {
    if (mesId === -1) {
        EDITOR.error("请至少让ai回复一条消息作为表格载体")
        return
    }
    const confirmation = await EDITOR.callGenericPopup('粘贴会清空原有的表格数据，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        if (copyTableData) {
            throw new Error('未实现该方法')
            // const tables = JSON.parse(copyTableData)
            // checkPrototype(tables)
            // USER.getContext().chat[mesId].dataTable = tables
            // renderTablesDOM(tables, viewSheetsContainer, true)
            // updateSystemMessageTableStatus();
            // EDITOR.success('粘贴成功')
        } else {
            EDITOR.error("粘贴失败：剪切板没有表格数据")
        }
    }
}

// /**
//  * 导入表格
//  * @param {number} mesId 需要导入表格的消息id
//  */
// async function importTable(mesId, viewSheetsContainer) {
//     if (mesId === -1) {
//         EDITOR.error("请至少让ai回复一条消息作为表格载体")
//         return
//     }
//
//     // 1. 创建一个 input 元素，类型设置为 'file'，用于文件选择
//     const fileInput = document.createElement('input');
//     fileInput.type = 'file';
//     // 设置 accept 属性，限制只能选择 JSON 文件，提高用户体验
//     fileInput.accept = '.json';
//
//     // 2. 添加事件监听器，监听文件选择的变化 (change 事件)
//     fileInput.addEventListener('change', function(event) {
//         // 获取用户选择的文件列表 (FileList 对象)
//         const files = event.target.files;
//
//         // 检查是否选择了文件
//         if (files && files.length > 0) {
//             // 获取用户选择的第一个文件 (这里假设只选择一个 JSON 文件)
//             const file = files[0];
//
//             // 3. 创建 FileReader 对象，用于读取文件内容
//             const reader = new FileReader();
//
//             // 4. 定义 FileReader 的 onload 事件处理函数
//             // 当文件读取成功后，会触发 onload 事件
//             reader.onload = function(loadEvent) {
//                 // loadEvent.target.result 包含了读取到的文件内容 (文本格式)
//                 const fileContent = loadEvent.target.result;
//
//                 try {
//                     throw new Error('未实现该方法')
//                     // // 5. 尝试解析 JSON 数据
//                     // const tables = JSON.parse(fileContent)
//                     // checkPrototype(tables)
//                     // USER.getContext().chat[mesId].dataTable = tables
//                     // renderTablesDOM(tables, viewSheetsContainer, true)
//                     // updateSystemMessageTableStatus();
//                     // EDITOR.success('导入成功')
//                 } catch (error) {
//                     // 7. 捕获 JSON 解析错误，并打印错误信息
//                     console.error("JSON 解析错误:", error);
//                     alert("JSON 文件解析失败，请检查文件格式是否正确。");
//                 }
//             };
//
//             reader.readAsText(file, 'UTF-8'); // 建议指定 UTF-8 编码，确保中文等字符正常读取
//         }
//     });
//     fileInput.click();
// }
//
// /**
//  * 导出表格
//  * @param {Array} tables 所有表格数据
//  */
// async function exportTable(tables = []) {
//     if (!tables || tables.length === 0) {
//         EDITOR.warning('当前表格没有数据，无法导出');
//         return;
//     }
//
//     const jsonTables = JSON.stringify(tables, null, 2); // 使用 2 空格缩进，提高可读性
//     const blob = new Blob([jsonTables], { type: 'application/json' });
//     const url = URL.createObjectURL(blob);
//     const downloadLink = document.createElement('a');
//     downloadLink.href = url;
//     downloadLink.download = 'table_data.json'; // 默认文件名
//     document.body.appendChild(downloadLink); // 必须添加到 DOM 才能触发下载
//     downloadLink.click();
//     document.body.removeChild(downloadLink); // 下载完成后移除
//
//     URL.revokeObjectURL(url); // 释放 URL 对象
//
//     EDITOR.success('已导出');
// }

/**
 * 清空表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} viewSheetsContainer 表格容器DOM
 */
async function clearTable(mesId, viewSheetsContainer) {
    if (mesId === -1) return
    const confirmation = await EDITOR.callGenericPopup('清空当前对话的所有表格数据，并重置历史记录，该操作无法回退，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        delete USER.getSettings().table_database_templates
        delete USER.getChatMetadata().sheets
        USER.saveSettings()
        USER.saveChat();
        EDITOR.success("表格数据清除成功")
        console.log("已清除表格数据")
    }
}

/**
 * 设置表格编辑Tips
 * @param {Element} tableEditTips 表格编辑提示DOM
 */
function setTableEditTips(tableEditTips) {
    if (!tableEditTips || tableEditTips.length === 0) {
        console.error('tableEditTips is null or empty jQuery object');
        return;
    }
    const tips = $(tableEditTips); // 确保 tableEditTips 是 jQuery 对象
    tips.empty();
    if (USER.tableBaseSetting.isExtensionAble === false) {
        tips.append('目前插件已关闭，将不会要求AI更新表格。');
        tips.css("color", "rgb(211 39 39)");
    } else if (userTableEditInfo.editAble) {
        tips.append('点击单元格选择编辑操作。绿色单元格为本轮插入，蓝色单元格为本轮修改。');
        tips.css("color", "lightgreen");
    } else {
        tips.append('此表格为中间表格，为避免混乱，不可被编辑和粘贴。你可以打开最新消息的表格进行编辑');
        tips.css("color", "lightyellow");
    }
}

function templateCellDataEdit(cell) {
    throw new Error('未实现该方法')
}

function batchEditMode(cell) {
    DERIVED.any.batchEditMode = true;
    DERIVED.any.batchEditModeSheet = cell.parent;
    EDITOR.confirm(`正在编辑 #${cell.parent.name} 的行`, '取消', '保存修改').then((r) => {
        DERIVED.any.batchEditMode = false;
        DERIVED.any.batchEditModeSheet = null;
        renderSheetsDOM();
    })

    renderSheetsDOM();
}

// 新的事件处理函数
function cellClickEditModeEvent(cell) {
    cell.element.style.cursor = 'pointer'

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();


    })
}

function cellClickEvent(cell) {
    cell.element.style.cursor = 'pointer'

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();

        if (cell.parent.currentPopupMenu) {
            cell.parent.currentPopupMenu.destroy();
            cell.parent.currentPopupMenu = null;
        }
        cell.parent.currentPopupMenu = new PopupMenu();

        const menu = cell.parent.currentPopupMenu;
        const [rowIndex, colIndex] = cell.position;
        const sheetType = cell.parent.type;

        if (rowIndex === 0 && colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> 行编辑', (e) => { batchEditMode(cell) });
            menu.add('<i class="fa fa-arrow-right"></i> 向右插入列', (e) => { cell.newAction(cell.CellAction.insertRightColumn) });
            menu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { cell.newAction(cell.CellAction.insertDownRow) });
        } else if (colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> 行编辑', (e) => { batchEditMode(cell) });
            menu.add('<i class="fa fa-arrow-up"></i> 向上插入行', (e) => { cell.newAction(cell.CellAction.insertUpRow) });
            menu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { cell.newAction(cell.CellAction.insertDownRow) });
            menu.add('<i class="fa fa-trash-alt"></i> 删除行', (e) => { cell.newAction(cell.CellAction.deleteSelfRow) });
        } else if (rowIndex === 0) {
            menu.add('<i class="fa fa-i-cursor"></i> 编辑该列', async (e) => { await templateCellDataEdit(cell) });
            menu.add('<i class="fa fa-arrow-left"></i> 向左插入列', (e) => { cell.newAction(cell.CellAction.insertLeftColumn) });
            menu.add('<i class="fa fa-arrow-right"></i> 向右插入列', (e) => { cell.newAction(cell.CellAction.insertRightColumn) });
            menu.add('<i class="fa fa-trash-alt"></i> 删除列', (e) => { cell.newAction(cell.CellAction.deleteSelfColumn) });
        } else {
            menu.add('<i class="fa fa-i-cursor"></i> 编辑该单元格', async (e) => { await templateCellDataEdit(cell) });
        }

        // 设置弹出菜单后的一些非功能性派生操作，这里必须使用setTimeout，否则会导致菜单无法正常显示
        setTimeout(() => {
            // 备份当前cell的style，以便在菜单关闭时恢复
            const style = cell.element.style.cssText;

            // 获取单元格位置
            const rect = cell.element.getBoundingClientRect();
            const tableRect = viewSheetsContainer.getBoundingClientRect();

            // 计算菜单位置（相对于表格容器）
            const menuLeft = rect.left - tableRect.left;
            const menuTop = rect.bottom - tableRect.top;
            const menuElement = menu.renderMenu();
            $(viewSheetsContainer).append(menuElement);

            // 高亮cell
            cell.element.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
            cell.element.style.color = 'var(--SmartThemeBodyColor)';

            menu.show(menuLeft, menuTop).then(() => {
                cell.element.style.cssText = style;
            })
            menu.frameUpdate((menu) => {
                // 重新定位菜单
                const rect = cell.element.getBoundingClientRect();
                const tableRect = viewSheetsContainer.getBoundingClientRect();

                // 计算菜单位置（相对于表格容器）
                const menuLeft = rect.left - tableRect.left;
                const menuTop = rect.bottom - tableRect.top;
                menu.popupContainer.style.left = `${menuLeft}px`;
                menu.popupContainer.style.top = `${menuTop}px`;
            })
        }, 0)

    })
    cell.on('', () => {
        console.log('cell发生了改变:', cell)
    })
}

async function renderSheetsDOM() {
    updateSystemMessageTableStatus(true);
    const sheetsData = await USER.getChatMetadata().sheets

    $(viewSheetsContainer).empty()
    for (let sheet of sheetsData) {
        const instance = new BASE.Sheet(sheet)
        const sheetContainer = document.createElement('div')
        const sheetTitleText = document.createElement('h3')
        sheetContainer.style.overflowX = 'none'
        sheetContainer.style.overflowY = 'auto'
        sheetTitleText.innerText = sheet.name

        let sheetElement = null
        if (DERIVED.any.batchEditMode === true) {
            if (DERIVED.any.batchEditModeSheet?.name === instance.name) {
                sheetElement = await instance.renderSheet(cellClickEditModeEvent)
            } else {
                sheetElement = await instance.renderSheet((cell) => {
                    cell.element.style.cursor = 'default'
                })
                sheetElement.style.cursor = 'default'
                sheetElement.style.opacity = '0.5'
                sheetTitleText.style.opacity = '0.5'
            }
        } else {
            sheetElement = instance.renderSheet(cellClickEvent)
        }

        $(sheetContainer).append(sheetElement)

        $(viewSheetsContainer).append(sheetTitleText)
        $(viewSheetsContainer).append(sheetContainer)
        $(viewSheetsContainer).append(`<hr>`)
    }
}

export async function refreshContextView(ignoreGlobal = false) {
    renderSheetsDOM();
}

let initializedTableView = null
async function initTableView(mesId) { // 增加 table_manager_container 参数
    const table_manager_container = await SYSTEM.htmlToDom(await SYSTEM.getTemplate('manager'), 'table_manager_container');
    viewSheetsContainer = table_manager_container.querySelector('#tableContainer');

    userTableEditInfo.editAble = findNextChatWhitTableData(mesId).index === -1

    setTableEditTips($(table_manager_container).find('#tableEditTips'));    // 确保在 table_manager_container 存在的情况下查找 tableEditTips

    // 渲染表格
    renderSheetsDOM()

    // 设置编辑提示
    // 点击打开查看表格历史按钮
    $(document).on('click', '#dataTable_history_button', function () {
        openTableHistoryPopup();
    })
    // 点击清空表格按钮
    $(document).on('click', '#clear_table_button', function () {
        clearTable(userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    $(document).on('click', '#table_rebuild_button', function () {
        rebuildSheets()
    })
    // 点击编辑表格按钮
    $(document).on('click', '#table_edit_mode_button', function () {
        // openTableEditorPopup();
    })
    // 点击复制表格按钮
    $(document).on('click', '#copy_table_button', function () {
        copyTable(userTableEditInfo.tables);
    })
    // // 点击粘贴表格按钮
    // $(document).on('click', '#paste_table_button', function () {
    //     pasteTable(userTableEditInfo.chatIndex, viewSheetsContainer);
    // })
    // // 点击导入表格按钮
    // $(document).on('click', '#import_clear_up_button', function () {
    //     importTable(userTableEditInfo.chatIndex, viewSheetsContainer);
    // })
    // // 点击导出表格按钮
    // $(document).on('click', '#export_table_button', function () {
    //     exportTable(userTableEditInfo.tables);
    // })

    initializedTableView = table_manager_container;
    return initializedTableView;
}

export async function getChatSheetsView(mesId = -1) {
    return initializedTableView || await initTableView(mesId);
}
