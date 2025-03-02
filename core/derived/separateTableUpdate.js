import { DERIVED, EDITOR, SYSTEM } from '../manager.js';
import {refreshTableActions} from "./absoluteRefresh.js";

async function getRecentChatHistoryByWordCount(chat, sumMesLength) {
    let lastChats = '';
    let sum = 0;
    for (let i = chat.length - 1; i >= 0; i--) {
        const currentChat = `${chat[i].name}: ${chat[i].mes}`.replace(/<tableEdit>[\s\S]*?<\/tableEdit>/g, '');
        sum += currentChat.length;
        if (sum > sumMesLength) {
            break;
        }
        lastChats += `\n${currentChat}`;
    }
    return lastChats;
}

/**
 * 执行两步总结
 * */
export async function TableTwoStepSummary() {
    // console.log("执行两步总结")
    // if (EDITOR.data.isExtensionAble === false || EDITOR.data.step_by_step === false) return
    //
    // const chat = EDITOR.getContext().chat;
    // const currentChat = chat[chat.length - 1];
    // if (currentChat.is_user === true) return
    //
    // // 获取当前消息的数据，检查当前消息的字数是否大于EDITOR.data.step_by_step_threshold
    // const currentMessage = currentChat.message;
    // const currentMessageLength = currentMessage.length;
    //
    // // 检查是否开启EDITOR.data.sum_multiple_rounds
    // if (EDITOR.data.sum_multiple_rounds === true) {
    //
    // } else {
    //     if (currentMessageLength < EDITOR.data.step_by_step_threshold) {
    //         // 拼接EDITOR.data.unusedChatText和当前消息
    //         EDITOR.data.unusedChatText += currentMessage;
    //         return;
    //     }
    // }
    //
    // if (currentChat.enabledTwoStepSummary === true) {
    //     console.log("当前消息已执行两步总结")
    //     return;
    // }
    // await refreshTableActions(true, true);
    // currentChat.enabledTwoStepSummary = true;
}
