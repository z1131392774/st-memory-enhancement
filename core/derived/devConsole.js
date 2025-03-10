import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import {findLastestTableData, findTableStructureByIndex} from "../../index.js";
import JSON5 from '../../utils/json5.min.mjs'

let isPopupOpening = false; // 防止在弹窗打开时推送日志导致循环
let debugEventHistory = [];

function updateTableDebugLog(type, message, detail, timeout) {
    const newLog = {
        time: new Date().toLocaleTimeString(),
        type: type,
        message: message || ''
    };
    switch (type) {
        case 'info':
            toastr.info(message, detail, timeout);
            break;
        case 'success':
            toastr.success(message, detail, timeout);
            break;
        case 'warning':
            console.warn(message, detail);
            toastr.warning(message, detail, timeout);
            break;
        case 'error':
            console.error(message, detail);
            toastr.error(message, detail, timeout);
            if (isPopupOpening) break;

            // 获取堆栈回调，将堆栈回调信息记录到newLog
            newLog.stack = new Error().stack;
            if (USER.tableBaseSetting.tableDebugModeAble) {
                setTimeout(() => {
                    openTableDebugLogPopup().then(r => {});
                }, 0);
            }
            break;
        case 'clear':
            toastr.clear();
            break;
        default:
            break;
    }

    if (isPopupOpening) return;
    debugEventHistory = debugEventHistory || [];
    debugEventHistory.unshift(newLog);
}

const copyButtonStyle = `
<div class="menu_button log-copy-button">
    <i class="fa-solid fa-copy"></i>
</div>
`

async function copyPopup(log) {
    const logDetails = `Time: ${log.time}\nType: ${log.type}\nMessage: ${log.message}${log.stack ? `\nStack:\n${log.stack}` : ''}`;
    const textarea = $('<textarea class="log-copy-textarea" style="height: 100%"></textarea>').val(logDetails);
    const manager = await SYSTEM.getComponent('popup');
    const copyPopupInstance = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const container = copyPopupInstance.dlg.querySelector('#popup_content');
    container.append(textarea[0]);

    textarea.focus();
    textarea.select();
    await copyPopupInstance.show();
}

/**
 * 渲染Debug日志到容器
 * @param $container jQuery对象，日志容器
 * @param logs 日志数组
 * @param onlyError 是否仅显示错误日志
 */
function renderDebugLogs($container, logs, onlyError) {
    $container.empty(); // 清空容器

    if (!logs || logs.length === 0) {
        $container.append('<div class="debug-log-item">No debug log found.</div>');
        return;
    }

    const urlRegex = /(https?:\/\/[^\s)]+)|(http?:\/\/[^\s)]+)|(www\.[^\s)]+)/g; // 匹配 http://, https://, www. 开头的链接

    logs.forEach(log => {
        if (onlyError && log.type !== 'error') {
            return; // 如果只显示错误日志且当前日志不是 error 类型，则跳过
        }

        const logElement = $('<div class="debug-log-item"></div>'); // 创建一个 div 元素来显示每条 log
        const timeSpan = $('<span class="log-time"></span>').text(`[${log.time}]`);
        const typeSpan = $('<span class="log-type"></span>').addClass(`log-type-${log.type}`).text(`[${log.type}]`);
        const messageSpan = $('<span class="log-message"></span>').text(log.message);
        const copyButton = $(`${copyButtonStyle}`);

        logElement.append(timeSpan).append(' ').append(typeSpan).append(': ').append(messageSpan).append(' ').append(copyButton); // 添加复制按钮

        copyButton.on('click', () => {
            copyPopup(log);
        })

        if (log.stack) { // 如果 log 对象有 stack 属性 (error 类型的 log)
            // 使用正则表达式替换 URL 并包裹在 div 中
            const formattedStack = log.stack.replace(urlRegex, (url) => {
                return `<div style="color: rgb(98, 145, 179)">${url}</div>`;
            });
            const stackPre = $('<pre class="log-stack"></pre>').html(formattedStack); // 使用 .html() 而不是 .text()，以渲染 HTML 标签
            logElement.append(stackPre); // 将堆栈信息添加到 logElement
        }

        $container.append(logElement);
    });
}

export const consoleMessageToEditor = {
    info: (message, detail, timeout) => updateTableDebugLog('info', message, detail, timeout),
    success: (message, detail, timeout) => updateTableDebugLog('success', message, detail, timeout),
    warning: (message, detail, timeout) => updateTableDebugLog('warning', message, detail, timeout),
    error: (message, detail, timeout) => updateTableDebugLog('error', message, detail, timeout),
    clear: () => updateTableDebugLog('clear', ''),
}

/**
 * +.新增代码，打开自定义表格推送渲染器弹窗
 * @returns {Promise<void>}
 */
export async function openTableDebugLogPopup() {
    if (!SYSTEM.lazy('openTableDebugLogPopup')) return;

    isPopupOpening = true;
    const manager = await SYSTEM.getComponent('debugLog');
    const tableDebugLogPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const $dlg = $(tableDebugLogPopup.dlg);
    const $debugLogContainer = $dlg.find('#debugLogContainer');
    const $onlyErrorLogCheckbox = $dlg.find('#only_error_log'); // 获取 checkbox
    const $exportButton = $dlg.find('#table_debug_log_export_button'); // 获取导出按钮

    $debugLogContainer.empty(); // 清空容器，避免重复显示旧日志
    toastr.clear()

    // 初始化渲染日志，根据 checkbox 状态决定是否只显示 error
    renderDebugLogs($debugLogContainer, debugEventHistory, $onlyErrorLogCheckbox.is(':checked'));

    $onlyErrorLogCheckbox.off('change').on('change', function () { // 移除之前的事件监听，避免重复绑定
        const onlyError = $(this).is(':checked'); // 获取 checkbox 的选中状态
        renderDebugLogs($debugLogContainer, debugEventHistory, onlyError); // 重新渲染日志
    });
    $exportButton.on('click', () => {
        const logData = debugEventHistory.map(log => {
            return {
                time: log.time,
                type: log.type,
                message: log.message,
                stack: log.stack
            }
        });
        const logDataString = JSON5.stringify(logData, null, 2);
        const blob = new Blob([logDataString], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'table_debug_log.json';
        a.click();
        URL.revokeObjectURL(url);
    })

    await tableDebugLogPopup.show();
    isPopupOpening = false;
}
