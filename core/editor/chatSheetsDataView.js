import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../manager.js';
import {updateSystemMessageTableStatus} from "../runtime/tablePushToChat.js";
import {
    copyTableList,
    findLastestOldTablePiece,
    findNextChatWhitTableData,
    getTableEditActionsStr,
    handleEditStrInMessage,
    parseTableEditTag,
    replaceTableEditTag,
} from "../../index.js";
import {rebuildTableActions, refreshTableActions,getPromptAndRebuildTable} from "../runtime/absoluteRefresh.js";
import {initAllTable} from "../tableActions.js";
import {openTableHistoryPopup} from "./tableHistory.js";
import {initRefreshTypeSelector} from "./initRefreshTypeSelector.js";
import {PopupMenu} from "../../components/popupMenu.js";
// import {renderTablesDOM} from "./tableDataView.js";

let tablePopup = null
let copyTableData = null
let selectedCell = null
let tableContainer = null
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
    if (await EDITOR.confirm(text, '粘贴到当前对话', '取消')) {
        await pasteTable(userTableEditInfo.chatIndex, tableContainer)
    }
    if ($('#table_drawer_icon').hasClass('closedIcon')) {
        $('#table_drawer_icon').click()
    }
}

/**
 * 粘贴表格
 * @param {number} mesId 需要粘贴到的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function pasteTable(mesId, tableContainer) {
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
            // renderTablesDOM(tables, tableContainer, true)
            // updateSystemMessageTableStatus();
            // EDITOR.success('粘贴成功')
        } else {
            EDITOR.error("粘贴失败：剪切板没有表格数据")
        }
    }
}

/**
 * 导入表格
 * @param {number} mesId 需要导入表格的消息id
 */
async function importTable(mesId, tableContainer) {
    if (mesId === -1) {
        EDITOR.error("请至少让ai回复一条消息作为表格载体")
        return
    }

    // 1. 创建一个 input 元素，类型设置为 'file'，用于文件选择
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    // 设置 accept 属性，限制只能选择 JSON 文件，提高用户体验
    fileInput.accept = '.json';

    // 2. 添加事件监听器，监听文件选择的变化 (change 事件)
    fileInput.addEventListener('change', function(event) {
        // 获取用户选择的文件列表 (FileList 对象)
        const files = event.target.files;

        // 检查是否选择了文件
        if (files && files.length > 0) {
            // 获取用户选择的第一个文件 (这里假设只选择一个 JSON 文件)
            const file = files[0];

            // 3. 创建 FileReader 对象，用于读取文件内容
            const reader = new FileReader();

            // 4. 定义 FileReader 的 onload 事件处理函数
            // 当文件读取成功后，会触发 onload 事件
            reader.onload = function(loadEvent) {
                // loadEvent.target.result 包含了读取到的文件内容 (文本格式)
                const fileContent = loadEvent.target.result;

                try {
                    throw new Error('未实现该方法')
                    // // 5. 尝试解析 JSON 数据
                    // const tables = JSON.parse(fileContent)
                    // checkPrototype(tables)
                    // USER.getContext().chat[mesId].dataTable = tables
                    // renderTablesDOM(tables, tableContainer, true)
                    // updateSystemMessageTableStatus();
                    // EDITOR.success('导入成功')
                } catch (error) {
                    // 7. 捕获 JSON 解析错误，并打印错误信息
                    console.error("JSON 解析错误:", error);
                    alert("JSON 文件解析失败，请检查文件格式是否正确。");
                }
            };

            reader.readAsText(file, 'UTF-8'); // 建议指定 UTF-8 编码，确保中文等字符正常读取
        }
    });
    fileInput.click();
}

/**
 * 导出表格
 * @param {Array} tables 所有表格数据
 */
