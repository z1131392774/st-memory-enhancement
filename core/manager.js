import { TTable } from "./tTableManager.js";
import { Logger } from "../services/logger.js";
import applicationFunctionManager from "../services/appFuncManager.js";
// 移除旧表格系统引用
import { consoleMessageToEditor } from "../scripts/settings/devConsole.js";
import { calculateStringHash, generateRandomNumber, generateRandomString, lazy, readonly, } from "../utils/utility.js";
import { defaultSettings } from "../data/pluginSetting.js";
import { Drag } from "../components/dragManager.js";
import { PopupMenu } from "../components/popupMenu.js";
import { buildSheetsByTemplates, convertOldTablesToNewSheets } from "../index.js";
import { getRelativePositionOfCurrentCode } from "../utils/codePathProcessing.js";
import { pushCodeToQueue } from "../components/_fotTest.js";
import { createProxy, createProxyWithUserSetting } from "../utils/codeProxy.js";
import { refreshTempView } from '../scripts/editor/tableTemplateEditView.js';
import { newPopupConfirm, PopupConfirm } from "../components/popupConfirm.js";
import { debounce } from "../utils/utility.js";
import { refreshContextView } from "../scripts/editor/chatSheetsDataView.js";
import { updateSystemMessageTableStatus } from "../scripts/renderer/tablePushToChat.js";
import {taskTiming} from "../utils/system.js";
import {updateSelectBySheetStatus} from "../scripts/editor/tableTemplateEditView.js";

let derivedData = {}

export const APP = applicationFunctionManager

/**
 * @description `USER` 用户数据管理器
 * @description 该管理器用于管理用户的设置、上下文、聊天记录等数据
 * @description 请注意，用户数据应该通过该管理器提供的方法进行访问，而不应该直接访问用户数据
 */
export const USER = {
    getSettings: () => APP.power_user,
    getExtensionSettings: () => APP.extension_settings,
    saveSettings: () => APP.saveSettings(),
    saveChat: () => APP.saveChat(),
    // [持久化修复] 引入一个带防抖的保存函数，用于在表格数据变更时自动、安全地保存聊天记录。
    // 延迟1.5秒执行，以合并短时间内的多次连续操作。
    isSaveLocked: false, // [v6.0.2] 新增保存锁状态
    debouncedSaveRequired: false, // [v6.0.3] 新增延迟保存标志
    debouncedSaveChat: debounce(() => {
        // [v6.0.3] 协同修复：在执行防抖保存前，检查保存锁是否已激活。
        if (USER.isSaveLocked) {
            Logger.warn('[Save Lock] A debounced save attempt was intercepted by an active save lock and has been postponed.');
            // 不直接跳过，而是设置一个标志，表示在锁释放后需要进行一次保存。
            USER.debouncedSaveRequired = true;
            return; 
        }
        Logger.info('[Memory Enhancement] Debounced save executed.');
        USER.saveChat();
        // 成功执行后，重置标志。
        USER.debouncedSaveRequired = false;
    }, 1500),
    getContext: () => APP.getContext(),
    isSwipe:()=>
    {
        const chats = USER.getContext().chat
        const lastChat = chats[chats.length - 1];
        const isIncludeEndIndex = (!lastChat) || lastChat.is_user === true;
        if(isIncludeEndIndex) return {isSwipe: false}
        const {deep} = USER.getChatPiece()
        return {isSwipe: true, deep}
    },

    // getContextSheets: () => APP.getContext().chatMetadata.sheets,
    // getRoleSheets: () => APP,
    // getGlobalSheets: () => APP,
    getChatPiece: (deep = 0, direction = 'up') => {
        const chat = APP.getContext().chat;
        if (!chat || chat.length === 0 || deep >= chat.length) return  {piece: null, deep: -1};
        let index = chat.length - 1 - deep
        while (chat[index].is_user === true) {
            if(direction === 'up')index--
            else index++
            if (!chat[index]) return {piece: null, deep: -1}; // 如果没有找到非用户消息，则返回null
        }
        return {piece:chat[index], deep: index};
    },
    loadUserAllTemplates() {
        let templates = USER.getSettings().table_database_templates;
        if (!Array.isArray(templates)) {
            templates = [];
            USER.getSettings().table_database_templates = templates;
            USER.saveSettings();
        }
        Logger.debug("全局模板", templates)
        return templates;
    },
    tableBaseSetting: createProxyWithUserSetting('muyoo_dataTable'),
    tableBaseDefaultSettings: { ...defaultSettings },
    IMPORTANT_USER_PRIVACY_DATA: createProxyWithUserSetting('IMPORTANT_USER_PRIVACY_DATA', true),
}


