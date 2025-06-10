import { USER } from '../../core/manager.js';

/**
 * 通过SillyTavern的斜杠命令，强制刷新最后一条AI消息。
 *
 * 实现方式:
 * 1. 获取最后一条AI消息的内容。
 * 2. 使用 /setvar 将消息内容存入一个临时变量。
 * 3. 使用 /delswipe 删除当前的消息滑动页。
 * 4. 使用 /addswipe 将存放在临时变量中的内容重新添加为一个新的滑动页。
 * 5. 使用 /flushvar 清理临时变量。
 * 这一系列操作会强制SillyTavern重新渲染该消息，从而刷新其中的地图宏。
 */
export function refreshLastMessage() {
    const chat = USER.getContext().chat;
    if (!chat || chat.length === 0) {
        console.log('[MapAutoRefresh] Chat is empty, nothing to refresh.');
        return;
    }

    // 寻找最后一条非用户的消息
    let lastMessage = null;
    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i].is_user) {
            lastMessage = chat[i];
            break;
        }
    }

    if (!lastMessage) {
        console.log('[MapAutoRefresh] No character message found to refresh.');
        return;
    }

    const lastMessageContent = lastMessage.mes;
    const command = `
        /setvar key=tempRefreshContent ${JSON.stringify(lastMessageContent)}
        | /delswipe
        | /addswipe {{getvar::tempRefreshContent}}
        | /flushvar tempRefreshContent
    `;

    if (typeof triggerSlash === 'function') {
        try {
            console.log('[MapAutoRefresh] Executing refresh command via triggerSlash...');
            triggerSlash(command);
            console.log('[MapAutoRefresh] Refresh command executed successfully.');
        } catch (error) {
            console.error('[MapAutoRefresh] Error executing refresh command via triggerSlash:', error);
        }
    } else {
        console.error('[MapAutoRefresh] triggerSlash function is not defined.');
    }
}
