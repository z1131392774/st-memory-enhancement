/**
 * stepByStepStorage.js
 * 
 * 专用于处理“分步填表”（收到消息后填表）功能的持久化存储。
 * 使用 localStorage 来确保即使在刷新或关闭页面后，待处理的填表任务也不会丢失。
 */

const STORAGE_KEY = 'pending_step_update_data';

/**
 * 将待处理的填表任务保存到 localStorage。
 * @param {object} data - 需要保存的数据，通常包含 { chatId, content }。
 * @returns {boolean} - 操作是否成功。
 */
export function saveStepData(data) {
    try {
        const jsonData = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, jsonData);
        console.log(`[Memory Enhancement / StepByStep] 成功将待办任务保存到 localStorage:`, data);
        return true;
    } catch (e) {
        console.error(`[Memory Enhancement / StepByStep] 写入 localStorage 失败:`, e);
        return false;
    }
}

/**
 * 从 localStorage 读取待处理的填表任务。
 * @returns {object|null} - 返回解析后的数据对象，如果不存在或解析失败则返回 null。
 */
export function readStepData() {
    try {
        const jsonData = localStorage.getItem(STORAGE_KEY);
        if (jsonData) {
            const data = JSON.parse(jsonData);
            console.log(`[Memory Enhancement / StepByStep] 从 localStorage 读取到待办任务:`, data);
            return data;
        }
        return null;
    } catch (e) {
        console.error(`[Memory Enhancement / StepByStep] 从 localStorage 读取或解析数据失败:`, e);
        // 如果解析失败，也清除掉损坏的数据
        clearStepData();
        return null;
    }
}

/**
 * 从 localStorage 中清除待处理的填表任务。
 * 这应该在任务成功完成后调用。
 * @returns {boolean} - 操作是否成功。
 */
export function clearStepData() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        console.log(`[Memory Enhancement / StepByStep] 已清除 localStorage 中的待办任务。`);
        return true;
    } catch (e) {
        console.error(`[Memory Enhancement / StepByStep] 从 localStorage 清除数据失败:`, e);
        return false;
    }
}
