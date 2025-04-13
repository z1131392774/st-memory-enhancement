// tablePushToChat.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../manager.js';
import {findTableStructureByIndex} from "../../index.js";

/**
 * 解析html，将其中代表表格单元格的\$\w\d+字符串替换为对应的表格单元格内容
 * 对于任意\$\w\d+字符串，其中\w为表格的列数，\d+为表格的行数，例如$B3表示表格第二列第三行的内容，行数从header行开始计数，header行为0
 * */
function parseTableRender(html, table) {
    // if (!html) {
    //     return table.render(); // 如果html为空，则直接返回
    // }
    // if (!table || !table.content || !table.columns) return html;
    // html = html.replace(/\$(\w)(\d+)/g, function (match, colLetter, rowNumber) {
    //     const colIndex = colLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0); // 将列字母转换为列索引 (A=0, B=1, ...)
    //     const rowIndex = parseInt(rowNumber);
    //     const r = `<span style="color: red">无单元格</span>`;
    //     try {
    //         return rowIndex === 0
    //             ? table.columns[colIndex]                   // 行数从header行开始计数，header行为0
    //             : table.content[rowIndex - 1][colIndex];    // content的行数从1开始
    //     } catch (error) {
    //         console.error(`Error parsing cell ${match}:`, error);
    //         return r;
    //     }
    // });
    return html;
}

/**
 * 将table数据推送至聊天内容中显示
 * @param tableStatusHTML 表格状态html
 */
function replaceTableToStatusTag(tableStatusHTML) {
    const r = USER.tableBaseSetting.to_chat_container.replace(/\$0/g, `<tableStatus>${tableStatusHTML}</tableStatus>`);
    const chatContainer = window.document.querySelector('#chat');

    // 定义具名的事件监听器函数
    const touchstartHandler = function(event) {
        event.stopPropagation();
    };
    const touchmoveHandler = function(event) {
        event.stopPropagation();
    };
    const touchendHandler = function(event) {
        event.stopPropagation();
    };

    setTimeout(() => {
        // 此处注意竞态条件，可能在setTimeout执行前，上一轮tableStatusContainer还未被添加
        const currentTableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');
        if (currentTableStatusContainer) {
            // 移除之前的事件监听器，防止重复添加 (虽然在这个场景下不太可能重复添加)
            currentTableStatusContainer.removeEventListener('touchstart', touchstartHandler);
            currentTableStatusContainer.removeEventListener('touchmove', touchmoveHandler);
            currentTableStatusContainer.removeEventListener('touchend', touchendHandler);
            chatContainer.removeChild(currentTableStatusContainer); // 移除旧的 tableStatusContainer
        }
        $(chatContainer).append(`<div class="wide100p" id="tableStatusContainer">${r}</div>`); // 添加新的 tableStatusContainer
        // 获取新创建的 tableStatusContainer
        const newTableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');
        if (newTableStatusContainer) {
            // 添加事件监听器，使用具名函数
            newTableStatusContainer.addEventListener('touchstart', touchstartHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchmove', touchmoveHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchend', touchendHandler, { passive: false });
        }
        console.log('tableStatusContainer:', newTableStatusContainer);
    }, 0);
}

/**
 * 更新最后一条 System 消息的 <tableStatus> 标签内容
 */
export function updateSystemMessageTableStatus(force = false) {
    console.log("更新最后一条 System 消息的 <tableStatus> 标签内容", USER.tableBaseSetting.isTableToChat)
    if (force === false) {
        if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isTableToChat === false) {
            window.document.querySelector('#tableStatusContainer')?.remove();
            return;
        }
    }
    console.log("更新最后一条 System ")
    const sheets = BASE.hashSheetsToSheets(BASE.getLastSheetsPiece()?.piece.hash_sheets);
    let tableStatusHTML = '';
    for (let sheet of sheets) {
        if (sheet.tochat) {
            tableStatusHTML += `<h4>${sheet.name}</h4>`;
            tableStatusHTML += sheet.renderSheet(cell => {
                cell.element.style.cursor = 'default';
            }).outerHTML;
            tableStatusHTML += '<hr>';
        }
    }

    replaceTableToStatusTag(tableStatusHTML);
}

/**
 * 新增代码，打开自定义表格推送渲染器弹窗
 * @returns {Promise<void>}
 */
export async function openTableRendererPopup() {
    const manager = await SYSTEM.getTemplate('customSheetStyle');
    const tableRendererPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const sheetsData = BASE.getLastSheetsPiece()?.piece.hash_sheets;
    if (!sheetsData) {
        // console.warn("openTableRendererPopup: 未能获取到有效的 table 对象。");
        return;
    }
    const sheets = BASE.hashSheetsToSheets(sheetsData)[0];
    let sheetElements = '';
    for (let sheet of sheets) {
        if (!sheet.tochat) continue;
        if (!sheet.data.customStyle || sheet.data.customStyle === '') {
            sheetElements += sheet.renderSheet().outerHTML;
            continue;
        }
        // parseTableRender()
    }

    const $dlg = $(tableRendererPopup.dlg);
    const $htmlEditor = $dlg.find('#htmlEditor');
    const $tableRendererDisplay = $dlg.find('#tableRendererDisplay');

    // 修改中实时渲染
    const renderHTML = () => {
        $tableRendererDisplay.html(sheetElements);
    };

    renderHTML();
    $htmlEditor.on('input', renderHTML); // 监听 input 事件，实时渲染

    await tableRendererPopup.show();
}
