import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../manager.js';
import {getColumnLetter} from "../tableBase.js";
// import { deleteRow, insertRow, updateRow } from "../tableActions.js";
// import JSON5 from '../../utils/json5.min.mjs'

const histories = `
<style>
.table-history {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 10px;
}
.table-history-content {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    padding: 10px;
    overflow-y: auto;
}
.history-tabs {
    display: flex;
    overflow-x: auto;
    margin-bottom: 15px;
    padding-bottom: 5px;
    z-index: 999;
}
.history-tab {
    margin-right: 15px;
    cursor: pointer;
    border-radius: 5px 5px 0 0;
    background-color: rgba(0, 0, 0, 0.3);
    white-space: nowrap;
    transition: background-color 0.3s;
}
.history-tab.active {
    background-color: rgba(100, 100, 255, 0.3);
    font-weight: 500;
}
.history-sheets-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
}
.history-sheet-container {
    display: none;
    border-radius: 5px;
    height: 100%;
}
.history-sheet-container.active {
    display: flex;
    flex: 1;
    border: 1px solid rgba(255, 255, 255, 0.2);
}
.history-cell-list {
    overflow-y: auto;
    width: 100%;
}
.history-cell-item {
    display: flex;
    flex: 1;
    width: 100%;
    justify-content: space-between;
    margin-bottom: 5px;
    padding: 5px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}
.history-cell-position {
    font-weight: bold;
    color: var(--SmartThemeQuoteColor);
    width: 60px;
}
.history-cell-value {
    display: flex;
    flex: 1;
    width: 100%;
    padding: 0 10px;
    font-weight: normal;
    word-break: break-all;
}
.history-cell-timestamp {
    color: var(--SmartThemeEmColor);
    font-size: 0.9em;
    width: 60px;
    text-align: right;
}
.history-empty {
    font-style: italic;
    color: rgba(255, 255, 255, 0.5);
    text-align: center;
    padding: 10px;
}
</style>
<div class="table-history">
    <h3>表格单元格历史记录</h3>
    <div class="history-tabs">
        <!-- 动态生成tabs -->
    </div>
    <div class="table-history-content">
        <div class="history-sheets-content">
            <!-- 动态生成的表格历史记录内容 -->
        </div>
    </div>
</div>
`

function updateTableHistoryData(container) {
    const { piece, deep } = BASE.getLastSheetsPiece();
    const sheetsData = BASE.sheetsData.context;
    if (!piece || !piece.hash_sheets) return;

    // 获取内容容器
    const contentContainer = $(container).find('.table-history-content');
    const tabsContainer = $(container).find('.history-tabs');
    const sheetsContainer = $(contentContainer).find('.history-sheets-content');

    // 清空现有内容
    tabsContainer.empty();
    sheetsContainer.empty();

    // 如果没有表格数据，显示提示
    if (!sheetsData || sheetsData.length === 0) {
        sheetsContainer.append('<div class="history-empty">没有可显示的历史数据</div>');
        return;
    }

    // 有效的表格计数（用于处理首个激活标签）
    let validSheetCount = 0;

    // 遍历所有表格
    sheetsData.forEach((sheetData, index) => {
        if (!sheetData.cellHistory || sheetData.cellHistory.length === 0) return;

        const sheetName = sheetData.name || `表格${index + 1}`;
        const sheetId = `history-sheet-${index}`;
        validSheetCount++;

        // 创建Tab
        const tab = $(`<div class="history-tab" data-target="${sheetId}">#${index} ${sheetName}</div>`);
        if (validSheetCount === 1) {
            tab.addClass('active');
        }
        tabsContainer.append(tab);

        // 创建表格内容区域
        const sheetContainer = $(`<div id="${sheetId}" class="history-sheet-container ${validSheetCount === 1 ? 'active' : ''}"></div>`);
        const cellListContainer = $('<div class="history-cell-list"></div>');

        // 创建表格的单元格历史记录
        const cellHistory = [...sheetData.cellHistory];

        // 按照创建时间排序，最新的在前面
        cellHistory.sort((a, b) => {
            return b.uid.localeCompare(a.uid);  // uid通常包含时间戳，所以可以用来排序
        });

        // 计数有效的历史记录数量
        let validHistoryCount = 0;

        cellHistory.forEach(cell => {
            // 确保位置缓存存在
            const positionCache = {};
            if (sheetData.hashSheet) {
                sheetData.hashSheet.forEach((row, rowIndex) => {
                    row.forEach((cellUid, colIndex) => {
                        positionCache[cellUid] = [rowIndex, colIndex];
                    });
                });
            }

            // 获取单元格位置信息
            const position = positionCache[cell.uid] || [-1, -1];
            const [rowIndex, colIndex] = position;

            // 只显示有值的单元格
            if (!cell.data || !cell.data.value) return;

            // 跳过第一行第一列（表格原始单元格）
            if (rowIndex === 0 && colIndex === 0) return;

            // 创建位置显示
            let positionDisplay = '未知';
            if (rowIndex >= 0 && colIndex >= 0) {
                if (rowIndex === 0) {
                    positionDisplay = `列头${colIndex}`; // 列表头
                } else if (colIndex === 0) {
                    positionDisplay = `行头${rowIndex}`; // 行表头
                } else {
                    positionDisplay = `${getColumnLetter(colIndex-1)}${rowIndex}`; // 普通单元格，如A1, B2
                }
            }

            // 创建历史条目
            const historyItem = $('<div class="history-cell-item"></div>');
            const positionElement = $(`<div class="history-cell-position">${positionDisplay}</div>`);
            const valueElement = $(`<div class="history-cell-value">${cell.data.value}</div>`);
            const timestampElement = $(`<div class="history-cell-timestamp">${cell.uid.slice(-4)}</div>`);

            historyItem.append(positionElement);
            historyItem.append(valueElement);
            // historyItem.append(timestampElement);

            cellListContainer.append(historyItem);
            validHistoryCount++;
        });

        // 如果没有历史条目，显示提示
        if (validHistoryCount === 0) {
            cellListContainer.append('<div class="history-empty">此表格没有历史数据</div>');
        }

        sheetContainer.append(cellListContainer);
        sheetsContainer.append(sheetContainer);
    });

    // 如果没有任何表格有历史数据，显示提示
    if (validSheetCount === 0) {
        sheetsContainer.append('<div class="history-empty">没有可显示的历史数据</div>');
    }

    // 添加标签切换事件
    tabsContainer.find('.history-tab').on('click', function() {
        // 移除所有活跃状态
        tabsContainer.find('.history-tab').removeClass('active');
        sheetsContainer.find('.history-sheet-container').removeClass('active');

        // 添加当前项的活跃状态
        $(this).addClass('active');
        const targetId = $(this).data('target');
        $(`#${targetId}`).addClass('active');
    });
}

/**
 * 打开表格编辑历史记录弹窗
 * */
export async function openTableHistoryPopup(){
    const manager = histories;
    const tableHistoryPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: false });
    const historyContainer = $(tableHistoryPopup.dlg)[0];

    updateTableHistoryData(historyContainer);

    await tableHistoryPopup.show();
}
