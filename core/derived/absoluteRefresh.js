import { DERIVED, EDITOR, SYSTEM } from '../manager.js';
import {copyTableList, findLastestTableData, findTableStructureByIndex, } from "../../index.js";
import {insertRow, updateRow, deleteRow} from "../source/tableActions.js";
import JSON5 from '../../utils/json5.min.mjs'
import {updateSystemMessageTableStatus} from "./tablePushToChat.js";
import {renderTablesDOM} from "./tableDataView.js";


// 解密
async function decryptXor(encrypted, deviceId) {
    try {
        const bytes = encrypted.match(/.{1,2}/g).map(b =>
            parseInt(b, 16)
        );
        return String.fromCharCode(...bytes.map((b, i) =>
            b ^ deviceId.charCodeAt(i % deviceId.length)
        ));
    } catch(e) {
        console.error('解密失败:', e);
        return null;
    }
}

// api解密
async function getDecryptedApiKey() {
    try {
        const encrypted = EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_key;
        const deviceId = localStorage.getItem('st_device_id');
        if (!encrypted || !deviceId) return null;

        return await decryptXor(encrypted, deviceId);
    } catch (error) {
        console.error('API Key 解密失败:', error);
        return null;
    }
}


// 在解析响应后添加验证
function validateActions(actions) {
    if (!Array.isArray(actions)) {
        console.error('操作列表必须是数组');
        return false;
    }
    return actions.every(action => {
        // 检查必要字段
        if (!action.action || !['insert', 'update', 'delete'].includes(action.action.toLowerCase())) {
            console.error(`无效的操作类型: ${action.action}`);
            return false;
        }
        if (typeof action.tableIndex !== 'number') {
            console.error(`tableIndex 必须是数字: ${action.tableIndex}`);
            return false;
        }
        if (action.action !== 'insert' && typeof action.rowIndex !== 'number') {
            console.error(`rowIndex 必须是数字: ${action.rowIndex}`);
            return false;
        }
        // 检查 data 字段
        if (action.data && typeof action.data === 'object') {
            const invalidKeys = Object.keys(action.data).filter(k => !/^\d+$/.test(k));
            if (invalidKeys.length > 0) {
                console.error(`发现非数字键: ${invalidKeys.join(', ')}`);
                return false;
            }
        }
        return true;
    });
}

function getRefreshTableConfigStatus() {
    // 显示所有相关的配置信息
    const isUseMainAPI = EDITOR.data.use_main_api;
    const userApiUrl = EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
    const userApiModel = EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
    const userApiTemperature = EDITOR.data.custom_temperature;
    const clearUpStairs = EDITOR.data.clear_up_stairs;
    const isIgnoreDel = EDITOR.data.bool_ignore_del;
    const systemMessageTemplate = EDITOR.data.refresh_system_message_template;
    const userMessageTemplate = EDITOR.data.refresh_user_message_template;

    return `<div class="wide100p padding5 dataBankAttachments">
                <span>将重新整理表格，是否继续？</span><br><span style="color: rgb(211 39 39)">（建议重置前先备份数据）</span>
                <br><div id="config_sheet_container" style="justify-content: center; display: flex; margin: 10px;">
                    <table class="table table-bordered table-striped">
                        <thead><tr><th>配置项</th><th style="padding: 0 20px">配置值</th></tr></thead>
                        <tbody>
                        <tr> <td>纳入参考的聊天记录</td> <td>${clearUpStairs}条</td> </tr>
                        <tr> <td>不允许AI删除</td> <td>${isIgnoreDel ? '是' : '否'}</td> </tr>
                        <tr> <td>使用的API</td> <td>${isUseMainAPI ? '主API' : '自定义API'}</td> </tr>
                        ${isUseMainAPI ? '' : `
                        <tr> <td>API URL</td> <td>${userApiUrl}</td> </tr>
                        <tr> <td>API Model</td> <td>${userApiModel}</td> </tr>
                        <tr> <td>Temperature</td> <td>${userApiTemperature}</td> </tr>
                        `}
                        </tbody>
                    </table>
                </div>
            </div>
`;}

