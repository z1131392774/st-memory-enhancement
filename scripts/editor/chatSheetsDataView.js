import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { ext_exportAllTablesAsJson, saveDataToLocalStorage, readDataFromLocalStorage } from '../settings/standaloneAPI.js';
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { findNextChatWhitTableData,undoSheets } from "../../index.js";
import { rebuildSheets } from "../runtime/absoluteRefresh.js";
import { openTableHistoryPopup } from "./tableHistory.js";
import { reloadCurrentChat } from "/script.js";
import { PopupMenu } from "../../components/popupMenu.js";
import { openTableStatisticsPopup } from "./tableStatistics.js";
import { openCellHistoryPopup } from "./cellHistory.js";
import { openSheetStyleRendererPopup } from "./sheetStyleEditor.js";

let tablePopup = null
let copyTableData = null
let selectedCell = null
let editModeSelectedRows = []
let viewSheetsContainer = null
let lastCellsHashSheet = null
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
export async function copyTable() {
    copyTableData = JSON.stringify(getTableJson({type:'chatSheets', version: 1}))
    if(!copyTableData) return
    $('#table_drawer_icon').click()

    EDITOR.confirm(`正在复制表格数据 (#${SYSTEM.generateRandomString(4)})`, '取消', '粘贴到当前对话').then(async (r) => {
        if (r) {
            await pasteTable()
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
async function pasteTable() {
    if (USER.getContext().chat.length === 0) {
        EDITOR.error("请至少让ai回复一条消息作为表格载体")
        return
    }
    const confirmation = await EDITOR.callGenericPopup('粘贴会清空原有的表格数据，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        if (copyTableData) {
            const tables = JSON.parse(copyTableData)
            if(!tables.mate === 'chatSheets')  return EDITOR.error("导入失败：文件格式不正确")
            BASE.applyJsonToChatSheets(tables)
            await renderSheetsDOM()
            EDITOR.success('粘贴成功')
        } else {
            EDITOR.error("粘贴失败：剪切板没有表格数据")
        }
    }
}

/**
 * 导入表格
 * @param {number} mesId 需要导入表格的消息id
 */
/**
 * [重构] 核心导入逻辑，用于处理JSON字符串
 * @param {string} jsonString - 包含表格数据的JSON字符串
 * @param {boolean} isAuto - 是否为自动导入，为true则跳过确认弹窗
 */
async function processImportedData(jsonString, isAuto = false) {
    try {
        const tables = JSON.parse(jsonString);
        if (!(tables.mate?.type === 'chatSheets')) {
            EDITOR.error("导入失败：文件格式不正确", "请检查导入的是否是表格数据");
            return false;
        }

        let result = true; // 自动导入时，默认为true
        if (!isAuto) {
            const button = { text: '导入模板及数据', result: 3 };
            const popup = new EDITOR.Popup("请选择导入的部分", EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "导入模板及数据", cancelButton: "取消" });
            result = await popup.show();
        }

        if (result) {
            // 自动导入和手动导入默认都只应用数据，除非用户手动选择
            if (result === 3) {
                BASE.applyJsonToChatSheets(tables, "data");
            } else {
                BASE.applyJsonToChatSheets(tables);
            }
            await renderSheetsDOM();
            // 移除内部的成功提示，统一由调用方处理
            if (!isAuto) {
                EDITOR.success('表格数据导入成功');
            }
            return true;
        }
    } catch (e) {
        EDITOR.error("导入失败：解析JSON数据时出错。", e);
    }
    return false;
}


async function importTable(mesId, viewSheetsContainer) {
    if (mesId === -1) {
        EDITOR.error("请至少让ai回复一条消息作为表格载体")
        return
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    fileInput.addEventListener('change', function (event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = async function (loadEvent) {
                // 手动导入时，isAuto为false
                await processImportedData(loadEvent.target.result, false);
            };
            reader.readAsText(file, 'UTF-8');
        }
    });
    fileInput.click();
}

/**
 * 导出表格
 * @param {Array} tables 所有表格数据
 */
/**
 * 暂存表格数据
 */
async function stashTableData() {
    // 核心修复：调用与“导出”功能完全相同的 getTableJson 函数，以确保数据格式正确且完整。
    const jsonTables = getTableJson({ type: 'chatSheets', version: 1 });
    if (!jsonTables || Object.keys(jsonTables).length <= 1) { // 小于等于1是因为它总会包含一个mate对象
        EDITOR.warning('当前没有可暂存的表格数据。');
        return;
    }

    const content = JSON.stringify(jsonTables);
    const success = await saveDataToLocalStorage('table_stash_data', content);

    if (success) {
        EDITOR.success('表格数据已成功暂存到浏览器缓存，下次开启新对话将自动加载。');
    } else {
        EDITOR.error('暂存表格数据失败。');
    }
}

/**
 * 清空暂存的表格数据
 */
async function clearStashData() {
    const confirmation = await EDITOR.callGenericPopup('此操作将清空浏览器中缓存的表格数据，且无法恢复。是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "清空", cancelButton: "取消" });
    if (confirmation) {
        // 通过保存空字符串来间接实现清除
        const success = await saveDataToLocalStorage('table_stash_data', '');
        if (success) {
            EDITOR.success('已清空暂存数据。');
        } else {
            EDITOR.error('清空暂存数据失败。');
        }
    }
}

/**
 * 导出表格
 * @param {Array} tables 所有表格数据
 */
async function exportTable() {
    const jsonTables = getTableJson({type:'chatSheets', version: 1})
    if(!jsonTables) return
    const bom = '\uFEFF';
    const blob = new Blob([bom + JSON.stringify(jsonTables)], { type: 'application/json' });
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
 * 获取表格Json数据
 */
function getTableJson(mate) {
    const { piece } = BASE.getLastSheetsPiece();
    if (!piece || !piece.hash_sheets) {
        EDITOR.warning('当前表格没有数据，无法导出');
        return null;
    }
    const sheets = BASE.hashSheetsToSheets(piece.hash_sheets).filter(sheet => sheet.enable);
    if (sheets.length === 0) {
        EDITOR.warning('当前没有启用的表格，无法导出');
        return null;
    }
    // const csvTables = sheets.map(sheet => "SHEET-START" + sheet.uid + "\n" + sheet.getSheetCSV(false) + "SHEET-END").join('\n')
    const jsonTables = {}
    sheets.forEach(sheet => {
        jsonTables[sheet.uid] = sheet.getJson()
    })
    jsonTables.mate = mate
    return jsonTables
}

/**
 * 清空表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} viewSheetsContainer 表格容器DOM
 */
async function clearTable(mesId, viewSheetsContainer) {
    if (mesId === -1) return
    const confirmation = await EDITOR.callGenericPopup('清空当前对话的所有表格数据，并重置历史记录，该操作无法回退，是否继续？', EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        await USER.getContext().chat.forEach((piece => {
            if (piece.hash_sheets) {
                delete piece.hash_sheets
            }
            if (piece.dataTable) delete piece.dataTable
        }))
        setTimeout(() => {
            USER.saveSettings()
            USER.saveChat();
            BASE.refreshContextView()
            EDITOR.success("表格数据清除成功")
            console.log("已清除表格数据")
        }, 100)
    }
}

/**
 * 设置表格编辑Tips
 * @param {Element} tableEditTips 表格编辑提示DOM
 */
function setTableEditTips(tableEditTips) {
    /* if (!tableEditTips || tableEditTips.length === 0) {
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
    } */
}

async function cellDataEdit(cell) {
    const result = await EDITOR.callGenericPopup("编辑单元格", EDITOR.POPUP_TYPE.INPUT, cell.data.value, { rows: 3 })
    if (result) {
        cell.editCellData({ value: result })
        refreshContextView();
        if(cell.type === cell.CellType.column_header) BASE.refreshTempView(true)
    }
}


async function columnDataEdit(cell) {
    const columnEditor = `
<div class="column-editor">
    <div class="column-editor-header">
        <h3>编辑列数据</h3>
    </div>
    <div class="column-editor-body">
        <div class="column-editor-content">
            <label for="column-editor-input">列数据:</label>
            <textarea id="column-editor-input" rows="5"></textarea>
        </div>
    </div>
</div>
`
    const columnCellDataPopup = new EDITOR.Popup(columnEditor, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "应用修改", cancelButton: "取消" });
    const historyContainer = $(columnCellDataPopup.dlg)[0];

    await columnCellDataPopup.show();

    if (columnCellDataPopup.result) {
        // cell.editCellData({ value: result })
        refreshContextView();
    }
}

function batchEditMode(cell) {
    DERIVED.any.batchEditMode = true;
    DERIVED.any.batchEditModeSheet = cell.parent;
    EDITOR.confirm(`正在编辑 #${cell.parent.name} 的行`, '取消', '完成').then((r) => {
        DERIVED.any.batchEditMode = false;
        DERIVED.any.batchEditModeSheet = null;
        renderSheetsDOM();
    })
    renderSheetsDOM();
}

// 新的事件处理函数
export function cellClickEditModeEvent(cell) {
    cell.element.style.cursor = 'pointer'
    if (cell.type === cell.CellType.row_header) {
        cell.element.textContent = ''

        // 在 cell.element 中添加三个 div，一个用于显示排序，一个用于显示锁定按钮，一个用于显示删除按钮
        const containerDiv = $(`<div class="flex-container" style="display: flex; flex-direction: row; justify-content: space-between; width: 100%;"></div>`)
        const rightDiv = $(`<div class="flex-container" style="margin-right: 3px"></div>`)
        const indexDiv = $(`<span class="menu_button_icon interactable" style="margin: 0; padding: 0 6px; cursor: move; color: var(--SmartThemeBodyColor)">${cell.position[0]}</span>`)
        const lockDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-lock" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)
        const deleteDiv = $(`<div><i class="menu_button menu_button_icon interactable fa fa-xmark redWarningBG" style="margin: 0; border: none; color: var(--SmartThemeEmColor)"></i></div>`)

        $(lockDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (cell._pre_deletion) return

            cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target.locked = !target.locked
                        target.element.style.backgroundColor = target.locked ? '#00ff0022' : ''
                    })
                }
            })
        })
        $(deleteDiv).on('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            handleAction(cell, cell.CellAction.deleteSelfRow)
            //if (cell.locked) return

            /* cell.parent.hashSheet.forEach(row => {
                if (row[0] === cell.uid) {
                    row.forEach((hash) => {
                        const target = cell.parent.cells.get(hash)
                        target._pre_deletion = !target._pre_deletion
                        target.element.style.backgroundColor = target._pre_deletion ? '#ff000044' : ''
                    })
                }
            }) */
        })

        $(rightDiv).append(deleteDiv)
        $(containerDiv).append(indexDiv).append(rightDiv)
        $(cell.element).append(containerDiv)

    } else if (cell.type === cell.CellType.cell) {
        cell.element.style.cursor = 'text'
        cell.element.contentEditable = true
        cell.element.focus()
        cell.element.addEventListener('blur', (e) => {
            e.stopPropagation();
            e.preventDefault();
            cell.data.value = cell.element.textContent.trim()
        })
    }

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();
    })
}

