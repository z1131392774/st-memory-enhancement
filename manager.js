import applicationFunctionManager from "./services/appFuncManager.js";
// 移除旧表格系统引用
import { consoleMessageToEditor } from "./core/runtime/devConsole.js";
import {calculateStringHash, generateRandomNumber, generateRandomString, lazy, readonly,} from "./utils/utility.js";
import {defaultSettings} from "./core/pluginSetting.js";
import {Drag} from "./components/dragManager.js";
import {PopupMenu} from "./components/popupMenu.js";
import {buildSheetsByTemplates, convertOldTablesToNewSheets} from "./index.js";
import {getRelativePositionOfCurrentCode} from "./utils/codePathProcessing.js";
import {fileManager} from "./services/router.js";
import {pushCodeToQueue} from "./components/_fotTest.js";
import {createProxy, createProxyWithUserSetting} from "./utils/codeProxy.js";
import {Sheet, SheetTemplate} from "./core/tableBase.js";
import { refreshTempView } from './core/editor/tableTemplateEditView.js';
import {newPopupConfirm, PopupConfirm} from "./components/popupConfirm.js";
import {refreshContextView} from "./core/editor/chatSheetsDataView.js";
import {updateSystemMessageTableStatus} from "./core/renderer/tablePushToChat.js";

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
    saveChat:()=> APP.saveChat(),
    getContext: () => APP.getContext(),
    // getContextSheets: () => APP.getContext().chatMetadata.sheets,
    // getRoleSheets: () => APP,
    // getGlobalSheets: () => APP,
    getChatPiece: (deep = 0) => {
        const chat = APP.getContext().chat;
        if (!chat || chat.length === 0 || deep >= chat.length) return null;
        return chat[chat.length - 1 - deep]
    },
    loadUserAllTemplates() {
        let templates = USER.getSettings().table_database_templates;
        if (!Array.isArray(templates)) {
            templates = [];
            USER.getSettings().table_database_templates = templates;
            USER.saveSettings();
        }
        return templates;
    },
    tableBaseSetting: createProxyWithUserSetting('muyoo_dataTable'),
    tableBaseDefaultSettings: {...defaultSettings},
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
    Sheet: Sheet,
    SheetTemplate: SheetTemplate,
    templates: USER.loadUserAllTemplates(),
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
        }
    }),

    getLastSheetsPiece(deep = 0, cutoff = 1000) {
        // 如果没有找到新系统的表格数据，则尝试查找旧系统的表格数据（兼容模式）
        const chat = APP.getContext().chat
        if (!chat || chat.length === 0 || chat.length <= deep) return null;

        for (let i = chat.length - deep - 1; i >= 0 && i >= chat.length - cutoff; i--) {
            if (chat[i].hash_sheets) {
                // console.log("向上查询表格数据，找到表格数据", chat[i])
                return chat[i]
            }
            // 如果没有找到新系统的表格数据，则尝试查找旧系统的表格数据（兼容模式）
            // 请注意不再使用旧的Table类
            if (chat[i].dataTable) {
                // 为了兼容旧系统，将旧数据转换为新的Sheet格式
                convertOldTablesToNewSheets(chat[i].dataTable)
                return chat[i]
            }
        }

        if (!BASE.sheetsData.context) {
            // 尝试从模板中构建表格数据
            const currentPiece = USER.getChatPiece()
            buildSheetsByTemplates(currentPiece)
            if (currentPiece.hash_sheets) {
                // console.log('使用模板创建了新的表格数据', currentPiece)
                return currentPiece
            }
        }

        // 如果都没有找到，则返回空数组
        console.log("向上查询表格数据，未找到表格数据")
        return null
    },
    hashSheetsToSheets(hashSheets) {
        if (!hashSheets) {
            return [];
        }
        return Object.keys(hashSheets).map(sheetUid => {
            const sheet = new Sheet(sheetUid)
            sheet.hashSheet = hashSheets[sheetUid].map(row => row.map(hash => hash));
            return sheet
        });
    },
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

    // refreshSheetsView: async (ignoreGlobal = false) => {
    //     refreshTempView(ignoreGlobal);
    //     updateSystemMessageTableStatus(true);
    //     // refreshContextView();
    // },
    confirm: newPopupConfirm,

    info: (message, detail = '', timeout = 500) => consoleMessageToEditor.info(message, detail, timeout),
    success: (message, detail = '', timeout = 500) => consoleMessageToEditor.success(message, detail, timeout),
    warning: (message, detail = '', timeout = 2000) => consoleMessageToEditor.warning(message, detail, timeout),
    error: (message, detail = '', timeout = 2000) => consoleMessageToEditor.error(message, detail, timeout),
    clear: () => consoleMessageToEditor.clear(),
    logAll: () => {
        SYSTEM.codePathLog({
            'user_table_database_setting': USER.getSettings().muyoo_dataTable,
            'user_tableBase_templates': USER.getSettings().table_database_templates,
            'context': USER.getContext(),
            'context_chatMetadata_sheets': USER.getContext().chatMetadata?.sheets,
            'context_sheets_data': BASE.sheetsData.context,
            'chat_last_piece': USER.getChatPiece(),
            'chat_last_sheet': BASE.getLastSheetsPiece()?.hash_sheets,
            'chat_last_old_table': BASE.getLastSheetsPiece()?.dataTable,
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
        console.log('getTemplate', name);
        return APP.renderExtensionTemplateAsync('third-party/st-memory-enhancement/assets/templates', name);
    },

    codePathLog: function (context = '', deep = 2) {
        const r = getRelativePositionOfCurrentCode(deep);
        const rs = `${r.codeFileRelativePathWithRoot}[${r.codePositionInFile}] `;
        console.log(`%c${rs}${r.codeAbsolutePath}`, 'color: red', context);
    },
    lazy: lazy,
    generateRandomString: generateRandomString,
    generateRandomNumber: generateRandomNumber,
    calculateStringHash: calculateStringHash,

    // readFile: fileManager.readFile,
    // writeFile: fileManager.writeFile,

    // taskTiming: ,
    f: (f, name) => pushCodeToQueue(f, name),
};