function confirmTheOperationPerformed(content) {
    return `
<div class="wide100p padding5 dataBankAttachments">
    <div class="refresh-title-bar">
        <h2 class="refresh-title"> 请确认以下操作 </h2>
        <div>

        </div>
    </div>
    <div id="tableRefresh" class="refresh-scroll-content">
        <div>
            <div class="operation-list-container"> ${content.map(action => {
        const { action: type, tableIndex, rowIndex, data } = action;
        return `<div class="operation-item">
                        <div class="operation-detail">
                            <span class="detail-label">操作类型:</span>
                            <span class="detail-value">${type}</span>
                        </div>
                        <div class="operation-detail">
                            <span class="detail-label">表格索引:</span>
                            <span class="detail-value">${tableIndex}</span>
                        </div>
                        <div class="operation-detail">
                            <span class="detail-label">行索引:</span>
                            <span class="detail-value">${rowIndex}</span>
                        </div>
                        <div class="operation-detail data-detail">
                            <span class="detail-label">数据:</span>
                            <div class="detail-value data-json">
                                ${typeof data === 'object' && data !== null ?
            Object.entries(data).map(([key, value]) => {
                return `<div class="json-item">
                        <span class="json-key">"${key}":</span>
                        <span class="json-value">"${value}"</span>
                    </div>`;
            }).join('')
            : `<span class="json-fallback">${JSON.stringify(data, null, 2)}</span>`
        }
                            </div>
                        </div>
                    </div>`;
    }).join('')}
            </div>
        </div>
    </div>
</div>
`;
}

