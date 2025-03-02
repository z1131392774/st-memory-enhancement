import { DERIVED, EDITOR, SYSTEM } from '../manager.js';
import {refreshTableActions} from "./absoluteRefresh.js";

let conversationsToBeMarked = [];
function MarkExecutedChats() {
    const chats = EDITOR.getContext().chat;
    for (let i = chats.length - 1; i >= 0; i--) {
        const chat = chats[i];
        if (chat.is_user === true) continue;

        if (conversationsToBeMarked.includes(c => c.uid === chat.uid)) {
            chat.uid_that_references_table_step_update[uid] = true;
        }
    }
}

function InitChatForTableTwoStepSummary(chat) {
    // 如果currentChat.uid未定义，则初始化为随机字符串
    if (chat.uid === undefined) {
        chat.uid = SYSTEM.getRandomString();
    }
    // 如果currentChat.uid_that_references_table_step_update未定义，则初始化为{}
    if (chat.uid_that_references_table_step_update === undefined) {
        chat.uid_that_references_table_step_update = {};
    }
    // 如果currentChat.uid_that_references_table_step_update未定义，则初始化为{}
    if (chat.executedTableTwoStepForward === undefined) {
        chat.executedTableTwoStepForward = false;
    }
}

function GetUnexecutedMarkChats(uid) {
    const chats = EDITOR.getContext().chat;
    let r = '';
    conversationsToBeMarked = [];

    for (let i = chats.length - 1; i >= 0; i--) {
        const c = chats[i];

        InitChatForTableTwoStepSummary(c);

        if (uid in c.uid_that_references_table_step_update) break;  // 如果已经被当前chat执行过总结，则停止
        if (c.executedTableTwoStepForward === true) break;   // 如果已经执行过向前的总结，则停止
        if (c.is_user === true) continue; // 如果是用户对话，则跳过

        // 获取裁切过的对话
        // 使用正则移除todoChats中所有非正文标签
        let todoChat = c.mes.replace(/<tableEdit>[\s\S]*?<\/tableEdit>|<think>[\s\S]*?<\/think>|<thinking>[\s\S]*?<\/thinking>/g, '');
        r = todoChat + r;
        conversationsToBeMarked.push(c);

        // 如果对话长度超过阈值，则停止
        if (r.length > EDITOR.data.step_by_step_threshold) break;
    }
    return r;
}

/**
 * 执行两步总结
 * */
export async function TableTwoStepSummary() {
    if (EDITOR.data.isExtensionAble === false || EDITOR.data.step_by_step === false) return

    const chats = EDITOR.getContext().chat;
    const currentChat = chats[chats.length - 1];
    if (currentChat.is_user === true) return;

    InitChatForTableTwoStepSummary(currentChat);
    if (currentChat.executedTableTwoStepForward === true) return;

    // 往前找到所有未执行的两步总结
    let todoChats = GetUnexecutedMarkChats(currentChat.uid);
    if (todoChats.length === 0) return;

    console.log("执行两步总结");
    await refreshTableActions(true, true, todoChats);
    MarkExecutedChats();
    currentChat.executedTableTwoStepForward = true;
}
