import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../manager.js';
// import { deleteRow, insertRow, updateRow } from "../tableActions.js";
// import JSON5 from '../../utils/json5.min.mjs'

const histories = `
`

/**
 * 打开表格编辑历史记录弹窗
 * */
export async function openTableHistoryPopup(){
    const manager = histories;
    const tableHistoryPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });

    await tableHistoryPopup.show();
}
