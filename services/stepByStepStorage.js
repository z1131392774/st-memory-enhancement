import { Logger } from './logger.js';

const STORAGE_KEY = 'st-memory-enhancement-step-data';

/**
 * [持久化改造] 将待办的“填完再发”任务数据存入 localStorage。
 * @param {Object} data - 要存储的数据，通常包含 { chatId, content }。
 */
export function saveStepData(data) {
    try {
        const jsonData = JSON.stringify(data);
        localStorage.setItem(STORAGE_KEY, jsonData);
        Logger.info('[StepByStepStorage] Saved pending data to localStorage:', data);
    } catch (error) {
        Logger.error('[StepByStepStorage] Failed to save data to localStorage:', error);
    }
}

/**
 * [持久化改造] 从 localStorage 读取待办任务数据。
 * @returns {Object|null} - 返回存储的数据对象，如果不存在或解析失败则返回 null。
 */
export function readStepData() {
    try {
        const jsonData = localStorage.getItem(STORAGE_KEY);
        if (jsonData) {
            const data = JSON.parse(jsonData);
            Logger.info('[StepByStepStorage] Read pending data from localStorage:', data);
            return data;
        }
        return null;
    } catch (error) {
        Logger.error('[StepByStepStorage] Failed to read or parse data from localStorage:', error);
        // 如果解析失败，最好也清除掉，防止后续循环出错
        clearStepData();
        return null;
    }
}

/**
 * [持久化改造] 从 localStorage 中清除已处理或已过期的待办任务数据。
 */
export function clearStepData() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        Logger.info('[StepByStepStorage] Cleared pending data from localStorage.');
    } catch (error) {
        Logger.error('[StepByStepStorage] Failed to clear data from localStorage:', error);
    }
}