async function confirmAction(event, text = '是否继续该操作？') {
    const confirmation = new EDITOR.Popup(text, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });

    await confirmation.show();
    if (!confirmation.result) return { filterData: null, confirmation: false };
    event()
}

/**
 * 单元格高亮
 */
export function cellHighlight(sheet) {
    const lastHashSheet = lastCellsHashSheet[sheet.uid] || []
    if ((sheet.hashSheet.length < 2) && (lastHashSheet.length < 2)) return;    //表格内容为空的时候不执行后续函数,提高健壮性
    const hashSheetFlat = sheet.hashSheet.flat()
    const lastHashSheetFlat = lastHashSheet.flat()
    let deleteRow = []
    lastHashSheet.forEach((row, index) => {
        if (!hashSheetFlat.includes(row[0])) {
            deleteRow.push(row[0])
            sheet.hashSheet.splice(index,0,lastHashSheet[index])
        }
    })

    const changeSheet = sheet.hashSheet.map((row) => {
        const isNewRow = !lastHashSheetFlat.includes(row[0])
        const isDeletedRow = deleteRow.includes(row[0])
        return row.map((hash) => {
            if (isNewRow) return { hash, type: "newRow" }
            if (isDeletedRow) return { hash, type: "deletedRow" }
            if (!lastHashSheetFlat.includes(hash)) return { hash, type: "update" }
            return { hash, type: "keep" }
        })
    })
    changeSheet.forEach((row, index) => {
        if (index === 0)
            return
        let isKeepAll = true
        row.forEach((cell) => {
            let sheetCell = sheet.cells.get(cell.hash)
            const cellElement = sheetCell.element
            if (cell.type === "newRow") {
                cellElement.classList.add('insert-item')
                isKeepAll = false
            } else if (cell.type === "update") {
                cellElement.classList.add('update-item')
                isKeepAll = false
            } else if (cell.type === "deletedRow") {
                sheetCell.isDeleted = true
                cellElement.classList.add('delete-item')
                isKeepAll = false
            } else if (sheetCell.isDeleted === true) {
                cellElement.classList.add('delete-item')
                isKeepAll = false
            } else {
                cellElement.classList.add('keep-item')
            }
        })
        if (isKeepAll) {
            row.forEach((cell) => {
                const cellElement = sheet.cells.get(cell.hash).element
                cellElement.classList.add('keep-all-item')
            })
        }
    })
}

