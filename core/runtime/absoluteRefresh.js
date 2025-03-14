import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import {copyTableList, findLastestTableData, findTableStructureByIndex } from "../../index.js";
import {insertRow, updateRow, deleteRow} from "../source/tableActions.js";
import JSON5 from '../../utils/json5.min.mjs'
import {updateSystemMessageTableStatus} from "./tablePushToChat.js";
import {renderTablesDOM,pasteTable} from "../editor/tableDataView.js";
import {estimateTokenCount, handleCustomAPIRequest, handleMainAPIRequest} from "../source/standaloneAPI.js";
import {profile_prompts} from "../../data/profile_prompts.js";

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
/**
 * 显示表格刷新配置信息，用于二次确认
 * @param {*} callerType 用于调用的时候控制显示的信息，
 * 默认值 0 表示保持原样  1 rebuild 不显示"不允许AI删除"
 * @returns
 */
function getRefreshTableConfigStatus(callerType = 0) {
    // 显示所有相关的配置信息
    const userApiUrl = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
    const userApiModel = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
    const userApiTemperature = USER.tableBaseSetting.custom_temperature;
    const clearUpStairs = USER.tableBaseSetting.clear_up_stairs;
    const isIgnoreDel = USER.tableBaseSetting.bool_ignore_del;
    const isIgnoreUserSent = USER.tableBaseSetting.ignore_user_sent;
    const isUseTokenLimit = USER.tableBaseSetting.use_token_limit;
    const rebuild_token_limit_value = USER.tableBaseSetting.rebuild_token_limit_value;
    const isUseMainAPI = USER.tableBaseSetting.use_main_api;

    const refreshType = $('#table_refresh_type_selector').val();
    const selectedPrompt = profile_prompts[refreshType];
    if(selectedPrompt === undefined) {
        EDITOR.error(`未找到对应的提示模板: ${refreshType}`);
        console.error(`未找到对应的提示模板: ${refreshType}`);
        return;
    }

    return `<div class="wide100p padding5 dataBankAttachments">
                <span>将重新整理表格，是否继续？</span><br><span style="color: rgb(211 39 39)">（建议重置前先备份数据）</span>
                <br><div id="config_sheet_container" style="justify-content: center; display: flex; margin: 10px;">
                    <table class="table table-bordered table-striped">
                        <thead><tr><th>配置项</th><th style="padding: 0 20px">配置值</th></tr></thead>
                        <tbody>
                        <tr> <td>当前整理方式</td> <td>${selectedPrompt.name}</td> </tr>
                        ${isUseTokenLimit ? `
                        <tr> <td>发送的聊天记录token数限制</td> <td>${rebuild_token_limit_value}</td> </tr>
                        ` : `
                        <tr> <td>纳入参考的聊天记录</td> <td>${clearUpStairs}条</td> </tr>
                        `}
                        <td>忽略用户消息</td> <td>${isIgnoreUserSent ? '是' : '否'}</td>
                        ${callerType === 1 ? '' : `<tr> <td>不允许AI删除</td> <td>${isIgnoreDel ? '是' : '否'}</td> </tr>`}
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
 * 根据选择的刷新类型获取对应的提示模板并调用rebuildTableActions
 * @param {string} templateName 提示模板名称
 * @returns {Promise<void>}
 */
export async function getPromptAndRebuildTable(templateName = '') {
    // 获取选择的刷新类型
    const refreshType = templateName || $('#table_refresh_type_selector').val();
    // 从profile_prompts中获取对应类型的提示模板
    let systemPrompt = '';
    let userPrompt = '';

    try {
        // 根据刷新类型获取对应的提示模板
        const selectedPrompt = profile_prompts[refreshType];
        if (!selectedPrompt) {
            throw new Error('未找到对应的提示模板');
        }
        console.log('选择的提示模板名称:', selectedPrompt.name);

        systemPrompt = selectedPrompt.system_prompt;
        // 构建userPrompt，由四部分组成：user_prompt_begin、history、last_table和core_rules
        userPrompt = selectedPrompt.user_prompt_begin || '';
        // 根据include_history决定是否包含聊天记录部分
        if (selectedPrompt.include_history) {
            userPrompt += `\n<聊天记录>\n    $1\n</聊天记录>\n`;
        }
        // 根据include_last_table决定是否包含当前表格部分
        if (selectedPrompt.include_last_table) {
            userPrompt += `\n<当前表格>\n    $0\n</当前表格>\n`;
        }
        // 添加core_rules部分
        if (selectedPrompt.core_rules) {
            userPrompt += `\n${selectedPrompt.core_rules}`;
        }

        // 将获取到的提示模板设置到USER.tableBaseSetting中
        USER.tableBaseSetting.rebuild_system_message_template = systemPrompt;
        USER.tableBaseSetting.rebuild_user_message_template = userPrompt;

        console.log('获取到的提示模板:', systemPrompt, userPrompt);

        // 根据提示模板类型选择不同的表格处理函数
        const force = $('#bool_force_refresh').prop('checked');
        const silentUpdate = $('#bool_silent_refresh').prop('checked');
        if (selectedPrompt.type === 'rebuild') {
            await rebuildTableActions(force, silentUpdate);
        } else if (selectedPrompt.type === 'refresh') {
            await refreshTableActions(force, silentUpdate);
        } else {
            // 默认使用rebuildTableActions
            await rebuildTableActions(force, silentUpdate);
        }
    } catch (error) {
        console.error('获取提示模板失败:', error);
        EDITOR.error(`获取提示模板失败: ${error.message}`);
    }
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
        const tableRefreshPopup = getRefreshTableConfigStatus(1);
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

        let originText = tablesToString(latestTables);
        // let originText = '\n<表格内容>\n' + tablesToString(latestTables) + '\n</表格内容>';

        // console.log('最新的表格数据:', originText);

        // 获取最近clear_up_stairs条聊天记录
        const chat = USER.getContext().chat;
        const lastChats = chatToBeUsed === '' ? await getRecentChatHistory(chat,
            USER.tableBaseSetting.clear_up_stairs,
            USER.tableBaseSetting.ignore_user_sent,
            USER.tableBaseSetting.use_token_limit ? USER.tableBaseSetting.rebuild_token_limit_value:0
        ) : chatToBeUsed;

        // 构建AI提示
        let systemPrompt = USER.tableBaseSetting.rebuild_system_message_template||USER.tableBaseSetting.rebuild_system_message;
        let userPrompt = USER.tableBaseSetting.rebuild_user_message_template;
        // 搜索systemPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        systemPrompt = systemPrompt.replace(/\$0/g, originText);
        systemPrompt = systemPrompt.replace(/\$1/g, lastChats);
        // 搜索userPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        userPrompt = userPrompt.replace(/\$0/g, originText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);

        // console.log('systemPrompt:', systemPrompt);
        // console.log('userPrompt:', userPrompt);

        console.log('预估token数量为：'+estimateTokenCount(systemPrompt+userPrompt));

        // 生成响应内容
        let rawContent;
        if (isUseMainAPI) {
            try{
                rawContent = await handleMainAPIRequest(systemPrompt, userPrompt);
            }catch (error) {
                EDITOR.error('主API请求错误: ' + error.message);
            }
        }
        else {
            try {
                rawContent = await handleCustomAPIRequest(systemPrompt, userPrompt);
            } catch (error) {
                EDITOR.error('自定义API请求错误: ' + error.message);
            }
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
                const chat = USER.getContext().chat;
                const lastIndex = chat.length - 1;
                if (lastIndex >= 0) {
                    chat[lastIndex].dataTable = clonedTables;
                    await USER.getContext().saveChat(); // 等待保存完成
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
        let chat = USER.getContext().chat;
        const lastChats = chatToBeUsed === '' ? await getRecentChatHistory(chat, USER.tableBaseSetting.clear_up_stairs, USER.tableBaseSetting.ignore_user_sent) : chatToBeUsed;

        // 构建AI提示
        let systemPrompt = USER.tableBaseSetting.refresh_system_message_template;
        let userPrompt = USER.tableBaseSetting.refresh_user_message_template;

        // 搜索systemPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        systemPrompt = systemPrompt.replace(/\$0/g, originText);
        systemPrompt = systemPrompt.replace(/\$1/g, lastChats);

        // 搜索userPrompt中的$0和$1字段，将$0替换成originText，将$1替换成lastChats
        userPrompt = userPrompt.replace(/\$0/g, originText);
        userPrompt = userPrompt.replace(/\$1/g, lastChats);

        // 生成响应内容
        let rawContent;
        if (isUseMainAPI) {
            try{
                rawContent = await handleMainAPIRequest(systemPrompt, userPrompt);
            }catch (error) {
                EDITOR.error('主API请求错误: ' + error.message);
            }
        }
        else {
            try {
                rawContent = await handleCustomAPIRequest(systemPrompt, userPrompt);
            } catch (error) {
                EDITOR.error('自定义API请求错误: ' + error.message);
            }
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
                    if (action.tableIndex === 0 || !USER.tableBaseSetting.bool_ignore_del) {
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
        chat = USER.getContext().chat[USER.getContext().chat.length - 1];
        chat.dataTable = DERIVED.any.waitingTable;
        USER.getContext().saveChat();
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

        return new DERIVED.Table(
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
* 提取聊天记录获取功能
* 提取最近的chatStairs条聊天记录
* @param {Array} chat - 聊天记录数组
* @param {number} chatStairs - 要提取的聊天记录数量
* @param {boolean} ignoreUserSent - 是否忽略用户发送的消息
* @param {number|null} tokenLimit - 最大token限制，null表示无限制，优先级高于chatStairs
* @returns {string} 提取的聊天记录字符串
*/
async function getRecentChatHistory(chat, chatStairs, ignoreUserSent = false, tokenLimit = 0) {
    let filteredChat = chat;

    // 处理忽略用户发送消息的情况
    if (ignoreUserSent && chat.length > 0) {
        const senderName = chat[chat.length - 1].name;
        filteredChat = chat.filter(c => c.name === senderName);
    }

    // 有效记录提示
    if (filteredChat.length < chatStairs && tokenLimit === 0) {
        EDITOR.success(`当前有效记录${filteredChat.length}条，小于设置的${chatStairs}条`);
    }

    const collected = [];
    let totalTokens = 0;

    // 从最新记录开始逆序遍历
    for (let i = filteredChat.length - 1; i >= 0; i--) {
        // 格式化消息并清理标签
        const currentStr = `${filteredChat[i].name}: ${filteredChat[i].mes}`
           .replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');

        // 计算Token
        const tokens = await estimateTokenCount(currentStr);

        // 如果是第一条消息且token数超过限制，直接添加该消息
        if (i === filteredChat.length - 1 && tokenLimit!== 0 && tokens > tokenLimit) {
            totalTokens = tokens;
            EDITOR.success(`最近的聊天记录Token数为${tokens}，超过设置的${tokenLimit}限制，将直接使用该聊天记录`);
            console.log(`最近的聊天记录Token数为${tokens}，超过设置的${tokenLimit}限制，将直接使用该聊天记录`);
            collected.push(currentStr);
            break;
        }

        // Token限制检查
        if (tokenLimit!== 0 && (totalTokens + tokens) > tokenLimit) {
            EDITOR.success(`本次发送的聊天记录Token数约为${totalTokens}，共计${collected.length}条`);
            console.log(`本次发送的聊天记录Token数约为${totalTokens}，共计${collected.length}条`);
            break;
        }

        // 更新计数
        totalTokens += tokens;
        collected.push(currentStr);

        // 当 tokenLimit 为 0 时，进行聊天记录数量限制检查
        if (tokenLimit === 0 && collected.length >= chatStairs) {
            break;
        }
    }

    // 按时间顺序排列并拼接
    const chatHistory = collected.reverse().join('\n');
    return chatHistory;
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
    const safeParse = (str) => {
        try {
            return JSON.parse(str);
        } catch (primaryError) {
            // 深度清洗：处理未闭合引号和注释
            const deepClean = str
                .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')  // 修复键名引号
                .replace(/\/\/.*?\n/g, '')    // 移除行注释
                .replace(/([:,])\s*([^"{[\s-]+)(\s*[}\]])/g, '$1 "$2"$3') // 补全缺失引号
                .replace(/'/g, '"')           // 单引号转双引号
                .replace(/(\w)\s*"/g, '$1"')  // 清理键名后多余空格
                .replace(/,\s*]/g, ']')       // 移除尾逗号
                .replace(/}\s*{/g, '},{');    // 修复缺失的数组分隔符

            try {
                return JSON.parse(deepClean);
            } catch (fallbackError) {
                throw new Error(`解析失败: ${fallbackError.message}`);
            }
        }
    };

    const extractTable = (text) => {
        // 匹配包含6个表格的特征（如"tableIndex":5）
        const comprehensiveRegex = /(\[\s*{[\s\S]*?"tableIndex":\s*5[\s\S]*?}\s*\])/;
        const match = text.match(comprehensiveRegex);
        if (match) return match[1];

        // 兜底：直接提取最长的疑似JSON数组
        const candidates = text.match(/\[[^\[\]]*\]/g) || [];
        return candidates.sort((a, b) => b.length - a.length)[0];
    };

    // 主流程
    try {
        let jsonStr = cleanApiResponse(inputText)
        console.log('cleanApiResponse预处理后:', jsonStr);
        jsonStr = extractTable(jsonStr);
        console.log('extractTable提取后:', jsonStr);
        if (!jsonStr) throw new Error("未找到有效表格数据");

        // 关键预处理：修复常见格式错误
        jsonStr = jsonStr
            .replace(/(\w)\s*"/g, '$1"')       // 键名后空格
            .replace(/:\s*([^"{\[]+)(\s*[,}])/g, ': "$1"$2')  // 值缺失引号
            .replace(/"tableIndex":\s*"(\d+)"/g, '"tableIndex": $1')  // 移除tableIndex的引号
            .replace(/"\s*\+\s*"/g, '')         // 拼接字符串残留
            .replace(/\\n/g, '')                // 移除换行转义
            .replace(/({|,)\s*([a-zA-Z_]+)\s*:/g, '$1"$2":') // 键名标准化
            .replace(/"(\d+)":/g, '$1:')  // 修复数字键格式

        console.log('关键预处理修复常见格式错误后:', jsonStr);

        // 强约束解析
        let tables = safeParse(jsonStr);
        console.log('safeParse强约束解析后:', tables);

        if (tables.length < 6) throw new Error("提取的表格数量不足");
        tables = tables.map(table => ({  // 新增：类型转换
            ...table,
            tableIndex: parseInt(table.tableIndex) || 0
        }));


        // 列对齐修正（原逻辑保留）
        return tables.map(table => {
            const columnCount = table.columns.length;
            table.content = table.content.map(row =>
                Array.from({ length: columnCount }, (_, i) => row[i]?.toString().trim() || "")
            );
            return table;
        });
    } catch (error) {
        console.error("修复失败:", error);
        console.error("修复失败，尝试最后手段...");
        // 暴力提取所有可能表格
        const rawTables = inputText.match(/{[^}]*?"tableIndex":\s*\d+[^}]*}/g) || [];
        console.log('暴力提取所有可能表格:', rawTables);
        const sixTables = rawTables.slice(0,6).map(t => JSON.parse(t.replace(/'/g, '"')));
        console.log('前6个表格为:', sixTables);
        return sixTables
    }
}
