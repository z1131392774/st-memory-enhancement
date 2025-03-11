// sheetStyleEditor.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import {findLastestTableData, findTableStructureByIndex} from "../../index.js";
import JSON5 from '../../utils/json5.min.mjs'

function parseTableRender(html, table) {
    if (!html) {
        if (!table) {
            console.warn("parseTableRender: html 为空，但 table 对象也为 undefined，无法渲染表格。");
            return '<div>表格数据未加载</div>';
        }
        return table.render();
    }
    if (!table || !table.content || !table.columns) return html;
    html = html.replace(/\$(\w)(\d+)/g, function (match, colLetter, rowNumber) {
        const colIndex = colLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        const rowIndex = parseInt(rowNumber);
        const r = `<span style="color: red">无单元格</span>`;
        try {
            return rowIndex === 0
                ? table.columns[colIndex]
                : table.content[rowIndex - 1][colIndex];
        } catch (error) {
            console.error(`Error parsing cell ${match}:`, error);
            return r;
        }
    });
    return html;
}

function replaceTableToStatusTag(tableStatusHTML) {
    const r = USER.tableBaseSetting.to_chat_container.replace(/\$0/g, `<tableStatus>${tableStatusHTML}</tableStatus>`);
    const chatContainer = window.document.querySelector('#chat');
    let tableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');

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
        if (tableStatusContainer) {
            tableStatusContainer.removeEventListener('touchstart', touchstartHandler);
            tableStatusContainer.removeEventListener('touchmove', touchmoveHandler);
            tableStatusContainer.removeEventListener('touchend', touchendHandler);
            chatContainer.removeChild(tableStatusContainer);
        }
        chatContainer.insertAdjacentHTML('beforeend', `<div class="wide100p" id="tableStatusContainer">${r}</div>`);
        const newTableStatusContainer = chatContainer?.querySelector('#tableStatusContainer');
        if (newTableStatusContainer) {
            newTableStatusContainer.addEventListener('touchstart', touchstartHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchmove', touchmoveHandler, { passive: false });
            newTableStatusContainer.addEventListener('touchend', touchendHandler, { passive: false });
        }
        tableStatusContainer = newTableStatusContainer;
    }, 0);
}

export function updateSystemMessageTableStatus(eventData) {
    if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isTableToChat === false) {
        window.document.querySelector('#tableStatusContainer')?.remove();
        return;
    }

    const tables = findLastestTableData(true).tables;
    let tableStatusHTML = '';
    for (let i = 0; i < tables.length; i++) {
        const structure = findTableStructureByIndex(i);
        if (!structure.enable || !structure.toChat) continue;
        tableStatusHTML += structure.tableRender
            ? parseTableRender(structure.tableRender, tables[i])
            : tables[i].render().outerHTML;
    }
    replaceTableToStatusTag(tableStatusHTML);
}

export async function openTableRendererPopup(sheet) {
    const manager = await SYSTEM.getComponent('renderer');
    const tableRendererPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    // const tableStructure = findTableStructureByIndex(DERIVED.any._currentTableIndex);
    // const table = findLastestTableData(true).tables[DERIVED.any._currentTableIndex];
    // if (!table) {
    //     console.warn("openTableRendererPopup: 未能获取到有效的 table 对象。");
    //     return;
    // }
    //
    // const $dlg = $(tableRendererPopup.dlg);
    // const $htmlEditor = $dlg.find('#htmlEditor');
    // const $tableRendererDisplay = $dlg.find('#tableRendererDisplay');
    //
    // const tableRenderContent = tableStructure?.tableRender || "";
    // $htmlEditor.val(tableRenderContent);
    //
    // const renderHTML = () => {
    //     $tableRendererDisplay.html(parseTableRender($htmlEditor.val(), table));
    // };
    // renderHTML();
    // $htmlEditor.on('input', renderHTML);

    await tableRendererPopup.show();
    // if (tableStructure) {
    //     tableStructure.tableRender = $htmlEditor.val();
    //     DERIVED.any._currentTablePD.find('#dataTable_tableSetting_tableRender').val($htmlEditor.val());
    // }
}
