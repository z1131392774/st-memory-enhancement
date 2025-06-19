// absoluteRefresh.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../../core/manager.js';
import { findTableStructureByIndex, convertOldTablesToNewSheets } from "../../index.js";
import JSON5 from '../../utils/json5.min.mjs'
import { updateSystemMessageTableStatus } from "../renderer/tablePushToChat.js";
import { reloadCurrentChat } from "../../../../../../script.js";
import { TableTwoStepSummary } from "./separateTableUpdate.js";
import { estimateTokenCount, handleCustomAPIRequest, handleMainAPIRequest } from "../settings/standaloneAPI.js";
import { profile_prompts } from "../../data/profile_prompts.js";
import { refreshContextView } from "../editor/chatSheetsDataView.js";
import { Form } from '../../components/formManager.js';
import {refreshRebuildTemplate} from "../settings/userExtensionSetting.js"


export function initRefreshTypeSelector() {
    const $selector = $('#table_refresh_type_selector');
    if (!$selector.length) return;

    $selector.empty();

    Object.entries(profile_prompts).forEach(([key, value]) => {
        const option = $('<option></option>')
            .attr('value', key)
            .text((() => {
                switch (value.type) {
                    case 'refresh':
                        return '**旧** ' + (value.name || key);
                    case 'third_party':
                        return '**第三方作者** ' + (value.name || key);
                    default:
                        return value.name || key;
                }
            })());
        $selector.append(option);
    });

    if ($selector.children().length === 0) {
        $selector.append($('<option></option>').attr('value', 'rebuild_base').text('~~~看到这个选项说明出问题了~~~~'));
    }

    console.log('表格刷新类型选择器已更新');
}

