import { eventSource, event_types } from '../../../../script.js';
import {DERIVED, EDITOR, SYSTEM} from './core/manager.js';
import { refreshTableActions, updateModelList } from './core/derived/absoluteRefresh.js';
import {openTableRendererPopup, updateSystemMessageTableStatus} from "./core/derived/tablePushToChat.js";
import {openTableHistoryPopup} from "./core/derived/tableHistory.js";
import {loadSettings} from "./core/derived/userExtensionSetting.js";
import {openTableSettingPopup} from "./core/derived/tableStructureSetting.js";
import {openTablePopup, tableCellClickEvent} from "./core/derived/tableDataView.js";
import {initAllTable} from "./core/source/tableActions.js";
import {openTableDebugLogPopup} from "./core/derived/devConsole.js";
import {TableTwoStepSummary} from "./core/derived/separateTableUpdate.js";

console.log("______________________记忆插件：开始加载______________________")

const VERSION = '1.3.0'

const editErrorInfo = {
    forgotCommentTag: false,
    functionNameError: false,
}

/**
 * 通过表格索引查找表格结构
 * @param {number} index 表格索引
 * @returns 此索引的表格结构
 */
export function findTableStructureByIndex(index) {
    return EDITOR.data.tableStructure.find(table => table.tableIndex === index);
}

/**
 * 检查数据是否为Table实例，不是则重新创建
 * @param {Table[]} dataTable 所有表格对象数组
 */
function checkPrototype(dataTable) {
    for (let i = 0; i < dataTable.length; i++) {
        if (!(dataTable[i] instanceof DERIVED.Table)) {
            const table = dataTable[i]
            dataTable[i] = new DERIVED.Table(table.tableName, table.tableIndex, table.columns, table.content, table.insertedRows, table.updatedRows)
        }
    }
}

/**
 * 寻找最新的表格数据，若没有，就新建一个
 * @param isIncludeEndIndex 搜索时是否包含endIndex
 * @param endIndex 结束索引，自此索引向上寻找，默认是最新的消息索引
 * @returns 自结束索引向上寻找，最近的表格数据
 */
export function findLastestTableData(isIncludeEndIndex = false, endIndex = -1) {
    let chat = EDITOR.getContext().chat
    if (endIndex === -1) chat = isIncludeEndIndex ? chat : chat.slice(0, -1)
    else chat = chat.slice(0, isIncludeEndIndex ? endIndex + 1 : endIndex)
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable)
            return { tables: chat[i].dataTable, index: i }
        }
    }
    const newTableList = initAllTable()
    for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i].is_user === false) {
            return { tables: newTableList, index: i }
        }
    }
    return { tables: newTableList, index: -1 }
}

/**
 * 寻找下一个含有表格数据的消息，如寻找不到，则返回null
 * @param startIndex 开始寻找的索引
 * @param isIncludeStartIndex 是否包含开始索引
 * @returns 寻找到的mes数据
 */
export function findNextChatWhitTableData(startIndex, isIncludeStartIndex = false) {
    if (startIndex === -1) return { index: - 1, chat: null }
    const chat = EDITOR.getContext().chat
    for (let i = isIncludeStartIndex ? startIndex : startIndex + 1; i < chat.length; i++) {
        if (chat[i].is_user === false && chat[i].dataTable) {
            checkPrototype(chat[i].dataTable)
            return { index: i, chat: chat[i] }
        }
    }
    return { index: - 1, chat: null }
}

/**
 * 搜寻最后一个含有表格数据的消息，并生成提示词
 * @returns 生成的完整提示词
 */
export function initTableData() {
    if (EDITOR.data.step_by_step === true) return '';

    const { tables } = findLastestTableData(true)
    const promptContent = getAllPrompt(tables)
    console.log("完整提示", promptContent)
    return promptContent
}

/**
 * 获取所有的完整提示词
 * @param {Table[]} tables 所有表格对象数组
 * @returns 完整提示词
 */
function getAllPrompt(tables) {
    const tableDataPrompt = tables.map(table => table.getTableText()).join('\n')
    return EDITOR.data.message_template.replace('{{tableData}}', tableDataPrompt)
}

/**
 * 深拷贝所有表格数据，拷贝时保留 Table 类的原型链
 * @param {Table[]} tableList 要拷贝的表格对象数组
 * @returns 拷贝后的表格对象数组
 */
