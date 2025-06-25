import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import { executeIncrementalUpdateFromSummary, sheetsToTables } from "./absoluteRefresh.js";
import { newPopupConfirm } from '../../components/popupConfirm.js';
import { reloadCurrentChat } from "/script.js"
import {getTablePrompt,initTableData} from "../../index.js"
import { refreshContextView } from '../editor/chatSheetsDataView.js';
import { updateSystemMessageTableStatus } from '../renderer/tablePushToChat.js';

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
export async function TableTwoStepSummary(mode) {
    if (mode!=="manual" && (USER.tableBaseSetting.isExtensionAble === false || USER.tableBaseSetting.step_by_step === false)) return

    // 获取需要执行的两步总结
    const {piece: todoPiece} = USER.getChatPiece()

    if (todoPiece === undefined) {
        console.log('未找到待填表的对话片段');
        EDITOR.error('未找到待填表的对话片段，请检查当前对话是否正确。');
        return;
    }
    let todoChats = todoPiece.mes;

    console.log('待填表的对话片段:', todoChats);

    // 检查是否开启执行前确认
    const popupContentHtml = `<p>累计 ${todoChats.length} 长度的文本，是否开始独立填表？</p>`;
    // 移除了模板选择相关的HTML和逻辑

    const popupId = 'stepwiseSummaryConfirm';
    const confirmResult = await newPopupConfirm(
        popupContentHtml,
        "取消",
        "执行填表",
        popupId,
        "一直选是" // <--- 修改按钮文本
    );

    console.log('newPopupConfirm result for stepwise summary:', confirmResult);

    if (confirmResult === false) {
        console.log('用户取消执行独立填表: ', `(${todoChats.length}) `, toBeExecuted);
        MarkChatAsWaiting(currentPiece, swipeUid);
    } else {
        // This block executes if confirmResult is true OR 'dont_remind_active'
        if (confirmResult === 'dont_remind_active') {
            console.log('独立填表弹窗已被禁止，自动执行。');
            EDITOR.info('已选择“一直选是”，操作将在后台自动执行...'); // <--- 增加后台执行提示
        } else { // confirmResult === true
            console.log('用户确认执行独立填表 (或首次选择了“一直选是”并确认)');
        }
        manualSummaryChat(todoChats, confirmResult);
    }
}

/**
 * 手动总结聊天
 * @param {} chat 
 */
export async function manualSummaryChat(todoChats, confirmResult) {

    // 核心逻辑：确定作为填表基础的 referencePiece
    // 1. 获取当前 piece 的索引，作为寻找“上一层”的起点
    const { deep: currentIndex } = USER.getChatPiece();
    if (currentIndex === -1) {
        EDITOR.error("无法定位当前聊天片段，操作中止。");
        return;
    }

    // 2. 从当前 piece 的前一个开始，向前寻找最近的带表格的 piece
    const { piece: lastPiece, deep: lastPieceIndex } = BASE.getLastSheetsPiece(currentIndex, 1000, false);

    let referencePiece;
    if (lastPieceIndex === -1) {
        // 3a. 如果没找到，说明这是第一次填表，需要使用模板初始化一个空的表格结构
        console.log("[Memory Enhancement] 未找到上一层的表格数据，将使用模板进行初始化。");
        // 直接获取initHashSheet的返回结果，它可能是piece对象或包含hash_sheets的对象
        const initData = BASE.initHashSheet();
        referencePiece = initData;
    } else {
        // 3b. 如果找到了，就用这个“上一层”的 piece 作为基础
        console.log(`[Memory Enhancement] 找到上一层表格数据作为基础，位于索引 ${lastPieceIndex}。`);
        referencePiece = lastPiece;
    }
    
    // 4. 对最终确定的 referencePiece 进行净化（深拷贝），彻底杜绝任何可能的内存污染
    const cleanReferencePiece = JSON.parse(JSON.stringify(referencePiece));

    // 表格数据
    const originText = getTablePrompt(cleanReferencePiece)

    // 表格总体提示词
    const finalPrompt = initTableData(); // 获取表格相关提示词
    
    // 设置
    const useMainApiForStepByStep = USER.tableBaseSetting.step_by_step_use_main_api ?? true;
    const isSilentMode = confirmResult === 'dont_remind_active';

    const r = await executeIncrementalUpdateFromSummary(
        todoChats,
        originText,
        finalPrompt,
        cleanReferencePiece, // 使用净化后的副本进行操作，避免污染
        useMainApiForStepByStep, // API choice for step-by-step
        USER.tableBaseSetting.bool_silent_refresh, // isSilentUpdate
        isSilentMode // Pass silent mode flag
    );

    console.log('执行独立填表（增量更新）结果:', r);
    if (r === 'success') {
        // 核心修复：将操作后的结果（cleanReferencePiece.hash_sheets）同步回当前的piece
        const { piece: currentPiece } = USER.getChatPiece();
        if (currentPiece && cleanReferencePiece.hash_sheets) {
            currentPiece.hash_sheets = cleanReferencePiece.hash_sheets;
            console.log('[Memory Enhancement] 已将修改后的表格数据同步回当前聊天记录。');
        } else {
            console.error('[Memory Enhancement] 同步表格数据失败：无法找到当前聊天记录或操作后的数据为空。');
            EDITOR.error("同步表格数据失败，修改可能不会显示。");
        }

        toBeExecuted.forEach(chat => {
            const chatSwipeUid = getSwipeUid(chat);
            chat.two_step_links[chatSwipeUid].push(swipeUid);   // 标记已执行的两步总结
        });
        toBeExecuted = [];

        // 保存并刷新UI
        await USER.saveChat();
        // 根据用户要求，使用整页刷新来确保包括宏在内的所有数据都得到更新。
        reloadCurrentChat();
        return true;
    } else if (r === 'suspended' || r === 'error' || !r) {
        console.log('执行增量独立填表失败或取消: ', `(${todoChats.length}) `, toBeExecuted);
        return false;
    }
    
}