async function cellHistoryView(cell) {
    await openCellHistoryPopup(cell)
}

/**
 * 自定义表格样式事件
 * @param {*} cell
 */
async function customSheetStyle(cell) {
    await openSheetStyleRendererPopup(cell.parent)
    await refreshContextView();
}

function cellClickEvent(cell) {
    cell.element.style.cursor = 'pointer'

    // 判断是否需要根据历史数据进行高亮
    /* const lastCellUid = lastCellsHashSheet.has(cell.uid)
    if (!lastCellUid) {
        cell.element.style.backgroundColor = '#00ff0011'
    }
    else if (cell.parent.cells.get(lastCellUid).data.value !== cell.data.value) {
        cell.element.style.backgroundColor = '#0000ff11'
    } */

    cell.on('click', async (event) => {
        event.stopPropagation();
        event.preventDefault();

        // 重新获取hash
        BASE.getLastestSheets()

        if (cell.parent.currentPopupMenu) {
            cell.parent.currentPopupMenu.destroy();
            cell.parent.currentPopupMenu = null;
        }
        cell.parent.currentPopupMenu = new PopupMenu();

        const menu = cell.parent.currentPopupMenu;
        const [rowIndex, colIndex] = cell.position;
        const sheetType = cell.parent.type;

        if (rowIndex === 0 && colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> 批量行编辑', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-right"></i> 向右插入列', () => handleAction(cell, cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-arrow-down"></i> 向下插入行', () => handleAction(cell, cell.CellAction.insertDownRow));
            menu.add('<i class="fa-solid fa-wand-magic-sparkles"></i> 自定义表格样式', async () => customSheetStyle(cell));
        } else if (colIndex === 0) {
            menu.add('<i class="fa-solid fa-bars-staggered"></i> 批量行编辑', () => batchEditMode(cell));
            menu.add('<i class="fa fa-arrow-up"></i> 向上插入行', () => handleAction(cell, cell.CellAction.insertUpRow));
            menu.add('<i class="fa fa-arrow-down"></i> 向下插入行', () => handleAction(cell, cell.CellAction.insertDownRow));
            menu.add('<i class="fa fa-trash-alt"></i> 删除行', () => handleAction(cell, cell.CellAction.deleteSelfRow), menu.ItemType.warning)
        } else if (rowIndex === 0) {
            menu.add('<i class="fa fa-i-cursor"></i> 编辑该列', async () => await cellDataEdit(cell));
            menu.add('<i class="fa fa-arrow-left"></i> 向左插入列', () => handleAction(cell, cell.CellAction.insertLeftColumn));
            menu.add('<i class="fa fa-arrow-right"></i> 向右插入列', () => handleAction(cell, cell.CellAction.insertRightColumn));
            menu.add('<i class="fa fa-trash-alt"></i> 删除列', () => confirmAction(() => { handleAction(cell, cell.CellAction.deleteSelfColumn) }, '确认删除列？'), menu.ItemType.warning);
        } else {
            menu.add('<i class="fa fa-i-cursor"></i> 编辑该单元格', async () => await cellDataEdit(cell));
            menu.add('<i class="fa-solid fa-clock-rotate-left"></i> 单元格历史记录', async () => await cellHistoryView(cell));
        }

        // 设置弹出菜单后的一些非功能性派生操作，这里必须使用setTimeout，否则会导致菜单无法正常显示
        setTimeout(() => {

        }, 0)

        const element = event.target

        // 备份当前cell的style，以便在菜单关闭时恢复
        const style = element.style.cssText;

        // 获取单元格位置
        const rect = element.getBoundingClientRect();
        const tableRect = viewSheetsContainer.getBoundingClientRect();

        // 计算菜单位置（相对于表格容器）
        const menuLeft = rect.left - tableRect.left;
        const menuTop = rect.bottom - tableRect.top;
        const menuElement = menu.renderMenu();
        $(viewSheetsContainer).append(menuElement);

        // 高亮cell
        element.style.backgroundColor = 'var(--SmartThemeUserMesBlurTintColor)';
        element.style.color = 'var(--SmartThemeQuoteColor)';
        element.style.outline = '1px solid var(--SmartThemeQuoteColor)';
        element.style.zIndex = '999';

        menu.show(menuLeft, menuTop).then(() => {
            element.style.cssText = style;
        })
        menu.frameUpdate((menu) => {
            // 重新定位菜单
            const rect = element.getBoundingClientRect();
            const tableRect = viewSheetsContainer.getBoundingClientRect();

            // 计算菜单位置（相对于表格容器）
            const menuLeft = rect.left - tableRect.left;
            const menuTop = rect.bottom - tableRect.top;
            menu.popupContainer.style.left = `${menuLeft}px`;
            menu.popupContainer.style.top = `${menuTop + 3}px`;
        })
    })
    cell.on('', () => {
        console.log('cell发生了改变:', cell)
    })
}

function handleAction(cell, action) {
    cell.newAction(action)
    refreshContextView();
    if(cell.type === cell.CellType.column_header) BASE.refreshTempView(true)
}

export async function renderEditableSheetsDOM(_sheets, _viewSheetsContainer, _cellClickEvent = cellClickEvent) {
    for (let [index, sheet] of _sheets.entries()) {
        if (!sheet.enable) continue
        const instance = sheet
        console.log("渲染：", instance)
        const sheetContainer = document.createElement('div')
        const sheetTitleText = document.createElement('h3')
        sheetContainer.style.overflowX = 'none'
        sheetContainer.style.overflowY = 'auto'
        sheetTitleText.innerText = `#${index} ${sheet.name}`

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
            sheetElement = await instance.renderSheet(_cellClickEvent)
        }
        cellHighlight(instance)
        console.log("渲染表格：", sheetElement)
        $(sheetContainer).append(sheetElement)

        $(_viewSheetsContainer).append(sheetTitleText)
        $(_viewSheetsContainer).append(sheetContainer)
        $(_viewSheetsContainer).append(`<hr>`)
    }
}