export function copyTableList(tableList) {
    return tableList.map(table => {
        const newTable = new DERIVED.Table(table.tableName, table.tableIndex, table.columns, JSON.parse(JSON.stringify(table.content)));
        newTable.insertedRows = [...table.insertedRows];
        newTable.updatedRows = [...table.updatedRows];
        return newTable;
    });
}



/**
 * 将匹配到的整体字符串转化为单个语句的数组
 * @param {string[]} matches 匹配到的整体字符串
 * @returns 单条执行语句数组
 */
function handleTableEditTag(matches) {
    let functionList = [];
    matches.forEach(matchBlock => {
        const lines = trimString(matchBlock)
            .split('\n')
            .filter(line => line.length > 0);
        let currentFunction = '';
        let parenthesisCount = 0;
        for (const line of lines) {
            const trimmedLine = line.trim()
            if (trimmedLine.startsWith('//')) {
                functionList.push(trimmedLine)
                continue
            };
            currentFunction += trimmedLine;
            parenthesisCount += (trimmedLine.match(/\(/g) || []).length;
            parenthesisCount -= (trimmedLine.match(/\)/g) || []).length;
            if (parenthesisCount === 0 && currentFunction) {
                const formatted = currentFunction
                    .replace(/\s*\(\s*/g, '(')   // 移除参数括号内空格
                    .replace(/\s*\)\s*/g, ')')   // 移除结尾括号空格
                    .replace(/\s*,\s*/g, ',');   // 统一逗号格式
                functionList.push(formatted);
                currentFunction = '';
            }
        }
    });
    return functionList;
}

/**
 * 检查表格编辑字符串是否改变
 * @param {Chat} chat 单个聊天对象
 * @param {string[]} matches 新的匹配对象
 * @returns
 */
function isTableEditStrChanged(chat, matches) {
    if (chat.tableEditMatches != null && chat.tableEditMatches.join('') === matches.join('')) {
        return false
    }
    chat.tableEditMatches = matches
    return true
}

/**
 * 清除表格中的所有空行
 */
function clearEmpty() {
    DERIVED.any.waitingTable.forEach(table => {
        table.clearEmpty()
    })
}



/**
 * 处理文本内的表格编辑事件
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 * @returns
 */
export function handleEditStrInMessage(chat, mesIndex = -1, ignoreCheck = false) {
    if (!parseTableEditTag(chat, mesIndex, ignoreCheck)) {
        updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
        return
    }
    executeTableEditTag(chat, mesIndex)
    updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
}

/**
 * 解析回复中的表格编辑标签
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 * @param {boolean} ignoreCheck 是否跳过重复性检查
 */
export function parseTableEditTag(chat, mesIndex = -1, ignoreCheck = false) {
    const { matches } = getTableEditTag(chat.mes)
    if (!ignoreCheck && !isTableEditStrChanged(chat, matches)) return false
    const functionList = handleTableEditTag(matches)
    // 寻找最近的表格数据
    const { tables, index: lastestIndex } = findLastestTableData(false, mesIndex)
    DERIVED.any.waitingTableIndex = lastestIndex
    DERIVED.any.waitingTable = copyTableList(tables)
    clearEmpty()
    // 对最近的表格执行操作
    DERIVED.any.tableEditActions = functionList.map(functionStr => new DERIVED.TableEditAction(functionStr))
    dryRunExecuteTableEditTag()
    return true
}

/**
 * 执行回复中得编辑标签
 * @param {Chat} chat 单个聊天对象
 * @param {number} mesIndex 修改的消息索引
 */
function executeTableEditTag(chat, mesIndex = -1, ignoreCheck = false) {
    // 执行action
    DERIVED.any.waitingTable.forEach(table => table.clearInsertAndUpdate())
    DERIVED.any.tableEditActions.filter(action => action.able && action.type !== 'Comment').forEach(tableEditAction => tableEditAction.execute())
    clearEmpty()
    replaceTableEditTag(chat, getTableEditActionsStr())
    chat.dataTable = DERIVED.any.waitingTable
    // 如果不是最新的消息，则更新接下来的表格
    if (mesIndex !== -1) {
        const { index, chat: nextChat } = findNextChatWhitTableData(mesIndex)
        if (index !== -1) handleEditStrInMessage(nextChat, index, true)
    }
}

/**
 * 干运行获取插入action的插入位置和表格插入更新内容
 */
