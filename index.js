import {APP, BASE, DERIVED, EDITOR, SYSTEM, USER} from './manager.js';
import {openTableRendererPopup, updateSystemMessageTableStatus} from "./core/renderer/tablePushToChat.js";
import {openTableHistoryPopup} from "./core/editor/tableHistory.js";
import {loadSettings} from "./core/renderer/userExtensionSetting.js";
import {openTableSettingPopup} from "./core/editor/tableStructureSetting.js";
import {initAllTable} from "./core/tableActions.js";
import {openTableDebugLogPopup} from "./core/runtime/devConsole.js";
import {TableTwoStepSummary} from "./core/runtime/separateTableUpdate.js";
import {initTest} from "./components/_fotTest.js";
import JSON5 from './utils/json5.min.mjs'
import {initAppHeaderTableDrawer, openAppHeaderTableDrawer} from "./core/renderer/appHeaderTableBaseDrawer.js";
import { initRefreshTypeSelector } from './core/runtime/absoluteRefresh.js';
import {refreshTempView} from "./core/editor/tableTemplateEditView.js";
import {refreshContextView} from "./core/editor/chatSheetsDataView.js";
import LLMApiService from "./services/llmApi.js";
import {functionToBeRegistered} from "./services/debugs.js";


console.log("______________________记忆插件：开始加载______________________")

const VERSION = '2.0.0_dev'

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
    return USER.tableBaseSetting.tableStructure[index];
}

/**
 * 检查数据是否为Table实例，不是则重新创建
 * @param {DERIVED.Table[]} dataTable 所有表格对象数组
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
 * 寻找最新的SheetsPiece数据，若没有，就新建一个
 * @param isIncludeEndIndex 搜索时是否包含endIndex
 * @param endIndex 结束索引，自此索引向上寻找，默认是最新的消息索引
 * @returns 自结束索引向上寻找，最近的表格数据
 */