/**
 * @description `BASE` 数据库基础数据管理器
 * @description 该管理器提供了对库的用户数据、模板数据的访问，但不提供对数据的修改
 * @description 请注意，对库的操作应通过 `BASE.object()` 创建 `Sheet` 实例进行，任何对库的编辑都不应该直接暴露到该管理器中
 */
export const BASE = {
    /**
     * @description `Sheet` 数据表单实例
     * @description 该实例用于对数据库的数据进行访问、修改、查询等操作
     * @description 请注意，对数据库的任何操作都应该通过该实例进行，而不应该直接访问数据库
     */
    Sheet: TTable.Sheet,
    SheetTemplate: TTable.Template,
    refreshContextView: refreshContextView,
    refreshTempView: refreshTempView,
    updateSystemMessageTableStatus: updateSystemMessageTableStatus,
    get templates() {
        return USER.loadUserAllTemplates()
    },
    contextViewRefreshing: false,
    sheetsData: new Proxy({}, {
        get(_, target) {
            switch (target) {
                case 'all':

                case 'context':
                    if (!USER.getContext().chatMetadata) {
                        USER.getContext().chatMetadata = {};
                    }
                    if (!USER.getContext().chatMetadata.sheets) {
                        USER.getContext().chatMetadata.sheets = [];
                    }
                    return USER.getContext().chatMetadata.sheets;
                case 'global':

                case 'role':

                default:
                    throw new Error(`Unknown sheetsData target: ${target}`);
            }
        },
        set(_, target, value) {
            switch (target) {
                case 'context':
                    if (!USER.getContext().chatMetadata) {
                        USER.getContext().chatMetadata = {};
                    }
                    USER.getContext().chatMetadata.sheets = value;
                    return true;
                case 'all':
                case 'global':
                case 'role':
                default:
                    throw new Error(`Cannot set sheetsData target: ${target}`);
            }
        }
    }),
    getChatSheets(process=()=> {}) {
        DERIVED.any.chatSheetMap = DERIVED.any.chatSheetMap || {}
        const sheets = []
        BASE.sheetsData.context.forEach(sheet => {
            if (!DERIVED.any.chatSheetMap[sheet.uid]) {
                const newSheet = new BASE.Sheet(sheet.uid)
                DERIVED.any.chatSheetMap[sheet.uid] = newSheet
            }
            process(DERIVED.any.chatSheetMap[sheet.uid])
            sheets.push(DERIVED.any.chatSheetMap[sheet.uid])
        })
        return sheets
    },
    getChatSheet(uid){
        const sheet = DERIVED.any.chatSheetMap[uid]
        if (!sheet) {
            if(!BASE.sheetsData.context.some(sheet => sheet.uid === uid)) return null
            const newSheet = new BASE.Sheet(uid)
            DERIVED.any.chatSheetMap[uid] = newSheet
            return newSheet
        }
        return sheet
    },
    createChatSheetByTemp(temp){
        DERIVED.any.chatSheetMap = DERIVED.any.chatSheetMap || {}
        const newSheet = new BASE.Sheet(temp);
        DERIVED.any.chatSheetMap[newSheet.uid] = newSheet
        return newSheet
    },
    createChatSheet(cols, rows){
        const newSheet = new BASE.Sheet();
        newSheet.createNewSheet(cols, rows, false);
        DERIVED.any.chatSheetMap[newSheet.uid] = newSheet
        return newSheet
    },
    createChatSheetByJson(json){
        const newSheet = new BASE.Sheet();
        newSheet.loadJson(json);
        DERIVED.any.chatSheetMap[newSheet.uid] = newSheet
        return newSheet
    },
    copyHashSheets(hashSheets) {
        const newHashSheet = {}
        for (const sheetUid in hashSheets) {
            const hashSheet = hashSheets[sheetUid];
            newHashSheet[sheetUid] = hashSheet.map(row => row.map(hash => hash));
        }
        return newHashSheet
    },
    applyJsonToChatSheets(json, type ="both") {
        const newSheets = Object.entries(json).map(([sheetUid, sheetData]) => {
            if(sheetUid === 'mate') return null
            const sheet = BASE.getChatSheet(sheetUid);
            if (sheet) {
                sheet.loadJson(sheetData)
                return sheet
            } else {
                if(type === 'data') return null
                else return BASE.createChatSheetByJson(sheetData)
            }
        }).filter(Boolean)
        if(type === 'data') return BASE.saveChatSheets()
        const oldSheets = BASE.getChatSheets().filter(sheet => !newSheets.some(newSheet => newSheet.uid === sheet.uid))
        oldSheets.forEach(sheet => sheet.enable = false)
        Logger.info("应用表格数据", newSheets, oldSheets)
        const mergedSheets = [...newSheets, ...oldSheets]
        BASE.reSaveAllChatSheets(mergedSheets)
    },
    saveChatSheets(saveToPiece = true) {
        if(saveToPiece){
            const {piece} = USER.getChatPiece()
            if(!piece) return EDITOR.error("没有记录载体，表格是保存在聊天记录中的，请聊至少一轮后再重试")
            // [持久化修复] sheet.save内部会触发 debouncedSaveChat, 这里不再需要手动调用 USER.saveChat()
            BASE.getChatSheets(sheet => sheet.save(piece, true))
        }else BASE.getChatSheets(sheet => sheet.save(undefined, true))
        // USER.saveChat() // 已通过 debouncedSaveChat 自动处理
    },
    reSaveAllChatSheets(sheets) {
        BASE.sheetsData.context = []
        const {piece} = USER.getChatPiece()
        if(!piece) return EDITOR.error("没有记录载体")
        sheets.forEach(sheet => {
            // [持久化修复] sheet.save内部会触发 debouncedSaveChat, 这里不再需要手动调用 USER.saveChat()
            sheet.save(piece, true)
        })
        updateSelectBySheetStatus()
        BASE.refreshTempView(true)
        // USER.saveChat() // 已通过 debouncedSaveChat 自动处理
    },
    updateSelectBySheetStatus(){
        updateSelectBySheetStatus()
    },
    getLastSheetsPiece(deep = 0, cutoff = 1000, startAtLastest = true) {
        Logger.debug("向上查询表格数据，深度", deep, "截断", cutoff, "从最新开始", startAtLastest)
        const chat = APP.getContext()?.chat; // 安全地访问 chat
        if (!chat || chat.length === 0 || chat.length <= deep) {
            return { deep: -1, piece: BASE.initHashSheet() }
        }
        const startIndex = startAtLastest ? chat.length - deep - 1 : deep;
        for (let i = startIndex; i >= 0 && i >= startIndex - cutoff; i--) {
            // [健壮性修复] 增加对 chat[i] 存在的检查
            if (!chat[i]) continue;
            
            // 跳过用户消息
            if (chat[i].is_user === true) continue;

            // [核心数据安全修复] 如果一个消息连 hash_sheets 属性都没有（例如欢迎消息），
            // 就直接跳过它，而不是尝试处理或让上游函数崩溃。
            if (typeof chat[i].hash_sheets === 'undefined' && typeof chat[i].dataTable === 'undefined') {
                continue;
            }

            if (chat[i].hash_sheets) {
                Logger.debug("向上查询表格数据，找到表格数据", chat[i])
                return { deep: i, piece: chat[i] }
            }
            
            // 兼容旧的 dataTable
            if (chat[i].dataTable) {
                Logger.info("找到旧表格数据", chat[i])
                convertOldTablesToNewSheets(chat[i].dataTable, chat[i])
                return { deep: i, piece: chat[i] }
            }
        }
        return { deep: -1, piece: BASE.initHashSheet() }
    },
    getReferencePiece(){
        const swipeInfo = USER.isSwipe()
        Logger.debug("获取参考片段", swipeInfo)
        const {piece} = swipeInfo.isSwipe?swipeInfo.deep===-1?{piece:BASE.initHashSheet()}: BASE.getLastSheetsPiece(swipeInfo.deep-1,1000,false):BASE.getLastSheetsPiece()
        return piece
    },
    hashSheetsToSheets(hashSheets) {
        if (!hashSheets) {
            return [];
        }
        
        // [持久化改造] 核心修复：确保每次都从最权威的数据源（hashSheets）创建全新的、干净的Sheet实例，
        // 而不是复用可能被污染的缓存实例（DERIVED.any.chatSheetMap）。
        const newSheets = [];
        for (const sheetUid in hashSheets) {
            // 1. 从 context 中找到原始的、持久化的 sheet 模板数据
            const sheetTemplate = BASE.sheetsData.context.find(s => s.uid === sheetUid);
            if (!sheetTemplate) {
                Logger.warn(`[hashSheetsToSheets] 未在 context 中找到 UID 为 ${sheetUid} 的 sheet 模板，已跳过。`);
                continue;
            }

            // 2. 使用模板创建一个全新的、干净的 Sheet 实例
            const newSheet = new BASE.Sheet(sheetTemplate);

            // 3. 将当前 piece 中的 hash_sheets 状态应用到这个新实例上
            newSheet.hashSheet = hashSheets[sheetUid].map(row => [...row]); // 使用深拷贝确保数据隔离

            // 4. 重新加载 cells，确保内部状态与 cellHistory 同步
            //    loadJson 已经包含了 loadCells 的逻辑
            newSheet.loadCells();

            newSheets.push(newSheet);
        }
        
        // 用新创建的、干净的实例列表，覆盖掉缓存中的旧实例
        const newSheetMap = {};
        newSheets.forEach(s => newSheetMap[s.uid] = s);
        DERIVED.any.chatSheetMap = newSheetMap;

        return newSheets;
    },
    getLastestSheets(){
        const { piece, deep } = BASE.getLastSheetsPiece();
        if (!piece || !piece.hash_sheets) return
        return BASE.hashSheetsToSheets(piece.hash_sheets);
    },
    initHashSheet() {
        if (BASE.sheetsData.context.length === 0) {
            Logger.info("尝试从模板中构建表格数据")
            const {piece: currentPiece} = USER.getChatPiece()
            buildSheetsByTemplates(currentPiece)
            if (currentPiece?.hash_sheets) {
                // console.log('使用模板创建了新的表格数据', currentPiece)
                return currentPiece
            }
        }
        const hash_sheets = {}
        BASE.sheetsData.context.forEach(sheet => {
            hash_sheets[sheet.uid] = [sheet.hashSheet[0].map(hash => hash)]
        })
        return { hash_sheets }
    }
};