async function exportTable(tables = []) {
    if (!tables || tables.length === 0) {
        EDITOR.warning('当前表格没有数据，无法导出');
        return;
    }

    const jsonTables = JSON.stringify(tables, null, 2); // 使用 2 空格缩进，提高可读性
    const blob = new Blob([jsonTables], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = 'table_data.json'; // 默认文件名
    document.body.appendChild(downloadLink); // 必须添加到 DOM 才能触发下载
    downloadLink.click();
    document.body.removeChild(downloadLink); // 下载完成后移除

    URL.revokeObjectURL(url); // 释放 URL 对象

    EDITOR.success('已导出');
}

/**
 * 清空表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function clearTable(mesId, tableContainer) {
    if (mesId === -1) return
    const confirmation = await EDITOR.callGenericPopup('清空此条的所有表格数据，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
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

function cellClickEvent(cell) {
    cell.element.style.cursor = 'pointer'
    cell.on('click', async (event) => {
        event.stopPropagation();
        if (cell.parent.currentPopupMenu) {
            cell.parent.currentPopupMenu.destroy();
            cell.parent.currentPopupMenu = null;
        }
        cell.parent.currentPopupMenu = new PopupMenu();

        const [rowIndex, colIndex] = cell.position;
        const sheetType = cell.parent.type;

        // cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该单元格', async (e) => { await templateCellDataEdit(cell) });

        if (rowIndex === 0 && colIndex === 0) {
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { cell.newAction(cell.CellAction.insertDownRow) });
        } else if (rowIndex === 0) {
            cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该列', async (e) => { await templateCellDataEdit(cell) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-left"></i> 向左插入列', (e) => { cell.newAction(cell.CellAction.insertLeftColumn) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-right"></i> 向右插入列', (e) => { cell.newAction(cell.CellAction.insertRightColumn) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> 删除列', (e) => { cell.newAction(cell.CellAction.deleteSelfColumn) });
        } else if (colIndex === 0) {
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-up"></i> 向上插入行', (e) => { cell.newAction(cell.CellAction.insertUpRow) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-arrow-down"></i> 向下插入行', (e) => { cell.newAction(cell.CellAction.insertDownRow) });
            cell.parent.currentPopupMenu.add('<i class="fa fa-trash-alt"></i> 删除行', (e) => { cell.newAction(cell.CellAction.deleteSelfRow) });
        } else {
            cell.parent.currentPopupMenu.add('<i class="fa fa-i-cursor"></i> 编辑该单元格', async (e) => { await templateCellDataEdit(cell) });
        }

        const rect = cell.element.getBoundingClientRect();
        const menu = cell.parent.currentPopupMenu.renderMenu();
        menu.style.zIndex = 9999;
        window.document.body.appendChild(menu)
        cell.parent.currentPopupMenu.show(rect.left, rect.top + rect.height);
    })
    cell.on('', () => {
        console.log('cell发生了改变:', cell)
    })
}

export async function renderSheetsDOM() {
    updateSystemMessageTableStatus(true);
    const sheetsData = await USER.getChatMetadata().sheets
    const sheets = sheetsData.map(sheet => new BASE.Sheet(sheet))

    $(tableContainer).empty()
    for (let sheet of sheets) {
        const instance = new BASE.Sheet(sheet)
        const sheetsContainer = document.createElement('div')
        sheetsContainer.style.overflowX = 'none'
        sheetsContainer.style.overflowY = 'auto'
        $(sheetsContainer).append(instance.renderSheet(cellClickEvent))

        $(tableContainer).append(`<h3>${instance.name}</h3>`)
        $(tableContainer).append(sheetsContainer)
        $(tableContainer).append(`<hr />`)
    }
}

export async function refreshContextView(ignoreGlobal = false) {
    if(ignoreGlobal && scope === 'global') return

    await renderSheetsDOM();
}

async function rebuildSheets() {
    const container = document.createElement('div')
    const confirmation = new EDITOR.Popup(container, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    const style = document.createElement('style')
    style.innerHTML = `
        .rebuild-preview-item {
            display: flex;
            justify-content: space-between;
            margin: 0 10px;
        }
    `
    container.appendChild(style)
    $(container).append($('<h3>重建表格数据</h3>'));
    $(container).append(` <span>重建表格数据将会清空所有表格数据，是否继续？</span> `).append(`<hr>`);
    $(container).append(`<div class="rebuild-preview-item"><span>更新方式：</span>${USER.tableBaseSetting.bool_silent_refresh ? '静默刷新' : '非静默刷新'}</div>`);
    $(container).append(`<div class="rebuild-preview-item"><span>API：</span>${USER.tableBaseSetting.use_main_api ? '使用主API' : '使用备用API'}</div>`);
    $(container).append(`<div class="rebuild-preview-item"><span></span>${$('#table_refresh_type_selector').find('option:selected').text()}</div>`);
    $(container).append(`<hr>`);

    await confirmation.show();
    if (confirmation.result) {
        // rebuildTableActions(USER.tableBaseConfig.bool_force_refresh, USER.tableBaseConfig.bool_silent_refresh);
        getPromptAndRebuildTable();
    }
}

let initializedTableView = null
async function initTableView(mesId) { // 增加 table_manager_container 参数
    const table_manager_container = await SYSTEM.htmlToDom(await SYSTEM.getTemplate('manager'), 'table_manager_container');
    tableContainer = table_manager_container.querySelector('#tableContainer');

    userTableEditInfo.editAble = findNextChatWhitTableData(mesId).index === -1

    setTableEditTips($(table_manager_container).find('#tableEditTips'));    // 确保在 table_manager_container 存在的情况下查找 tableEditTips

    const sheetsData = await USER.getChatMetadata().sheets
    const sheets = sheetsData.map(sheet => new BASE.Sheet(sheet))
    renderSheetsDOM(sheets)

    // 设置编辑提示
    // 点击打开查看表格历史按钮
    $(document).on('click', '#dataTable_history_button', function () {
        openTableHistoryPopup();
    })
    // 点击清空表格按钮
    $(document).on('click', '#clear_table_button', function () {
        clearTable(userTableEditInfo.chatIndex, tableContainer);
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
    //     pasteTable(userTableEditInfo.chatIndex, tableContainer);
    // })
    // // 点击导入表格按钮
    // $(document).on('click', '#import_clear_up_button', function () {
    //     importTable(userTableEditInfo.chatIndex, tableContainer);
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
