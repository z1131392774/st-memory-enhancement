import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import { executeIncrementalUpdateFromSummary, sheetsToTables } from "./absoluteRefresh.js";
import { newPopupConfirm, alwaysConfirmPopups } from '../../components/popupConfirm.js';
import { clearStepData } from '../../services/stepByStepStorage.js';
import { reloadCurrentChat } from "/script.js"
import {getTablePrompt,initTableData, undoSheets} from "../../index.js"
import { ext_hashSheetsToJson } from '../settings/standaloneAPI.js';

let toBeExecuted = [];

/**
 * 初始化两步总结所需的数据
 * @param chat
 * */
function InitChatForTableTwoStepSummary(chat) {
    // 如果currentPiece.uid未定义，则初始化为随机字符串
    if (chat.uid === undefined) {
        chat.uid = SYSTEM.generateRandomString(22);
    }
    // 如果currentPiece.uid_that_references_table_step_update未定义，则初始化为{}
    if (chat.two_step_links === undefined) {
        chat.two_step_links = {};
    }
    // 如果currentPiece.uid_that_references_table_step_update未定义，则初始化为{}
    if (chat.two_step_waiting === undefined) {
        chat.two_step_waiting = {};
    }
}

/**
 * 获取当前滑动对话的唯一标识符
 * @param chat
 * @returns {string}
 */
function getSwipeUid(chat) {
    // 初始化chat
    InitChatForTableTwoStepSummary(chat);
    // 获取当前swipe的唯一标识符
    const swipeUid = `${chat.uid}_${chat.swipe_id}`;
    // 检查当前swipe是否已经存在必要的数据结构
    if (!(swipeUid in chat.two_step_links)) chat.two_step_links[swipeUid] = [];
    if (!(swipeUid in chat.two_step_waiting)) chat.two_step_waiting[swipeUid] = true;
    return swipeUid;
}

/**
 * 检查当前chat是否已经被父级chat执行过
 * @param chat
 * @param targetSwipeUid
 * @returns {*}
 */
function checkIfChatIsExecuted(chat, targetSwipeUid) {
    const chatSwipeUid = getSwipeUid(chat); // 获取当前chat的唯一标识符
    const chatExecutedSwipes = chat.two_step_links[chatSwipeUid]; // 获取当前chat已经执行过的父级chat
    return chatExecutedSwipes.includes(targetSwipeUid);   // 检查当前chat是否已经被目标chat执行过
}

/**
 * 处理对话中的标识符
 * @param string
 * @returns {string}
 */
function handleMessages(string) {
    let r = string.replace(/<(tableEdit|think|thinking)>[\s\S]*?<\/\1>/g, '');

    return r;
}

function MarkChatAsWaiting(chat, swipeUid) {
    console.log(USER.getContext().chat);
    console.log('chat.two_step_links:',chat.two_step_links);
    console.log('chat.two_step_waiting:',chat.two_step_waiting);
    chat.two_step_waiting[swipeUid] = true;
}

/**
 * 执行两步总结
 * */
export async function TableTwoStepSummary(mode, messageContent = null) {
    if (mode !== "manual" && (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.step_by_step === false)) return;

    let todoChats;

    if (messageContent) {
        todoChats = messageContent;
        console.log('使用提供的消息内容进行填表:', todoChats);
    } else {
        const { piece: todoPiece } = USER.getChatPiece();
        if (!todoPiece || !todoPiece.mes) {
            EDITOR.error('未找到待填表的对话片段，请检查当前对话是否正确。');
            return;
        }
        todoChats = todoPiece.mes;
    }

    console.log('待填表的对话片段:', todoChats);

    const popupId = 'stepwiseSummaryConfirm';
    let confirmResult;

    // 核心修复：在调用弹窗前，先检查 "一直选是" 的状态
    const alwaysConfirm = alwaysConfirmPopups[popupId];

    if (alwaysConfirm) {
        // 如果用户已经选择“一直选是”，则跳过弹窗，直接设置为 true
        confirmResult = true;
        console.log(`[Memory Enhancement] 检测到 “${popupId}” 已设置为 '一直选是'，跳过弹窗。`);
    } else {
        // 否则，正常显示弹窗
        const popupContentHtml = `<p>累计 ${todoChats.length} 长度的文本，是否开始独立填表？</p>`;
        confirmResult = await newPopupConfirm(
            popupContentHtml,
            "取消",
            "执行填表",
            popupId,
            "不再提示",
            "一直选是"
        );
        console.log('newPopupConfirm result for stepwise summary:', confirmResult);
    }

    if (confirmResult === false) {
        console.log('用户取消执行独立填表: ', `(${todoChats.length}) `, toBeExecuted);
        // MarkChatAsWaiting is not fully implemented, commenting out for now
        // MarkChatAsWaiting(currentPiece, swipeUid);
        return 'cancelled'; // 返回取消状态
    } else {
        // [新增功能] 在确认填表后，如果“填完再发”未开启，则自动跳转
        if (USER.tableBaseSetting.wait_for_fill_then_send === false) {
            setTimeout(() => {
                try {
                    if (typeof globalThis.TavernHelper?.triggerSlash === 'function' && typeof globalThis.TavernHelper?.getLastMessageId === 'function') {
                        const lastMessageId = globalThis.TavernHelper.getLastMessageId();
                        console.log(`[Memory Enhancement] 分步填表开始，执行跳转: /chat-jump ${lastMessageId}`);
                        globalThis.TavernHelper.triggerSlash(`/chat-jump ${lastMessageId}`);
                    }
                } catch (e) {
                    console.error('[Memory Enhancement] 执行 /chat-jump 失败:', e);
                }
            }, 1500); // 延迟以确保新消息的DOM元素已渲染
        }

        // 根据模式决定是否刷新页面
        const shouldReload = mode !== 'auto_wait';
        // 移除 “检测到自动确认设置...” 的提示
        // 核心修复：返回 manualSummaryChat 的执行结果
        return manualSummaryChat(todoChats, confirmResult, shouldReload);
    }
}


