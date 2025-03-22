import { saveSettingsDebounced, saveSettings, getSlideToggleOptions, generateRaw } from '../../../../../../../script.js';
import { DOMPurify, Bowser, slideToggle } from '../../../../../../../lib.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../../../../../scripts/extensions.js';
import { POPUP_TYPE, Popup, callGenericPopup } from '../../../../../../../scripts/popup.js';
import { power_user, applyPowerUserSettings, getContextSettings, loadPowerUserSettings } from "../../../../../../../scripts/power-user.js";
import { LoadLocal, SaveLocal, LoadLocalBool } from '../../../../../../../scripts/f-localStorage.js';
import { Table } from "./core/table.js";
import { TableEditAction } from "./core/tableActions.js";
import { consoleMessageToEditor } from "./core/runtime/devConsole.js";
import {calculateStringHash, generateRandomNumber, generateRandomString, lazy, readonly,} from "./utils/utility.js";
import {defaultSettings} from "./core/pluginSetting.js";
import {Drag} from "./components/dragManager.js";
import {PopupMenu} from "./components/popupMenu.js";
import {findLastestTableData} from "./index.js";
import {getRelativePositionOfCurrentCode} from "./utils/codePathProcessing.js";
import {fileManager} from "./services/router.js";
import {pushCodeToQueue} from "./components/_fotTest.js";
import {createProxy, createProxyWithUserSetting} from "./utils/codeProxy.js";
import {Sheet} from "./core/tableBase.js";
import { saveChat } from '../../../../script.js';
import { refreshTempView } from './core/editor/tableTemplateEditView.js';

let derivedData = {}

/**
 * @description `USER` 用户数据管理器
 * @description 该管理器用于管理用户的设置、上下文、聊天记录等数据
 * @description 请注意，用户数据应该通过该管理器提供的方法进行访问，而不应该直接访问用户数据
 */
export const USER = {
    getSettings: () => power_user,
    saveSettings: () => saveSettings(),
    saveChat:()=> saveChat(),
    getContext: () => getContext(),
    getChatMetadata: () => getContext().chatMetadata,
    getChatPiece: (deep = 0) => {
        const chat = getContext().chat;
        if (!chat || chat.length === 0 || deep >= chat.length) return null;
        return chat[chat.length - 1 - deep]
    },
    tableBaseSetting: createProxyWithUserSetting('muyoo_dataTable'),
    IMPORTANT_USER_PRIVACY_DATA: createProxyWithUserSetting('IMPORTANT_USER_PRIVACY_DATA'),
}
readonly(USER, 'tableBaseDefaultSettings', () => defaultSettings);
// readonly(USER, 'tableBaseTemplates', () => power_user.getSettings().table_database_templates);


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

    loadUserAllTemplates() {
        let templates = USER.getSettings().table_database_templates;
        if (!Array.isArray(templates)) {
            templates = [];
            USER.getSettings().table_database_templates = templates;
            USER.saveSettings();
        }
        return templates;
    },
    loadChatAllSheets() {
        const chatMetadata = USER.getContext().chatMetadata;
        return chatMetadata.sheets
    },
    loadContextAllSheets() {
        let sheets = USER.getChatMetadata().sheets;
        if (!Array.isArray(sheets)) {
            sheets = [];
            USER.getChatMetadata().sheets = sheets;
        }
        return sheets;
    },
    getLastSheetsPiece: (deep = 0, cutoff = 1000) => {
        const chat = getContext().chat;
        // throw new Error('Not implemented yet');
        if (!chat || chat.length === 0) return null;
        for (let i = 0; i < chat.length && i < cutoff; i++) {
            const piece = chat[chat.length - 1 - i];
            if (piece.tablebase_sheets) {
                return piece;
            }
        }
    },

    destroyAllTemplates() {
        if (confirm("确定要销毁所有表格模板数据吗？") === false) return false;
        USER.getSettings().table_database_templates = [];
        USER.getSettings().table_database_templates_selected = [];
        USER.saveSettings();
        return true;
    },
    destroyAllContextSheets() {
        if (confirm("确定要销毁所有表格数据吗？") === false) return false;
        USER.getChatMetadata().sheets = [];
        USER.saveChat();
        return true;
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
    Popup: Popup,
    callGenericPopup: callGenericPopup,
    POPUP_TYPE: POPUP_TYPE,
    generateRaw: generateRaw,
    getSlideToggleOptions: getSlideToggleOptions,
    slideToggle: slideToggle,

    refresh: refreshTempView,

    info: (message, detail = '', timeout = 500) => consoleMessageToEditor.info(message, detail, timeout),
    success: (message, detail = '', timeout = 500) => consoleMessageToEditor.success(message, detail, timeout),
    warning: (message, detail = '', timeout = 2000) => consoleMessageToEditor.warning(message, detail, timeout),
    error: (message, detail = '', timeout = 2000) => consoleMessageToEditor.error(message, detail, timeout),
    clear: () => consoleMessageToEditor.clear(),
    logAll: () => {
        SYSTEM.codePathLog({
            // 'user_setting': USER.getSettings(),
            // 'user_table_database_default_setting': defaultSettings,
            // 'user_important_user_privacy_data': USER.IMPORTANT_USER_PRIVACY_DATA,
            'user_table_database_setting': USER.tableBaseSetting,
            'user_tableBase_templates': USER.getSettings().table_database_templates,
            'context': USER.getContext(),
            'context_tableBase_data': BASE.loadContextAllSheets(),
            'chat_last_piece': USER.getChatPiece(),
            'chat_last_sheet': BASE.getLastSheetsPiece(),
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
        let data = derivedData;
        if (!data) {
            console.warn("data (props) is undefined, please ensure 'let props = {}' is defined in the same file.");
            return {};
        }
        return createProxy(data);
    },
    Table: Table,
    TableEditAction: TableEditAction,
};


/**
 * @description `SYSTEM` 系统控制器
 * @description 该控制器用于管理系统级别的数据、事件、设置等数据，包括组件加载、文件读写、代码路径记录等
 */
export const SYSTEM = {
    getTemplate: (name) => {
        console.log('getTemplate', name);
        return renderExtensionTemplateAsync('third-party/st-memory-enhancement/assets/templates', name);
    },
    htmlToDom: (html, targetId = '') => {
        const dom = new DOMParser().parseFromString(html, 'text/html');
        if (targetId === '') return dom;
        return dom.getElementById(targetId);
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

    readFile: fileManager.readFile,
    writeFile: fileManager.writeFile,

    // taskTiming: ,
    f: (f, name) => pushCodeToQueue(f, name),
};