function dryRunExecuteTableEditTag() {
    DERIVED.any.waitingTable.forEach(table => table.dryRun(DERIVED.any.tableEditActions))
}

/**
 * 获取生成的操作函数字符串
 * @returns 生成的操作函数字符串
 */
export function getTableEditActionsStr() {
    const tableEditActionsStr = DERIVED.any.tableEditActions.filter(action => action.able && action.type !== 'Comment').map(tableEditAction => tableEditAction.format()).join('\n')
    return "\n<!--\n" + (tableEditActionsStr === '' ? '' : (tableEditActionsStr + '\n')) + '-->\n'
}

/**
 * 替换聊天中的TableEdit标签内的内容
 * @param {*} chat 聊天对象
 */
export function replaceTableEditTag(chat, newContent) {
    // 处理 mes
    if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.mes)) {
        chat.mes = chat.mes.replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>${newContent}</tableEdit>`);
    } else {
        chat.mes += `\n<tableEdit>${newContent}</tableEdit>`;
    }
    // 处理 swipes
    if (chat.swipes != null && chat.swipe_id != null)
        if (/<tableEdit>.*?<\/tableEdit>/gs.test(chat.swipes[chat.swipe_id])) {
            chat.swipes[chat.swipe_id] = chat.swipes[chat.swipe_id].replace(/<tableEdit>(.*?)<\/tableEdit>/gs, `<tableEdit>\n${newContent}\n</tableEdit>`);
        } else {
            chat.swipes[chat.swipe_id] += `\n<tableEdit>${newContent}</tableEdit>`;
        }
    EDITOR.getContext().saveChat();
}

/**
 * 读取设置中的注入角色
 * @returns 注入角色
 */
function getMesRole() {
    switch (EDITOR.data.injection_mode) {
        case 'deep_system':
            return 'system'
        case 'deep_user':
            return 'user'
        case 'deep_assistant':
            return 'assistant'
    }
}

/**
 * 注入表格总体提示词
 * @param {*} eventData
 * @returns
 */
async function onChatCompletionPromptReady(eventData) {
    try {
        updateSystemMessageTableStatus(eventData);   // 将表格数据状态更新到系统消息中
        if (eventData.dryRun === true || EDITOR.data.isExtensionAble === false || EDITOR.data.isAiReadTable === false) return

        const promptContent = initTableData()
        if (EDITOR.data.deep === 0)
            eventData.chat.push({ role: getMesRole(), content: promptContent })
        else
            eventData.chat.splice(-EDITOR.data.deep, 0, { role: getMesRole(), content: promptContent })
    } catch (error) {
        // 获取堆栈信息
        const stack = error.stack;
        let lineNumber = '未知行';
        if (stack) {
            // 尝试从堆栈信息中提取行号，这里假设堆栈信息格式是常见的格式，例如 "at functionName (http://localhost:8080/file.js:12:34)"
            const match = stack.match(/:(\d+):/); // 匹配冒号和数字，例如 ":12:"
            if (match && match[1]) {
                lineNumber = match[1] + '行';
            } else {
                // 如果无法提取到行号，则显示完整的堆栈信息，方便调试
                lineNumber = '行号信息提取失败，堆栈信息：' + stack;
            }
        }

        EDITOR.error(`记忆插件：表格数据注入失败\n原因：${error.message}\n位置：第${lineNumber}`);
    }
    console.log("注入表格总体提示词", eventData.chat)
}

/**
 * 去掉编辑指令两端的空格和注释标签
 * @param {string} str 输入的编辑指令字符串
 * @returns
 */
function trimString(str) {
    const str1 = str.trim()
    if (!str1.startsWith("<!--") || !str1.endsWith("-->")) {
        editErrorInfo.forgotCommentTag = true
    }
    return str1
        .replace(/^\s*<!--|-->?\s*$/g, "")
        .trim()
}

/**
 * 获取表格的tableEdit标签内的内容
 * @param {string} mes 消息正文字符串
 * @returns {matches} 匹配到的内容数组
 */
function getTableEditTag(mes) {
    const regex = /<tableEdit>(.*?)<\/tableEdit>/gs;
    const matches = [];
    let match;
    while ((match = regex.exec(mes)) !== null) {
        matches.push(match[1]);
    }
    const updatedText = mes.replace(regex, "");
    return { matches }
}

/**
 * 消息编辑时触发
 * @param this_edit_mes_id 此消息的ID
 */
async function onMessageEdited(this_edit_mes_id) {
    if (EDITOR.data.isExtensionAble === false) return
    if (EDITOR.data.step_by_step === true) {

    } else {
        const chat = EDITOR.getContext().chat[this_edit_mes_id]
        if (chat.is_user === true ||EDITOR.data.isAiWriteTable === false) return
        try {
            handleEditStrInMessage(chat, parseInt(this_edit_mes_id))
        } catch (error) {
            EDITOR.error("记忆插件：表格编辑失败\n原因：", error.message)
        }
    }
}

/**
 * 消息接收时触发
 * @param {number} chat_id 此消息的ID
 */
async function onMessageReceived(chat_id) {
    if (EDITOR.data.isExtensionAble === false) return
    if (EDITOR.data.step_by_step === true) {
        await TableTwoStepSummary();
    } else {
        if (EDITOR.data.isAiWriteTable === false) return
        const chat = EDITOR.getContext().chat[chat_id];
        console.log("收到消息", chat_id)
        try {
            handleEditStrInMessage(chat)
        } catch (error) {
            EDITOR.error("记忆插件：表格自动更改失败\n原因：", error.message)
        }
    }
}


/**
 * 滑动切换消息事件
 */
async function onMessageSwiped(chat_id) {
    if (EDITOR.data.isExtensionAble === false) return
    if (EDITOR.data.step_by_step === true) {
        await TableTwoStepSummary();
    } else {
        if (EDITOR.data.isAiWriteTable === false) return
        const chat = EDITOR.getContext().chat[chat_id];
        if (!chat.swipe_info[chat.swipe_id]) return
        try {
            handleEditStrInMessage(chat)
        } catch (error) {
            EDITOR.error("记忆插件：swipe切换失败\n原因：", error.message)
        }
    }
}



jQuery(async () => {
    fetch("http://api.muyoo.com.cn/check-version", {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVersion: VERSION, user: EDITOR.getContext().name1 })
    }).then(res => res.json()).then(res => {
        if (res.success) {
            if (!res.isLatest) $("#tableUpdateTag").show()
            if (res.toastr) EDITOR.warning(res.toastrText)
            if (res.message) $("#table_message_tip").html(res.message)
        }
    })

    // 开始添加各部分的根DOM
    // 添加表格编辑工具栏
    $('#translation_container').append(await SYSTEM.getComponent('index'));
    // 添加进入表格编辑按钮
    $('.extraMesButtons').append(`<div title="查看表格" class="mes_button fa-solid fa-table open_table_by_id" />`);
    // 添加表格编辑浮窗
    $('#data_bank_wand_container').append(`<div id="open_table" class="list-group-item flex-container flexGap5 interactable"><i class="fa-solid fa-table"></i>打开表格</div>`);
    // 添加表格编辑浮窗绑定打开表格事件
    $("#open_table").on('click', () => openTablePopup());

    // 应用程序启动时加载设置
    loadSettings();

    // 设置表格编辑按钮
    $(document).on('click', '.tableEditor_editButton', function () {
        let index = $(this).data('index'); // 获取当前点击的索引
        openTableSettingPopup(index);
    })
    // 点击表格渲染样式设置按钮
    $(document).on('click', '.tableEditor_renderButton', function () {
        openTableRendererPopup();
    })
    // 点击打开查看表格历史按钮
    $(document).on('click', '#dataTable_history_button', function () {
        openTableHistoryPopup();
    })
    // 点击打开查看表格日志按钮
    $(document).on('click', '#table_debug_log_button', function () {
        openTableDebugLogPopup();
    })
    // 对话数据表格弹出窗
    $(document).on('click', '.open_table_by_id', function () {
        const messageId = $(this).closest('.mes').attr('mesid');
        openTablePopup(parseInt(messageId));
    })
    // 设置表格开启开关
    $(document).on('change', '.tableEditor_switch', function () {
        let index = $(this).data('index'); // 获取当前点击的索引
        const tableStructure = findTableStructureByIndex(index);
        tableStructure.enable = $(this).prop('checked');
        EDITOR.saveSettingsDebounced();
    })

    // 监听主程序事件
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    eventSource.on(event_types.MESSAGE_EDITED, onMessageEdited);
    eventSource.on(event_types.MESSAGE_SWIPED, onMessageSwiped);
    console.log("______________________记忆插件：加载完成______________________")
});