export async function executeIncrementalUpdateFromSummary(
    chatToBeUsed = '',
    originTableText,
    tableHeadersJsonString,
    latestSheets,
    useMainAPI,
    silentUpdate = USER.tableBaseSetting.bool_silent_refresh,
    isStepByStepSummary = false,
    isSilentMode = false
) {
    if (!SYSTEM.lazy('executeIncrementalUpdate', 1000)) return '';

    try {
        const lastChats = chatToBeUsed;
        let systemPromptForApi;

        if (isStepByStepSummary) {
            const stepByStepPromptString = USER.tableBaseSetting.step_by_step_user_prompt;
            let promptMessages;
            try {
                promptMessages = JSON5.parse(stepByStepPromptString);
            } catch (e) {
                EDITOR.error("分步填表提示词格式错误，无法解析。");
                return 'error';
            }

            const replacePlaceholders = (text) => text
                .replace(/(?<!\\)\$0/g, () => originTableText)
                .replace(/(?<!\\)\$1/g, () => lastChats)
                .replace(/(?<!\\)\$2/g, () => tableHeadersJsonString);
            
            systemPromptForApi = promptMessages.map(msg => ({ ...msg, content: replacePlaceholders(msg.content) }));
        }

        let rawContent;
        if (useMainAPI) {
            rawContent = await handleMainAPIRequest(systemPromptForApi, null, isSilentMode);
        } else {
            rawContent = await handleCustomAPIRequest(systemPromptForApi, null, isStepByStepSummary, isSilentMode);
        }
        
        if (rawContent === 'suspended') return 'suspended';
        if (typeof rawContent !== 'string' || !rawContent.trim()) {
            EDITOR.error('API响应内容无效或为空。');
            return 'error';
        }

        let processedRawContent = rawContent.replace(/^```(?:xml|json|javascript|html)?\s*\n?/im, '').replace(/\n?```$/m, '');
        let operationsString = '';
        const openTag = '<tableEdit>';
        const closeTag = '</tableEdit>';
        const startIndex = processedRawContent.indexOf(openTag);

        if (startIndex !== -1) {
            let endIndex = processedRawContent.indexOf(closeTag, startIndex + openTag.length);
            if (endIndex === -1) {
                 EDITOR.error("API响应被截断：表格操作指令不完整。");
                 return 'error';
            }
            const contentBetweenTags = processedRawContent.substring(startIndex + openTag.length, endIndex);
            const singleCommentMatch = contentBetweenTags.match(/^\s*<!--([\s\S]*?)-->\s*$/);
            operationsString = (singleCommentMatch && singleCommentMatch[1]) ? singleCommentMatch[1].trim() : contentBetweenTags.replace(/<!--[\s\S]*?-->/g, '').trim();
        } else {
            EDITOR.error("API响应格式错误：未找到<tableEdit>标签。");
            return 'error';
        }

        if (operationsString === '') {
             EDITOR.info("AI未提供任何操作指令。");
             return 'success';
        }

        const operations = operationsString.split('\n').map(s => s.trim()).filter(s => s);
        let operationsApplied = 0;
        
        for (const opStr of operations) {
            try {
                let match;
                if (opStr.startsWith('insertRow(')) {
                    match = opStr.match(/insertRow\(\s*(\d+)\s*,\s*(\[.*?\]|{.*?})\s*\)/);
                    if (match) {
                        const tableIndex = parseInt(match[1], 10);
                        const sheet = latestSheets[tableIndex];
                        if (!sheet) continue;
                        
                        const dataString = match[2];
                        const data = JSON5.parse(dataString);
                        const dataArray = Array.isArray(data) ? data : Object.values(data);
                        
                        const insertCell = sheet.findCellByPosition(sheet.getRowCount() - 1, 0) || sheet.findCellByPosition(0, 0);
                        if (insertCell) {
                            insertCell.newAction(insertCell.CellAction.insertDownRow, {}, false);
                            const newRowIndex = sheet.getRowCount() - 1;
                            const newRowCells = sheet.getCellsByRowIndex(newRowIndex);
                            if (newRowCells) {
                                newRowCells.forEach((cell, index) => {
                                    if (index === 0) return;
                                    if (dataArray[index - 1] !== undefined) {
                                        cell.data.value = String(dataArray[index - 1]);
                                    }
                                });
                            }
                            operationsApplied++;
                        }
                    }
                } else if (opStr.startsWith('updateRow(')) {
                    match = opStr.match(/updateRow\(\s*(\d+)\s*,\s*(\d+|\[.*?\])\s*,\s*({.*?})?\s*\)/);
                    if(match) {
                        const tableIndex = parseInt(match[1], 10);
                        const sheet = latestSheets[tableIndex];
                        if (!sheet) continue;

                        let rowIndex;
                        let data;

                        if(match[3]) {
                            rowIndex = parseInt(match[2], 10);
                            data = JSON5.parse(match[3]);
                        } 
                        else {
                            const dataArray = JSON5.parse(match[2]);
                            const primaryKeyValue = dataArray[0];
                            rowIndex = sheet.getContent().findIndex(row => String(row[0]) === String(primaryKeyValue));
                            data = {};
                            dataArray.forEach((val, i) => { if(i>0) data[i-1] = val; });
                        }

                        if (rowIndex !== -1) {
                            let updated = false;
                            Object.entries(data).forEach(([key, value]) => {
                                const colIndex = parseInt(key) + 1;
                                const cell = sheet.findCellByPosition(rowIndex + 1, colIndex);
                                if (cell) {
                                    cell.newAction(cell.CellAction.editCell, { value: String(value) }, false);
                                    updated = true;
                                }
                            });
                            if (updated) operationsApplied++;
                        }
                    }
                } else if (opStr.startsWith('deleteRow(')) {
                    match = opStr.match(/deleteRow\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
                    if (match) {
                        const tableIndex = parseInt(match[1], 10);
                        const rowIndex = parseInt(match[2], 10);
                        const sheet = latestSheets[tableIndex];
                        if (!sheet) continue;
                        const cell = sheet.findCellByPosition(rowIndex + 1, 0);
                        if (cell) {
                            cell.newAction(cell.CellAction.deleteSelfRow, {}, false);
                            operationsApplied++;
                        }
                    }
                }
            } catch (e) {
                console.error(`Error processing operation "${opStr}":`, e);
            }
        }

        if (operationsApplied === 0 && operations.length > 0) {
             EDITOR.error("AI返回的操作指令未能成功应用到表格。请检查开发者控制台。");
             return 'error';
        }

        const currentChat = USER.getContext().chat[USER.getContext().chat.length - 1];
        if (currentChat) {
            currentChat.hash_sheets = {};
            latestSheets.forEach(sheet => sheet.save(currentChat));
            await USER.getContext().saveChat();
        } else {
            EDITOR.error("无法更新聊天记录：找不到当前聊天。");
            return 'error';
        }

        refreshContextView();
        updateSystemMessageTableStatus();
        EDITOR.success(isStepByStepSummary ? '分步总结完成！' : '表格整理完成！');
        return 'success';

    } catch (error) {
        console.error('执行增量更新时出错:', error);
        EDITOR.error(`执行增量更新失败：${error.message}`);
        return 'error';
    }
}

export function sheetsToTables(sheets) {
    return sheets.map((sheet, index) => ({
        tableName: sheet.name,
        tableIndex: index,
        columns: sheet.getHeader(),
        content: sheet.getContent()
    }))
}

export async function triggerStepByStepNow() {
    console.log('[Memory Enhancement] Manually triggering step-by-step update by calling TableTwoStepSummary(true)...');
    EDITOR.info("正在启动手动分步填表...");
    await TableTwoStepSummary(true); 
}

export async function rebuildSheets() {
    const container = document.createElement('div');
    const h3Element = document.createElement('h3');
    h3Element.textContent = '重建表格数据';
    container.appendChild(h3Element);
    const confirmation = new EDITOR.Popup(container, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    await confirmation.show();
    if (confirmation.result) {
        getPromptAndRebuildTable();
    }
}

export async function modifyRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    if(selectedTemplate === 'rebuild_base') 
        return EDITOR.warning('默认模板不能修改，请新建模板');
    const sheetConfig= {
        formTitle: "编辑重整理模板",
        fields: [
            { label: '模板名字', type: 'label', text: selectedTemplate },
            { label: '破限内容', type: 'textarea', rows: 6, dataKey: 'system_prompt' },
            { label: '整理规则', type: 'textarea', rows: 6, dataKey: 'user_prompt_begin' },
        ],
    }
    const initialData = USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate];
    const formInstance = new Form(sheetConfig, initialData);
    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "保存", cancelButton: "取消" });
    await popup.show();
    if (popup.result) {
        const result = formInstance.result();
        USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate] = { ...result, name: selectedTemplate };
        EDITOR.success(`修改模板 "${selectedTemplate}" 成功`);
    }
}