/**
 * @description `Editor` 编辑器控制器
 * @description 该控制器用于管理编辑器的状态、事件、设置等数据，包括鼠标位置、聚焦面板、悬停面板、活动面板等
 * @description 编辑器自身数据应相对于其他数据相互独立，对于修改编辑器自身数据不会影响派生数据和用户数据，反之亦然
 * */
export const EDITOR = {
    Drag: Drag,
    PopupMenu: PopupMenu,
    Popup: APP.Popup,
    callGenericPopup: APP.callGenericPopup,
    POPUP_TYPE: APP.POPUP_TYPE,
    generateRaw: APP.generateRaw,
    getSlideToggleOptions: APP.getSlideToggleOptions,
    slideToggle: APP.slideToggle,
    confirm: newPopupConfirm,
    tryBlock: (cb, errorMsg, ...args) => {
        try {
            return cb(...args);
        } catch (e) {
            EDITOR.error(errorMsg ?? '执行代码块失败', e.message, e);
            return null;
        }
    },
    info: (message, detail = '', timeout = 500) => consoleMessageToEditor.info(message, detail, timeout),
    success: (message, detail = '', timeout = 500) => consoleMessageToEditor.success(message, detail, timeout),
    warning: (message, detail = '', timeout = 2000) => consoleMessageToEditor.warning(message, detail, timeout),
    error: (message, detail = '', error, timeout = 2000) => consoleMessageToEditor.error(message, detail, error, timeout),
    clear: () => consoleMessageToEditor.clear(),
    logAll: () => {
        SYSTEM.codePathLog({
            'user_table_database_setting': USER.getSettings().muyoo_dataTable,
            'user_tableBase_templates': USER.getSettings().table_database_templates,
            'context': USER.getContext(),
            'context_chatMetadata_sheets': USER.getContext().chatMetadata?.sheets,
            'context_sheets_data': BASE.sheetsData.context,
            'chat_last_piece': USER.getChatPiece()?.piece,
            'chat_last_sheet': BASE.getLastSheetsPiece()?.piece.hash_sheets,
            'chat_last_old_table': BASE.getLastSheetsPiece()?.piece.dataTable,
        }, 3);
    },
}


