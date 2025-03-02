import { DERIVED, EDITOR, SYSTEM } from '../manager.js';
import {copyTableList, findLastestTableData, findTableStructureByIndex } from "../../index.js";
import {insertRow, updateRow, deleteRow} from "../source/tableActions.js";
import JSON5 from '../../utils/json5.min.mjs'
import {updateSystemMessageTableStatus} from "./tablePushToChat.js";
import {renderTablesDOM,pasteTable} from "./tableDataView.js";
import { Table } from "../source/table.js";

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


/**
 * 重新生成完整表格
 * @param {*} force 是否强制刷新
 * @param {*} silentUpdate  是否静默更新
 * @param chatToBeUsed
 * @returns
 */
export async function rebuildTableActions(force = false, silentUpdate = false, chatToBeUsed = '') {
    if (!SYSTEM.lazy('rebuildTableActions', 1000)) return;

    // 如果不是强制刷新，先确认是否继续
    if (!force) {
        // 显示配置状态
        const tableRefreshPopup = getRefreshTableConfigStatus();
        const confirmation = await EDITOR.callGenericPopup(tableRefreshPopup, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
        if (!confirmation) return;
    }

    // 开始重新生成完整表格
    console.log('开始重新生成完整表格');
    const isUseMainAPI = $('#use_main_api').prop('checked');
    const loadingToast = EDITOR.info(isUseMainAPI
          ? '正在使用【主API】重新生成完整表格...'
            : '正在使用【自定义API】重新生成完整表格...',
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

        let originText = '\n<表格内容>\n' + tablesToString(latestTables) + '\n</表格内容>';
        // console.log('最新的表格数据:', originText);

        // 获取最近clear_up_stairs条聊天记录
        const chat = EDITOR.getContext().chat;
        const lastChats = chatToBeUsed === '' ? await getRecentChatHistory(chat, EDITOR.data.clear_up_stairs) : chatToBeUsed;

        // 构建AI提示
        let systemPrompt = EDITOR.data.rebuild_system_message_template||EDITOR.data.rebuild_system_message;
        let userPrompt = EDITOR.data.rebuild_user_message_template;
        // 搜索systemPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        systemPrompt = systemPrompt.replace(/\$0/g, originText);
        systemPrompt = systemPrompt.replace(/\$1/g, lastChats);
        // 搜索userPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        userPrompt = userPrompt.replace(/\$0/g, originText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);

        console.log('systemPrompt:', systemPrompt);
        console.log('userPrompt:', userPrompt);

        // 生成响应内容
        let rawContent;
        if (isUseMainAPI) {
            rawContent = await handleMainAPIRequest(systemPrompt, userPrompt);
        }
        else {
            rawContent = await handleCustomAPIRequest(systemPrompt, userPrompt);
        }
        console.log('rawContent:', rawContent);

        //清洗
        let cleanContentTable = fixTableFormat(rawContent);
        console.log('cleanContent:', cleanContentTable);

        //将表格保存回去
        if (cleanContentTable) {
            try {
                // 验证数据格式
                if (!Array.isArray(cleanContentTable)) {
                    throw new Error("生成的新表格数据不是数组");
                }
                //标记改动
                compareAndMarkChanges(latestTables, cleanContentTable);
                // console.log('compareAndMarkChanges后的cleanContent:', cleanContentTable);

                // 深拷贝避免引用问题
                const clonedTables = tableDataToTables(cleanContentTable);
                console.log('深拷贝后的cleanContent:', clonedTables);

                // 如果不是静默更新，显示操作确认
                if (!silentUpdate){
                    // 将uniqueActions内容推送给用户确认是否继续
                    const confirmContent = confirmTheOperationPerformed(clonedTables);
                    const tableRefreshPopup = new EDITOR.Popup(confirmContent, EDITOR.POPUP_TYPE.TEXT, '', { okButton: "继续", cancelButton: "取消" });
                    EDITOR.clear();
                    await tableRefreshPopup.show();
                    if (!tableRefreshPopup.result) {
                        EDITOR.info('操作已取消');
                        return;
                    }
                }

                // 更新聊天记录
                const chat = EDITOR.getContext().chat;
                const lastIndex = chat.length - 1;
                if (lastIndex >= 0) {
                    chat[lastIndex].dataTable = clonedTables;
                    await EDITOR.getContext().saveChat(); // 等待保存完成
                } else {
                    throw new Error("聊天记录为空");
                }

                // 刷新 UI
                const tableContainer = document.querySelector('#tableContainer');
                if (tableContainer) {
                    renderTablesDOM(clonedTables, tableContainer, true);
                    updateSystemMessageTableStatus();
                    EDITOR.success('生成表格成功！');
                } else {
                    // console.error("无法刷新表格：容器未找到");
                    // EDITOR.error('生成表格失败：容器未找到');
                }
            } catch (error) {
                console.error('保存表格时出错:', error);
                EDITOR.error(`生成表格失败：${error.message}`);
            }
        } else {
            EDITOR.error("生成表格保存失败：内容为空");
        }

    }catch (e) {
        console.error('Error in rebuildTableActions:', e);
        return;
    }finally {
        EDITOR.clear(loadingToast);
    }
}

export async function refreshTableActions(force = false, silentUpdate = false, chatToBeUsed = '') {
    if (!SYSTEM.lazy('refreshTableActions', 1000)) return;

    // 如果不是强制刷新，先确认是否继续
    if (!force) {
        // 显示配置状态
        const tableRefreshPopup = getRefreshTableConfigStatus();
        const confirmation = await EDITOR.callGenericPopup(tableRefreshPopup, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
        if (!confirmation) return;
    }

    // 开始执行整理表格
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
        const lastChats = chatToBeUsed === '' ? await getRecentChatHistory(chat, EDITOR.data.clear_up_stairs) : chatToBeUsed;

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
        let rawContent;
        if (isUseMainAPI) {
            rawContent = await handleMainAPIRequest(systemPrompt, userPrompt);
        } else {
            rawContent = await handleCustomAPIRequest(systemPrompt, userPrompt);
        }

        //统一清洗
        let cleanContent = cleanApiResponse(rawContent);

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

            // 安全校验
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
            EDITOR.clear();
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

//请求模型列表
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


//=================================================================
//========================以下是辅助函数============================
//=================================================================



// 将Table数组序列化为字符串
function tablesToString(tables) {
    return JSON.stringify(tables.map(table => ({
      tableName: table.tableName,
      tableIndex: table.tableIndex,
      columns: table.columns,
      content: table.content
    })));
  }

// 将tablesData解析回Table数组
function tableDataToTables(tablesData) {
    return tablesData.map(item => {
        // 强制确保 columns 是数组，且元素为字符串
        const columns = Array.isArray(item.columns)
            ? item.columns.map(col => String(col)) // 强制转换为字符串
            : inferColumnsFromContent(item.content); // 从 content 推断

        return new Table(
            item.tableName || '未命名表格', // tableName
            item.tableIndex || 0,          // tableIndex
            columns,                       // columns
            item.content || [],            // content
            item.insertedRows || [],       // insertedRows
            item.updatedRows ||[]          // updatedRows
        );
    });
}

/**
 * 标记表格变动的内容，用于render时标记颜色
 * @param {*} oldTables
 * @param {*} newTables  *
 */
function compareAndMarkChanges(oldTables, newTables) {
    newTables.forEach((newTable, tableIndex) => {
        const oldTable = oldTables[tableIndex];
        newTable.insertedRows = [];
        newTable.updatedRows = [];

        // 标记新增行（过滤空行）
        newTable.content.filter(Boolean).forEach((_, rowIndex) => {
            if (rowIndex >= oldTable.content.filter(Boolean).length) {
                newTable.insertedRows.push(rowIndex);
            }
        });

        // 标记更新单元格（只比较有效行）
        oldTable.content.filter(Boolean).forEach((oldRow, rowIndex) => {
            const newRow = newTable.content[rowIndex];
            if (newRow) {
                oldRow.forEach((oldCell, colIndex) => {
                    if (newRow[colIndex] !== oldCell) {
                        newTable.updatedRows.push(`${rowIndex}-${colIndex}`);
                    }
                });
            }
        });
    });
}

function inferColumnsFromContent(content) {
    if (!content || content.length === 0) return [];
    const firstRow = content[0];
    return firstRow.map((_, index) => `列${index + 1}`);
}

/**
 * 加密
 * @param {*} rawKey - 原始密钥
 * @param {*} deviceId - 设备ID
 * @returns {string} 加密后的字符串
 */
export function encryptXor(rawKey, deviceId) {
    return Array.from(rawKey).map((c, i) =>
        c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)
    ).map(c => c.toString(16).padStart(2, '0')).join('');
}


/**
 * 解密
 * @param {string} encrypted - 加密的字符串
 * @param {string} deviceId - 设备ID
 * @returns {string|null} 解密后的字符串
 */
export async function decryptXor(encrypted, deviceId) {
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

/**
 * API KEY解密
 * @returns {string|null} 解密后的API密钥
 */
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

/**
* 提取聊天记录获取功能
* 提取最近的chatStairs条聊天记录
* @param {Array} chat - 聊天记录数组
* @param {number} chatStairs - 要提取的聊天记录数量
* @param {boolean} ignoreUserSent - 是否忽略用户发送的消息
* @returns {string} 提取的聊天记录字符串
*/
async function getRecentChatHistory(chat, chatStairs, ignoreUserSent = false) {
    let lastChats = '';

    // 忽略用户发送的消息
    if (ignoreUserSent) {
        //假定最后一层是收到的消息，只有这个名字保留
        const senderName = chat[chat.length - 1].name
        // 过滤出相同发送者的记录
        const filteredChat = chat.filter(c => c.name === senderName);

        if (filteredChat.length < chatStairs) {
            EDITOR.success(`当前有效记录${filteredChat.length}条，小于设置的${chatStairs}条`);
        }

        for (let i = Math.max(0, filteredChat.length - chatStairs); i < filteredChat.length; i++) {
            const currentChat = `${filteredChat[i].name}: ${filteredChat[i].mes}`.replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
            lastChats += `\n${currentChat}`;
        }
        return lastChats;
    };


    if (chat.length < chatStairs) {
        EDITOR.success(`当前聊天记录只有${chat.length}条，小于设置的${chatStairs}条`);
        for (let i = 0; i < chat.length; i++) {
            const currentChat = `${chat[i].name}: ${chat[i].mes}`.replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
            lastChats += `\n${currentChat}`;
        }
    } else {
        for (let i = Math.max(0, chat.length - chatStairs); i < chat.length; i++) {
            const currentChat = `${chat[i].name}: ${chat[i].mes}`.replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
            lastChats += `\n${currentChat}`;
        }
    }
    return lastChats;
}

/**
 * 清洗API返回的原始内容
 * @param {string} rawContent - 原始API响应内容
 * @param {Object} [options={}] - 清洗配置选项
 * @param {boolean} [options.removeCodeBlock=true] - 是否移除JSON代码块标记
 * @param {boolean} [options.extractJson=true] - 是否提取第一个JSON数组/对象
 * @param {boolean} [options.normalizeKeys=true] - 是否统一键名格式
 * @param {boolean} [options.convertSingleQuotes=true] - 是否转换单引号为双引号
 * @param {boolean} [options.removeBlockComments=true] - 是否移除块注释
 * @returns {string} 清洗后的标准化内容
 */
export function cleanApiResponse(rawContent, options = {}) {
    const {
        removeCodeBlock = true,       // 移除代码块标记
        extractJson = true,           // 提取JSON部分
        normalizeKeys = true,         // 统一键名格式
        convertSingleQuotes = true,   // 单引号转双引号
        removeBlockComments = true    // 移除块注释
    } = options;

    let content = rawContent;

    // 按顺序执行清洗步骤
    if (removeCodeBlock) {
        // 移除 ```json 和 ``` 代码块标记
        content = content.replace(/```json|```/g, '');
    }

    if (extractJson) {
        // 提取第一个完整的JSON数组/对象（支持跨行匹配）
        content = content.replace(/^[^[]*(\[.*\])[^]]*$/s, '$1');
    }

    if (normalizeKeys) {
        // 统一键名格式：将带引号或不带引号的键名标准化为带双引号
        content = content.replace(/([{,]\s*)(?:"?([a-zA-Z_]\w*)"?\s*:)/g, '$1"$2":');
    }

    if (convertSingleQuotes) {
        // 将单引号转换为双引号（JSON标准要求双引号）
        content = content.replace(/'/g, '"');
    }

    if (removeBlockComments) {
        // 移除 /* ... */ 形式的块注释
        content = content.replace(/\/\*.*?\*\//g, '');
    }

    // 去除首尾空白
    content = content.trim();
    console.log('清洗前的内容:', rawContent);
    console.log('清洗后的内容:', content);

    return content;
}

/**
 * 修复表格格式
 * @param {string} inputText - 输入的文本
 * @returns {string} 修复后的文本
 * */
function fixTableFormat(inputText) {
    // 提取表格核心内容
    const extractTable = (text) => {
        const match = text.match(/<新的表格>([\s\S]*?)<\/新的表格>/i);
        return match ? match[1] : text;
    };

    // 通用符号标准化
    const normalizeSymbols = (str) => str
        .replace(/[“”]/g, '"')          // 中文引号
        .replace(/‘’/g, "'")            // 中文单引号
        .replace(/，/g, ',')            // 中文逗号
        .replace(/（/g, '(').replace(/）/g, ')')  // 中文括号
        .replace(/；/g, ';')             // 中文分号
        .replace(/？/g, '?')            // 中文问号
        .replace(/！/g, '!')            // 中文叹号
        .replace(/\/\//g, '/');         // 错误斜杠

    // 智能括号修复
    const fixBrackets = (str) => {
        const stack = [];
        return str.split('').map(char => {
            if (char === '[' || char === '{') stack.push(char);
            if (char === ']' && stack[stack.length-1] === '[') stack.pop();
            if (char === '}' && stack[stack.length-1] === '{') stack.pop();
            return char;
        }).join('') + stack.map(c => c === '[' ? ']' : '}').join('');
    };

    // 列内容对齐修正
    const alignColumns = (tables) => tables.map(table => {
        const columnCount = table.columns.length;
        table.content = table.content.map(row =>
            Array.from({ length: columnCount }, (_, i) =>
                (row[i] || "").toString().trim() // 自动填充缺失列
            )
        );
        return table;
    });

    try {
        // 执行修正流程
        let jsonStr = extractTable(inputText);
        jsonStr = normalizeSymbols(jsonStr);
        jsonStr = fixBrackets(jsonStr);

        // 智能引号修复（处理未闭合引号）
        jsonStr = jsonStr.replace(/([:,]\s*)([^"{\[\]]+?)(\s*[}\]],?)/g, '$1"$2"$3')
                        .replace(/'/g, '"');

        // 解析并二次修正
        const tables = JSON.parse(jsonStr);
        return alignColumns(tables);
    } catch (error) {
        console.error("格式修正失败:", error);
        // 尝试容错解析
        return JSON.parse(jsonStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":'));
    }
}

/**主API调用
 * @param {string} systemPrompt - 系统提示
 * @param {string} userPrompt - 用户提示
 * @returns {Promise<string>} 生成的响应内容
 */
export async function handleMainAPIRequest(systemPrompt, userPrompt) {
    const response = await EDITOR.generateRaw(
        userPrompt,
        '',
        false,
        false,
        systemPrompt,
    );
    return response;
}

/**自定义API调用
 * @param {string} systemPrompt - 系统提示
 * @param {string} userPrompt - 用户提示
 * @returns {Promise<string>} 生成的响应内容
 */
export async function handleCustomAPIRequest(systemPrompt, userPrompt) {
    const USER_API_URL = EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
    const USER_API_KEY = await getDecryptedApiKey();
    const USER_API_MODEL = EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;

    if (!USER_API_URL || !USER_API_MODEL) {// 移除!USER_API_KEY检测，兼容本地模型和部分渠道
        EDITOR.error('请填写完整的自定义API配置');
        return;
    }

    const apiUrl = new URL(USER_API_URL);
    apiUrl.pathname = '/v1/chat/completions';

    const response = await fetch(apiUrl.href, {
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
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API请求失败 [${response.status}]: ${errorBody}`);
    }

    const result = await response.json();
    const rawContent = result.choices[0].message.content;
    return rawContent;
}