function createUniqueName(baseName) {
    let name = baseName;
    let counter = 1;
    while (USER.tableBaseSetting.rebuild_message_template_list[name]) {
        name = `${baseName} (${counter})`;
        counter++;
    }
    return name;
}

export async function newRebuildTemplate() {
    const sheetConfig= {
        formTitle: "新建重整理模板",
        fields: [
            { label: '模板名字', type: 'text', dataKey: 'name' },
            { label: '破限内容', type: 'textarea', rows: 6, dataKey: 'system_prompt' },
            { label: '整理规则', type: 'textarea', rows: 6, dataKey: 'user_prompt_begin' },
        ],
    }
    const initialData = {
        name: "新重整理模板",
        system_prompt: USER.tableBaseSetting.rebuild_default_system_message_template,
        user_prompt_begin: USER.tableBaseSetting.rebuild_default_message_template,
    };
    const formInstance = new Form(sheetConfig, initialData);
    const popup = new EDITOR.Popup(formInstance.renderForm(), EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "保存", cancelButton: "取消" });
    await popup.show();
    if (popup.result) {
        const result = formInstance.result();
        const name  = createUniqueName(result.name);
        result.name = name;
        USER.tableBaseSetting.rebuild_message_template_list[name] = result;
        USER.tableBaseSetting.lastSelectedTemplate = name;
        refreshRebuildTemplate();
        EDITOR.success(`新建模板 "${name}" 成功`);
    }
}

export async function deleteRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    if (selectedTemplate === 'rebuild_base') {
        return EDITOR.warning('默认模板不能删除');
    }
    const confirmation = await EDITOR.callGenericPopup('是否删除此模板？', EDITOR.POPUP_TYPE.CONFIRM);
    if (confirmation) {
        delete USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate];
        USER.tableBaseSetting.lastSelectedTemplate = 'rebuild_base';
        refreshRebuildTemplate();
        EDITOR.success(`删除模板 "${selectedTemplate}" 成功`);
    }
}

export async function exportRebuildTemplate() {
    const selectedTemplate = USER.tableBaseSetting.lastSelectedTemplate;
    if (selectedTemplate === 'rebuild_base') return EDITOR.warning('默认模板不能导出');
    const template = USER.tableBaseSetting.rebuild_message_template_list[selectedTemplate];
    if (!template) return EDITOR.error(`未找到模板 "${selectedTemplate}"`);
    
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTemplate}.json`;
    a.click();
    URL.revokeObjectURL(url);
    EDITOR.success(`导出模板 "${selectedTemplate}" 成功`);
}

export async function importRebuildTemplate() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const template = JSON.parse(text);
            if (!template.name || !template.system_prompt || !template.user_prompt_begin) {
                throw new Error('无效的模板格式');
            }
            const name = createUniqueName(template.name);
            template.name = name;
            USER.tableBaseSetting.rebuild_message_template_list[name] = template;
            USER.tableBaseSetting.lastSelectedTemplate = name;
            refreshRebuildTemplate();
            EDITOR.success(`导入模板 "${name}" 成功`);
        } catch (error) {
            EDITOR.error(`导入失败：${error.message}`);
        }
    });
    input.click();
}