export function findLastestOldTablePiece(isIncludeEndIndex = false, endIndex = -1) {
    let chat = USER.getContext().chat
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
 * 转化旧表格 content 为 hashSheet
 * @param {string[][]} content 旧表格数据
 * @param {*} sheet 新表格
 */
function convertOldContentToHashSheet(content, sheet) {
    const cols = content[0].length + 1
    const rows = content.length + 1
    sheet.updateSheetStructure(cols, rows)
    for (let i = 0; i < content.length; i++) {
        for (let j = 0; j < content[i].length; j++) {
            const cell = sheet.findCellByPosition(j + 1, i + 1)
            cell.data.value = content[i][j]
        }
    }
    return sheet.hashSheet
}

/**
 * 深拷贝 hashSheet
 */
function copyHashSheet(hashSheet) {
    return hashSheet.map(row => row.map(cell => cell))
}

/**
 * 转化旧表格为sheets（终极优化版）
 * @description 该方法为过渡方法，仅用于兼容旧版表格数据，不应该在后续正式环境中使用
 * @param {DERIVED.Table[]} oldTableList 旧表格数据
 */
export async function convertOldTablesToNewSheets(oldTableList) {
    // 该方法为过渡方法，仅用于兼容旧版表格数据，不应该在后续正式环境中使用
    // 该方法不会创建正确的历史记录，也不会触发任何事件，仅用于快速转换数据
    // 清空现有sheets（直接赋值比修改原数组更快）
    const newSheetsMetadata = [];

    // 使用Promise.all并行处理所有表格
    const sheets = await Promise.all(oldTableList.map(async (oldTable, index) => {
        // 预计算表格尺寸
        const rows = oldTable.content.length + 1;
        const cols = oldTable.columns.length + 1;

        // 直接构造sheet数据对象，而不是创建Sheet实例
        const sheetData = {
            uid: `sheet_${SYSTEM.generateRandomString(8)}`,
            name: oldTable.tableName,
            domain: 'chat',
            type: 'dynamic',
            enable: oldTable.enable,
            required: oldTable.Required,
            tochat: oldTable.tochat,
            hashSheet: [],
            cellHistory: []
        };

        // 预填充 hashSheet 结构
        const hashSheet = Array.from({ length: rows }, (_, rowIndex) =>
            Array.from({ length: cols }, (_, colIndex) => {
                const cellUid = `cell_${sheetData.uid.split('_')[1]}_${SYSTEM.generateRandomString(8)}`;
                const cellData = {
                    uid: cellUid,
                    type: (rowIndex === 0 && colIndex === 0) ? 'sheet_origin' :
                        (rowIndex === 0) ? 'column_header' :
                            (colIndex === 0) ? 'row_header' : 'cell',
                    data: {}
                };

                // 设置源数据（第一行第一列）
                if (rowIndex === 0 && colIndex === 0) {
                    cellData.data = {
                        note: oldTable.note,
                        initNode: oldTable.initNode,
                        updateNode: oldTable.updateNode,
                        deleteNode: oldTable.deleteNode,
                        insertNode: oldTable.insertNode,
                        description: `${oldTable.note}\n${oldTable.initNode}\n${oldTable.insertNode}\n${oldTable.updateNode}\n${oldTable.deleteNode}`
                    };
                }
                // 设置列头（第一行）
                else if (rowIndex === 0 && colIndex > 0) {
                    cellData.data.value = oldTable.columns[colIndex - 1];
                }
                // 设置数据行
                else if (rowIndex > 0 && colIndex > 0 && oldTable.content[rowIndex - 1]) {
                    cellData.data.value = oldTable.content[rowIndex - 1][colIndex - 1] || '';
                }

                sheetData.cellHistory.push(cellData);
                return cellUid;
            })
        );

        sheetData.hashSheet = hashSheet;
        newSheetsMetadata.push(sheetData);

        // 返回一个轻量级Sheet实例（不触发完整初始化）
        return new Proxy({}, {
            get: (target, prop) => prop === 'save' ? () => null : sheetData[prop]
        });
    }));

    // 一次性更新元数据
    USER.getChatMetadata().sheets = newSheetsMetadata;

    // 延迟保存（如果需要）
    await USER.saveChat();

    return sheets;
}

/**
 * 对比新旧表格数据是否相同
 * @param {DERIVED.Table} oldTable 旧表格数据
 * @param {BASE.Sheet} newSheet 新表格数据
 * @returns 是否相同
 */
function compareSheetData(oldTable, newSheet) {
    const oldCols = oldTable.columns.length
    if (oldCols !== newSheet.colCount) return false
    for (let i = 0; i < oldCols; i++) {
        if (oldTable.columns[i] !== newTable.findCellByPosition(0, i).data.value) return false
    }
    return true
}

/**
 * 寻找下一个含有表格数据的消息，如寻找不到，则返回null
 * @param startIndex 开始寻找的索引
 * @param isIncludeStartIndex 是否包含开始索引
 * @returns 寻找到的mes数据
 */
export function findNextChatWhitTableData(startIndex, isIncludeStartIndex = false) {
    if (startIndex === -1) return { index: - 1, chat: null }
    const chat = USER.getContext().chat
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
    if (USER.tableBaseSetting.step_by_step === true) return '';
    const promptContent = getAllPrompt()
    console.log("完整提示", promptContent)
    return promptContent
}

/**
 * 获取所有的完整提示词
 * @returns 完整提示词
 */
function getAllPrompt() {
    const sheets = BASE.loadChatAllSheets()
    const tableDataPrompt = sheets.map(sheet => sheet.getTableText()).join('\n')
    return USER.tableBaseSetting.message_template.replace('{{tableData}}', tableDataPrompt)
}

/**
 * 深拷贝所有表格数据，拷贝时保留 Table 类的原型链
 * @param {DERIVED.Table[]} tableList 要拷贝的表格对象数组
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
        // TODO 待重构
        updateSystemMessageTableStatus();   // +.新增代码，将表格数据状态更新到系统消息中
        return
    }
    executeTableEditTag(chat, mesIndex)
    // TODO 待重构
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
    const { tables, index: lastestIndex } = findLastestOldTablePiece(false, mesIndex)
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
    USER.getContext().saveChat();
}

/**
 * 读取设置中的注入角色
 * @returns 注入角色
 */
function getMesRole() {
    switch (USER.tableBaseSetting.injection_mode) {
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
        if (eventData.dryRun === true || USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiReadTable === false) return
        const promptContent = initTableData()
        if (USER.tableBaseSetting.deep === 0)
            eventData.chat.push({ role: getMesRole(), content: promptContent })
        else
            eventData.chat.splice(-USER.tableBaseSetting.deep, 0, { role: getMesRole(), content: promptContent })

        await updateSheetsView()
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
    if (USER.tableBaseSetting.isExtensionAble === false) return
    if (USER.tableBaseSetting.step_by_step === true) {

    } else {
        const chat = USER.getContext().chat[this_edit_mes_id]
        if (chat.is_user === true || USER.tableBaseSetting.isAiWriteTable === false) return
        try {
            handleEditStrInMessage(chat, parseInt(this_edit_mes_id))
        } catch (error) {
            EDITOR.error("记忆插件：表格编辑失败\n原因：", error.message)
        }
    }

    await updateSheetsView()
}

/**
 * 消息接收时触发
 * @param {number} chat_id 此消息的ID
 */
async function onMessageReceived(chat_id) {
    if (USER.tableBaseSetting.isExtensionAble === false) return
    if (USER.tableBaseSetting.step_by_step === true) {
        TableTwoStepSummary();  // 请勿使用await，否则会导致主进程阻塞引起的连锁bug
    } else {
        if (USER.tableBaseSetting.isAiWriteTable === false) return
        const chat = USER.getContext().chat[chat_id];
        console.log("收到消息", chat_id)
        try {
            handleEditStrInMessage(chat)
        } catch (error) {
            EDITOR.error("记忆插件：表格自动更改失败\n原因：", error.message)
        }
    }

    await updateSheetsView()
}

/**
 * 聊天变化时触发
 */
async function onChatChanged(){
    await updateSheetsView()
}


/**
 * 滑动切换消息事件
 */
async function onMessageSwiped(chat_id) {
    if (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.isAiWriteTable === false) return

    const chat = USER.getContext().chat[chat_id];
    if (!chat.swipe_info[chat.swipe_id]) return
    try {
        handleEditStrInMessage(chat)
    } catch (error) {
        EDITOR.error("记忆插件：swipe切换失败\n原因：", error.message)
    }

    await updateSheetsView()
}

/**
 * 更新新表格视图
 * @description 更新新表格视图，将新表格数据转化为新表格视图，该方法在当前版本可能使用旧表格数据
 * @returns {Promise<*[]>}
 */
async function updateSheetsView() {
    // TODO 使用新表格-系统消息
    const { tables: oldTables, index } = findLastestOldTablePiece(true, -1)
    convertOldTablesToNewSheets(oldTables).then((sheets) => {
        refreshTempView(true);
        refreshContextView(true);
    })
}



jQuery(async () => {
    fetch("http://api.muyoo.com.cn/check-version", {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVersion: VERSION, user: USER.getContext().name1 })
    }).then(res => res.json()).then(res => {
        if (res.success) {
            if (!res.isLatest) $("#tableUpdateTag").show()
            if (res.toastr) EDITOR.warning(res.toastrText)
            if (res.message) $("#table_message_tip").html(res.message)
        }
    })

    // 分离手机和电脑事件
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        console.log("手机端")
        // 手机端事件
    } else {
        console.log("电脑端")
        // 电脑端事件
        initTest();
    }

    // 开始添加各部分的根DOM
    // 添加表格编辑工具栏
    $('#translation_container').after(await SYSTEM.getTemplate('index'));
    // 添加顶部表格管理工具弹窗
    $('#extensions-settings-button').after(await SYSTEM.getTemplate('appHeaderTableDrawer'));
    // 添加进入表格编辑按钮
    // $('.extraMesButtons').append(`<div title="查看表格" class="mes_button fa-solid fa-table open_table_by_id" />`);
    // 添加表格编辑浮窗
    // $('#data_bank_wand_container').append(`<div id="open_table" class="list-group-item flex-container flexGap5 interactable"><i class="fa-solid fa-table"></i>打开表格</div>`);
    // 添加表格编辑浮窗绑定打开表格事件
    // $("#open_table").on('click', () => openTablePopup());

    // 应用程序启动时加载设置
    loadSettings();

    // 设置表格编辑按钮
    $(document).on('click', '#table_drawer_icon', function () {
        openAppHeaderTableDrawer();
        updateSheetsView();
    })
    // 设置表格编辑按钮
    $(document).on('click', '.tableEditor_editButton', function () {
        let index = $(this).data('index'); // 获取当前点击的索引
        openTableSettingPopup(index);
    })
    // 点击表格渲染样式设置按钮
    $(document).on('click', '.tableEditor_renderButton', function () {
        openTableRendererPopup();
    })
    // 点击打开查看表格日志按钮
    $(document).on('click', '#table_debug_log_button', function () {
        openTableDebugLogPopup();
    })
    // 对话数据表格弹出窗
    $(document).on('click', '.open_table_by_id', function () {
        const messageId = $(this).closest('.mes').attr('mesid');
        // openTablePopup(parseInt(messageId));
        initRefreshTypeSelector();
    })
    // 设置表格开启开关
    $(document).on('change', '.tableEditor_switch', function () {
        let index = $(this).data('index'); // 获取当前点击的索引
        const tableStructure = findTableStructureByIndex(index);
        tableStructure.enable = $(this).prop('checked');
    })

    initAppHeaderTableDrawer().then(updateSheetsView);  // 初始化表格编辑器
    functionToBeRegistered()    // 注册用于调试的各种函数

    // 监听主程序事件
    APP.eventSource.on(APP.event_types.MESSAGE_RECEIVED, onMessageReceived);
    APP.eventSource.on(APP.event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    APP.eventSource.on(APP.event_types.CHAT_CHANGED, onChatChanged);
    APP.eventSource.on(APP.event_types.MESSAGE_EDITED, onMessageEdited);
    APP.eventSource.on(APP.event_types.MESSAGE_SWIPED, onMessageSwiped);
    console.log("______________________记忆插件：加载完成______________________")
});
