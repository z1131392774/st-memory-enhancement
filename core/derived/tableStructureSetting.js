import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import {updateSystemMessageTableStatus} from "./tablePushToChat.js";
import {renderSetting} from "./userExtensionSetting.js";
import {findTableStructureByIndex} from "../../index.js";

/**
 * 打开表格设置弹窗
 * @param {number} tableIndex 表格索引
 */
export async function openTableSettingPopup(tableIndex) {
    const manager = await SYSTEM.getTemplate('setting');
    const tableSettingPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, allowVerticalScrolling: true });
    const tableStructure = findTableStructureByIndex(tableIndex);
    const $dlg = $(tableSettingPopup.dlg);
    const $tableName = $dlg.find('#dataTable_tableSetting_tableName');
    const $note = $dlg.find('#dataTable_sheetSetting_note');
    const $initNote = $dlg.find('#dataTable_tableSetting_initNode');
    const $updateNode = $dlg.find('#dataTable_tableSetting_updateNode');
    const $insertNode = $dlg.find('#dataTable_tableSetting_insertNode');
    const $deleteNode = $dlg.find('#dataTable_tableSetting_deleteNode');
    const $required = $dlg.find('#dataTable_tableSetting_required');
    const $toChat = $dlg.find('#dataTable_tableSetting_toChat');        // +.新增发送到聊天，当开启时该表格发送到聊天
    const $tableRender = $dlg.find('#dataTable_tableSetting_tableRender');  // +.新增该表格的自定义html渲染
    DERIVED.any._currentTablePD = $dlg;
    DERIVED.any._currentTableIndex = tableIndex;
    $tableName.val(tableStructure.tableName);
    $note.val(tableStructure.note);
    $initNote.val(tableStructure.initNode);
    $updateNode.val(tableStructure.updateNode);
    $insertNode.val(tableStructure.insertNode);
    $deleteNode.val(tableStructure.deleteNode);
    $required.prop('checked', tableStructure.Required);
    $toChat.prop('checked', tableStructure.toChat ?? false);
    $tableRender.val(tableStructure.tableRender);

    const changeEvent = (name, value) => {
        tableStructure[name] = value.trim();
    };
    $tableName.on('change', function () { changeEvent("tableName", $(this).val()); });
    $note.on('change', function () { changeEvent("note", $(this).val()); });
    $initNote.on('change', function () { changeEvent("initNode", $(this).val()); });
    $updateNode.on('change', function () { changeEvent("updateNode", $(this).val()); });
    $insertNode.on('change', function () { changeEvent("insertNode", $(this).val()); });
    $deleteNode.on('change', function () { changeEvent("deleteNode", $(this).val()); });
    $required.on('change', function () { tableStructure.Required = $(this).prop('checked'); });
    $toChat.on('change', function () { tableStructure.toChat = $(this).prop('checked'); });
    $tableRender.on('change', function () { changeEvent("tableRender", $(this).val()); });
    await tableSettingPopup.show();
    renderSetting();
    updateSystemMessageTableStatus();
}