/**
 * 恢复表格
 * @param {number} mesId 需要清空表格的消息id
 * @param {Element} tableContainer 表格容器DOM
 */
async function undoTable(mesId, tableContainer) {
    if (mesId === -1) return
    //const button = { text: '撤销10轮', result: 3 }
    const popup = new EDITOR.Popup("撤销指定轮次内的所有手动修改及重整理数据，恢复表格", EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "撤销本轮", cancelButton: "取消" });
    const result = await popup.show()
    if (result) {
        await undoSheets(0)
        EDITOR.success('恢复成功')
    }
}


async function renderSheetsDOM() {
    const task = new SYSTEM.taskTiming('renderSheetsDOM_task')

    updateSystemMessageTableStatus();
    task.log()
    const { piece, deep } = BASE.getLastSheetsPiece();
    if (!piece || !piece.hash_sheets) return;

    const sheets = BASE.hashSheetsToSheets(piece.hash_sheets);
    sheets.forEach((sheet) => {
        // [二次修复] 增加对单元格是否存在的检查，防止因数据不一致导致渲染失败
        sheet.hashSheet = sheet.hashSheet.filter((row) => {
            const cell = sheet.cells.get(row[0]);
            return cell && cell.isDeleted !== true;
        });
        sheet.cells.forEach((cell) => {
            cell.isDeleted = false;
        });
    });
    console.log('renderSheetsDOM:', piece, sheets)
    DERIVED.any.renderingSheets = sheets
    task.log()
    // 用于记录上一次的hash_sheets，渲染时根据上一次的hash_sheets进行高亮
    lastCellsHashSheet = BASE.getLastSheetsPiece(deep - 1, 3, false)?.piece.hash_sheets;
    // console.log("找到的diff前项", lastCellsHashSheet)
    if (lastCellsHashSheet) {
        lastCellsHashSheet = BASE.copyHashSheets(lastCellsHashSheet)
        //for (const sheetUid in lastCellsHashSheet) {
        //    lastCellsHashSheet[sheetUid] = lastCellsHashSheet[sheetUid].flat()
        //}
    }
    task.log()
    $(viewSheetsContainer).empty()
    viewSheetsContainer.style.paddingBottom = '150px'
    renderEditableSheetsDOM(sheets, viewSheetsContainer)
    task.log()
}