/**
 * @description `DerivedData` 项目派生数据管理器
 * @description 该管理器用于管理运行时的派生数据，包括但不限于中间用户数据、系统数据、库数据等
 * @description 请注意，敏感数据不能使用该派生数据管理器进行存储或中转
 * */
export const DERIVED = {
    get any() {
        return createProxy(derivedData);
    },
    // 移除旧的Table类引用，使用新的Sheet和SheetTemplate类
};


/**
 * @description `SYSTEM` 系统控制器
 * @description 该控制器用于管理系统级别的数据、事件、设置等数据，包括组件加载、文件读写、代码路径记录等
 */
export const SYSTEM = {
    getTemplate: (name) => {
        Logger.debug('getTemplate', name);
        return APP.renderExtensionTemplateAsync('third-party/st-memory-enhancement/assets/templates', name);
    },

    codePathLog: function (context = '', deep = 2) {
        const r = getRelativePositionOfCurrentCode(deep);
        const rs = `${r.codeFileRelativePathWithRoot}[${r.codePositionInFile}] `;
        Logger.debug(`%c${rs}${r.codeAbsolutePath}`, 'color: red', context);
    },
    lazy: lazy,
    generateRandomString: generateRandomString,
    generateRandomNumber: generateRandomNumber,
    calculateStringHash: calculateStringHash,

    // readFile: fileManager.readFile,
    // writeFile: fileManager.writeFile,

    taskTiming: taskTiming,
    f: (f, name) => pushCodeToQueue(f, name),
};