export async function refreshTableActions(force = false, silentUpdate = false) {
    const tableRefreshPopup = (getRefreshTableConfigStatus());

    // 如果不是强制刷新，先确认是否继续
    if (!force) {
        // 显示配置状态
        const confirmation = await EDITOR.callGenericPopup(tableRefreshPopup, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
        if (!confirmation) return;
    }

    // 开始执行整理表格
    let response;
    const isUseMainAPI = $('#use_main_api').prop('checked');
    const loadingToast = EDITOR.info(isUseMainAPI
            ? '正在使用【主API】整理表格...'
            : '正在使用【自定义API】整理表格...',
        '',
        { timeOut: 0 }
    );
    try {
        const latestData = findLastestTableData(true);
        if (!latestData || typeof latestData !== 'object' || !('tables' in latestData)) {
            throw new Error('findLastestTableData 未返回有效的表格数据');
        }
        const { tables: latestTables } = latestData;
        DERIVED.any.waitingTable = copyTableList(latestTables);

        let originText = '<表格内容>\n' + latestTables
            .map(table => table.getTableText(['title', 'node', 'headers', 'rows']))
            .join("\n");

        // 获取最近clear_up_stairs条聊天记录
        let chat = EDITOR.getContext().chat;
        let lastChats = '';
        if (chat.length < EDITOR.data.clear_up_stairs) {
            EDITOR.success(`当前聊天记录只有${chat.length}条，小于设置的${EDITOR.data.clear_up_stairs}条`);
            for (let i = 0; i < chat.length; i++) {  // 从0开始遍历所有现有消息
                let currentChat = `${chat[i].name}: ${chat[i].mes}`.replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
                lastChats += `\n${currentChat}`;
            }
        } else {
            for (let i = Math.max(0, chat.length - EDITOR.data.clear_up_stairs); i < chat.length; i++) {
                let currentChat = `${chat[i].name}: ${chat[i].mes}`.replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
                lastChats += `\n${currentChat}`;
            }
        }

        // 构建AI提示
        let systemPrompt = EDITOR.data.refresh_system_message_template;
        let userPrompt = EDITOR.data.refresh_user_message_template;

        // 搜索systemPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        systemPrompt = systemPrompt.replace(/\$0/g, originText);
        systemPrompt = systemPrompt.replace(/\$1/g, lastChats);

        // 搜索userPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        userPrompt = userPrompt.replace(/\$0/g, originText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);

        // 生成响应内容
        let cleanContent;
        if (isUseMainAPI) {
            // 主API
            response = await EDITOR.generateRaw(
                userPrompt,
                '',
                false,
                false,
                systemPrompt,
            )
            console.log('原始响应内容:', response);

            // 清洗响应内容
            cleanContent = response
                .replace(/```json|```/g, '')
                .trim();
        } else {
            // 自定义API
            const USER_API_URL = EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
            const USER_API_KEY = await getDecryptedApiKey(); // 使用解密后的密钥
            const USER_API_MODEL = EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;

            if (!USER_API_URL || !USER_API_KEY || !USER_API_MODEL) {
                EDITOR.error('请填写完整的自定义API配置');
                return;
            }
            const apiUrl = new URL(USER_API_URL);
            apiUrl.pathname = '/v1/chat/completions';

            response = await fetch(apiUrl.href, { // <--- 使用 apiUrl.href 作为 URL
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${USER_API_KEY}`
                },
                body: JSON.stringify({
                    model: USER_API_MODEL,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: EDITOR.data.custom_temperature
                })
            }).catch(error => {
                throw new Error(`网络连接失败: ${error.message}`);
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API请求失败 [${response.status}]: ${errorBody}`);
            }

            const result = await response.json();
            const rawContent = result.choices[0].message.content;

            console.log('原始响应内容:', rawContent);
            // 清洗响应内容
            cleanContent = rawContent
                .replace(/```json|```/g, '') // 移除JSON代码块标记
                .replace(/([{,]\s*)(?:"?([a-zA-Z_]\w*)"?\s*:)/g, '$1"$2":') // 严格限定键名格式
                .replace(/'/g, '"') // 单引号转双引号
                .replace(/\/\*.*?\*\//g, '') // 移除块注释
                .trim();
        }

        // 解析响应内容
        let actions;
        try {
            // 增强清洗逻辑
            cleanContent = cleanContent
                // 时间格式保护（最先处理！！！！！）
                .replace(/(?<!")(\d{1,2}:\d{2})(?!")/g, '"$1"') // 使用负向断言确保不会重复处理
                // 统一键名处理
                .replace(/"([a-zA-Z_]\w*)"\s*:/g, '"$1":') // 仅处理合法键名格式
                // 尾逗号修复
                .replace(/,\s*([}\]])/g, '$1')
                // 数字键处理（需在时间处理后执行）
                .replace(/([{,]\s*)(\d+)(\s*:)/g, '$1"$2"$3')
                // 其他处理
                .replace(/\\\//g, '/')
                .replace(/\/\/.*/g, ''); // 行注释移除

            // 新增安全校验
            if (!cleanContent || typeof cleanContent !== 'string') {
                throw new Error('无效的响应内容');
            }

            actions = JSON5.parse(cleanContent);
            if (!validateActions(actions)) {
                throw new Error('AI返回了无效的操作格式');
            }
        } catch (parseError) {
            // 添加错误位置容错处理
            const position = parseError.position || 0;
            console.error('[解析错误] 详细日志：', {
                rawContent: cleanContent,
                errorPosition: parseError.stack,
                previewText: cleanContent.slice(
                    Math.max(0, position - 50),
                    position + 50
                )
            });
            throw new Error(`JSON解析失败：${parseError.message}`);
        }
        console.log('清洗后的内容:', cleanContent);

        // 去重并确保删除操作顺序
        let uniqueActions = [];
        const deleteActions = [];
        const nonDeleteActions = [];
        // 分离删除和非删除操作
        actions.forEach(action => {
            if (action.action.toLowerCase() === 'delete') {
                deleteActions.push(action);
            } else {
                nonDeleteActions.push(action);
            }
        });

        // 去重非删除操作，考虑表格现有内容
        const uniqueNonDeleteActions = nonDeleteActions.filter((action, index, self) => {
            if (action.action.toLowerCase() === 'insert') {
                const table = DERIVED.any.waitingTable[action.tableIndex];
                const dataStr = JSON.stringify(action.data);
                // 检查是否已存在完全相同的行
                const existsInTable = table.content.some(row => JSON.stringify(row) === dataStr);
                const existsInPreviousActions = self.slice(0, index).some(a =>
                    a.action.toLowerCase() === 'insert' &&
                    a.tableIndex === action.tableIndex &&
                    JSON.stringify(a.data) === dataStr
                );
                return !existsInTable && !existsInPreviousActions;
            }
            return index === self.findIndex(a =>
                a.action === action.action &&
                a.tableIndex === action.tableIndex &&
                a.rowIndex === action.rowIndex &&
                JSON.stringify(a.data) === JSON.stringify(action.data)
            );
        });

        // 去重删除操作并按 rowIndex 降序排序
        const uniqueDeleteActions = deleteActions
            .filter((action, index, self) =>
                    index === self.findIndex(a => (
                        a.tableIndex === action.tableIndex &&
                        a.rowIndex === action.rowIndex
                    ))
            )
            .sort((a, b) => b.rowIndex - a.rowIndex); // 降序排序，确保大 rowIndex 先执行

        // 合并操作：先非删除，后删除
        uniqueActions = [...uniqueNonDeleteActions, ...uniqueDeleteActions];

        // 如果不是静默更新，显示操作确认
        if (!silentUpdate){
            // 将uniqueActions内容推送给用户确认是否继续
            const confirmContent = confirmTheOperationPerformed(uniqueActions);
            const tableRefreshPopup = new EDITOR.Popup(confirmContent, EDITOR.POPUP_TYPE.TEXT, '', { okButton: "继续", cancelButton: "取消" });
            EDITOR.clear(loadingToast);
            await tableRefreshPopup.show();
            if (!tableRefreshPopup.result) {
                EDITOR.info('操作已取消');
                return;
            }
        }

        // 处理用户确认的操作
        // 执行操作
        uniqueActions.forEach(action => {
            switch (action.action.toLowerCase()) {
                case 'update':
                    try {
                        const targetRow = DERIVED.any.waitingTable[action.tableIndex].content[action.rowIndex];
                        if (!targetRow || !targetRow[0]?.trim()) {
                            console.log(`Skipped update: table ${action.tableIndex} row ${action.rowIndex} 第一列为空`);
                            break;
                        }
                        updateRow(action.tableIndex, action.rowIndex, action.data);
                        console.log(`Updated: table ${action.tableIndex}, row ${action.rowIndex}`, DERIVED.any.waitingTable[action.tableIndex].content[action.rowIndex]);
                    } catch (error) {
                        console.error(`Update操作失败: ${error.message}`);
                    }
                    break;
                case 'insert':
                    const requiredColumns = findTableStructureByIndex(action.tableIndex)?.columns || [];
                    const isDataComplete = requiredColumns.every((_, index) => action.data.hasOwnProperty(index.toString()));
                    if (!isDataComplete) {
                        console.error(`插入失败：表 ${action.tableIndex} 缺少必填列数据`);
                        break;
                    }
                    insertRow(action.tableIndex, action.data);
                    break;
                case 'delete':
                    if (action.tableIndex === 0 || !EDITOR.data.bool_ignore_del) {
                        const deletedRow = DERIVED.any.waitingTable[action.tableIndex].content[action.rowIndex];
                        deleteRow(action.tableIndex, action.rowIndex);
                        console.log(`Deleted: table ${action.tableIndex}, row ${action.rowIndex}`, deletedRow);
                    } else {
                        console.log(`Ignore: table ${action.tableIndex}, row ${action.rowIndex}`);
                        EDITOR.success('删除保护启用，已忽略了删除操作（可在插件设置中修改）');
                    }
                    break;
            }
        });

        // 更新聊天数据
        chat = EDITOR.getContext().chat[EDITOR.getContext().chat.length - 1];
        chat.dataTable = DERIVED.any.waitingTable;
        EDITOR.getContext().saveChat();

        // 刷新 UI
        const tableContainer = document.querySelector('#tableContainer');
        renderTablesDOM(DERIVED.any.waitingTable, tableContainer, true);
        updateSystemMessageTableStatus()
        EDITOR.success('表格整理完成');
    } catch (error) {
        console.error('整理过程出错:', error);
        EDITOR.error(`整理失败：${error.message}`);
    } finally {
        EDITOR.clear(loadingToast);
    }
}

export async function updateModelList(){
    const apiUrl = $('#custom_api_url').val().trim();
    const apiKey = await getDecryptedApiKey();// 使用解密后的API密钥

    if (!apiKey) {
        EDITOR.error('API key解密失败，请重新输入API key吧！');
        return;
    }
    if (!apiUrl) {
        EDITOR.error('请输入API URL');
        return;
    }

    try {
        // 规范化URL路径
        const normalizedUrl = new URL(apiUrl);
        normalizedUrl.pathname = '/v1/models';

        const response = await fetch(normalizedUrl, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`请求失败: ${response.status}`);

        const data = await response.json();
        const $selector = $('#model_selector').empty();

        data.data.forEach(model => {
            $selector.append($('<option>', {
                value: model.id,
                text: model.id
            }));
        });

        EDITOR.success('成功获取模型列表');
    } catch (error) {
        console.error('模型获取失败:', error);
        EDITOR.error(`模型获取失败: ${error.message}`);
    }
}