let initializedTableView = null
async function initTableView(mesId) {
    initializedTableView = $(await SYSTEM.getTemplate('manager')).get(0);
    viewSheetsContainer = initializedTableView.querySelector('#tableContainer');

    // setTableEditTips($(initializedTableView).find('#tableEditTips'));    // 确保在 table_manager_container 存在的情况下查找 tableEditTips

    // 设置编辑提示
    // 点击打开查看表格数据统计
    $(document).on('click', '#table_data_statistics_button', function () {
        EDITOR.tryBlock(openTableStatisticsPopup, "打开表格统计失败")
    })
    // 点击打开查看表格历史按钮
    $(document).on('click', '#dataTable_history_button', function () {
        EDITOR.tryBlock(openTableHistoryPopup, "打开表格历史失败")
    })
    // 点击清空表格按钮
    $(document).on('click', '#clear_table_button', function () {
        EDITOR.tryBlock(clearTable, "清空表格失败", userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    $(document).on('click', '#table_rebuild_button', function () {
        EDITOR.tryBlock(rebuildSheets, "重建表格失败");
    })
    // 点击编辑表格按钮
    $(document).on('click', '#table_edit_mode_button', function () {
        // openTableEditorPopup();
    })
    // 点击恢复表格按钮
    $(document).on('click', '#table_undo', function () {
        EDITOR.tryBlock(undoTable, "恢复表格失败");
    })
    // 点击复制表格按钮
    $(document).on('click', '#copy_table_button', function () {
        EDITOR.tryBlock(copyTable, "复制表格失败");
    })
    // 点击导入表格按钮
    $(document).on('click', '#import_table_button', function () {
        EDITOR.tryBlock(importTable, "导入表格失败", userTableEditInfo.chatIndex, viewSheetsContainer);
    })
    // 点击导出表格按钮
    $(document).on('click', '#export_table_button', function () {
        EDITOR.tryBlock(exportTable, "导出表格失败");
    })
    // 点击暂存表格按钮
    $(document).on('click', '#stash_table_data_button', function () {
        EDITOR.tryBlock(stashTableData, "暂存表格失败");
    })
    // 点击清空暂存按钮
    $(document).on('click', '#clear_stash_button', function () {
        EDITOR.tryBlock(clearStashData, "清空暂存数据失败");
    })

    return initializedTableView;
}

export async function refreshContextView() {
    if(BASE.contextViewRefreshing) return
    BASE.contextViewRefreshing = true
    await renderSheetsDOM();
    console.log("刷新表格视图")
    BASE.contextViewRefreshing = false
}

/**
 * [新] 自动从暂存中导入数据
 * @returns {Promise<boolean>} 是否成功加载数据
 */
export async function autoImportFromStash() {
    // [终极修复] 在执行任何操作前，首先检查是否存在聊天载体。
    if (USER.getContext().chat.length === 0) {
        console.log('[Memory Enhancement] 检测到暂存数据，但无聊天载体，已中止自动恢复。');
        return false; // 直接返回，不进行任何后续操作
    }

    const content = await readDataFromLocalStorage('table_stash_data');
    if (content && content.length > 2) { // 检查内容是否为一个有效的json object
        console.log('[Memory Enhancement] 检测到暂存数据，将在1.5秒后尝试自动恢复...');
        return new Promise(resolve => {
            setTimeout(async () => {
                // 自动导入时，isAuto为true，跳过弹窗
                const success = await processImportedData(content, true);
                // 移除内部的成功提示，统一由调用方处理
                resolve(success);
            }, 1500);
        });
    }
    return false;
}

export async function getChatSheetsView(mesId = -1) {
    // 如果已经初始化过，直接返回缓存的容器，避免重复创建
    if (initializedTableView) {
        // 更新表格内容，但不重新创建整个容器
        await renderSheetsDOM();
        return initializedTableView;
    }
    
    // 自动加载逻辑已移至 buildSheetsByTemplates
    return await initTableView(mesId);
}