/**
 * 手动总结聊天（立即填表）
 * 重构逻辑：
 * 1. 恢复：首先调用内建的 `undoSheets` 函数，将表格状态恢复到上一版本。
 * 2. 执行：以恢复后的干净状态为基础，调用标准增量更新流程，向AI请求新的操作并执行。
 * @param {Array} todoChats - 需要用于填表的聊天记录。
 * @param {string|boolean} confirmResult - 用户的确认结果。
 * @param {boolean} shouldReload - 是否在完成后刷新页面。
 */
export async function manualSummaryChat(todoChats, confirmResult, shouldReload = true) {
    // 步骤一：检查是否需要执行“撤销”操作
    // 首先获取当前的聊天片段，以判断表格状态
    const { piece: initialPiece } = USER.getChatPiece();
    if (!initialPiece) {
        EDITOR.error("无法获取当前的聊天片段，操作中止。");
        return;
    }

    // 只有当表格中已经有内容时，才执行“撤销并重做”
    if (initialPiece.hash_sheets && Object.keys(initialPiece.hash_sheets).length > 0) {
        console.log('[Memory Enhancement] 立即填表：检测到表格中有数据，执行恢复操作...');
        try {
            await undoSheets(0);
            EDITOR.success('表格已恢复到上一版本。');
            console.log('[Memory Enhancement] 表格恢复成功，准备执行填表。');
        } catch (e) {
            EDITOR.error('恢复表格失败，操作中止。');
            console.error('[Memory Enhancement] 调用 undoSheets 失败:', e);
            return;
        }
    } else {
        console.log('[Memory Enhancement] 立即填表：检测到为空表，跳过恢复步骤，直接执行填表。');
    }

    // 步骤二：以当前状态（可能已恢复）为基础，继续执行填表
    // 重新获取 piece，确保我们使用的是最新状态（无论是原始状态还是恢复后的状态）
    const { piece: referencePiece } = USER.getChatPiece();
    if (!referencePiece) {
        EDITOR.error("无法获取用于操作的聊天片段，操作中止。");
        return;
    }
    
    // 表格数据
    const originText = getTablePrompt(referencePiece, false, true);

    // 表格总体提示词
    const finalPrompt = initTableData(); // 获取表格相关提示词
    
    // 设置
    const useMainApiForStepByStep = USER.tableBaseSetting.step_by_step_use_main_api ?? true;
    const isSilentMode = confirmResult === 'dont_remind_active';

    const r = await executeIncrementalUpdateFromSummary(
        todoChats,
        originText,
        finalPrompt,
        referencePiece, // 直接传递原始的 piece 对象引用
        useMainApiForStepByStep, // API choice for step-by-step
        USER.tableBaseSetting.bool_silent_refresh, // isSilentUpdate
        isSilentMode // Pass silent mode flag
    );

    console.log('执行独立填表（增量更新）结果:', r);
    if (r === 'success') {
        // [持久化改造] 任务成功后，清除localStorage中的待办任务
        clearStepData();

        // 由于直接在 referencePiece 引用上操作，修改已自动同步，无需手动回写 hash_sheets。
        toBeExecuted.forEach(chat => {
            const chatSwipeUid = getSwipeUid(chat);
            chat.two_step_links[chatSwipeUid].push(swipeUid);   // 标记已执行的两步总结
        });
        toBeExecuted = [];

        // 保存
        await USER.saveChat();

        // 根据调用者要求决定是否刷新页面
        // if (shouldReload) {
        //     reloadCurrentChat();
        // }

        // 新增：通过回调函数管理器通知监听器数据已更新
        try {
            // 关键修复：不再调用全局API，而是直接使用函数作用域内最新的 referencePiece.hash_sheets
            // 这确保了派发的数据绝对是刚刚更新完成的状态
            const latestTableData = ext_hashSheetsToJson(referencePiece.hash_sheets);
            if (globalThis.stMemoryEnhancement && typeof globalThis.stMemoryEnhancement._notifyTableUpdate === 'function') {
                globalThis.stMemoryEnhancement._notifyTableUpdate(latestTableData);
            } else {
                 console.warn('[Memory Enhancement] _notifyTableUpdate function not found on global object.');
            }
        } catch (e) {
            console.error('[Memory Enhancement] Failed to notify table update:', e);
        }

        return 'success'; // 返回成功状态
        
    } else if (r === 'suspended' || r === 'error' || !r) {
        console.log('执行增量独立填表失败或取消: ', `(${todoChats.length}) `, toBeExecuted);
        return r || 'error'; // 返回失败状态
    }
    
}
