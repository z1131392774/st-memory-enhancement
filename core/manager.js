import { saveSettingsDebounced, saveSettings, getSlideToggleOptions, } from '../../../../../script.js';
import { DOMPurify, Bowser, slideToggle } from '../../../../../../../lib.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../../extensions.js';
import { POPUP_TYPE, Popup, callGenericPopup } from '../../../../popup.js';
import { generateRaw } from '../../../../../../../script.js';
import { power_user, applyPowerUserSettings, getContextSettings, loadPowerUserSettings } from "../../../../../scripts/power-user.js";
import { LoadLocal, SaveLocal, LoadLocalBool } from '../../../../../scripts/f-localStorage.js';
import { Table } from "./source/table.js";
import { TableEditAction } from "./source/tableActions.js";
import { consoleMessageToEditor } from "./derived/devConsole.js";
import {calculateStringHash, generateRandomNumber, generateRandomString, lazy,} from "../utils/utility.js";
import {defaultSettings} from "./source/pluginSetting.js";
import {Drag} from "./source/dragManager.js";
import {PopupMenu} from "./source/popupMenu.js";
import {tableBase} from "./source/tableBase.js";
import {findLastestTableData} from "../index.js";
import {getRelativePositionOfCurrentCode} from "../utils/codePathProcessing.js";
import {fileManager} from "../services/router.js";
import {pushCodeToQueue} from "./derived/_fotTest.js";

let derivedData = {}
/**
 * @description 辅助函数，递归创建 Proxy
 * @param {Object} obj - 要代理的对象
 * @returns {Object} - 创建的 Proxy 对象
 */
const createProxy = (obj) => {
    return new Proxy(obj, {
        get(target, prop) {
            if (typeof target[prop] === 'object' && target[prop] !== null) {
                return createProxy(target[prop]); // 递归调用 createProxy
            } else {
                return target[prop];
            }
        },
        set(target, prop, newValue) {
            target[prop] = newValue; // 直接修改原始的 props 对象
            return true;
        },
    });
}

const createProxyWithUserSetting = (target) => {
    return new Proxy({}, {
        get: (_, property) => {
            // 最优先从用户设置数据中获取
            if (power_user[target] && property in power_user[target]) {
                // console.log(`变量 ${property} 已从用户设置中获取`)
                return power_user[target][property];
            }
            // 尝试从老版本的数据位置 extension_settings.muyoo_dataTable 中获取
            if (extension_settings[target] && property in extension_settings[target]) {
                console.log(`变量 ${property} 未在用户配置中找到, 已从老版本数据中获取`)
                const value = extension_settings[target][property];
                if (!power_user[target]) {
                    power_user[target] = {}; // 初始化，如果不存在
                }
                power_user[target][property] = value;
                return value;
            }
            // 如果 extension_settings.muyoo_dataTable 中也不存在，则从 defaultSettings 中获取
            if (defaultSettings && property in defaultSettings) {
                console.log(`变量 ${property} 未找到, 已从默认设置中获取`)
                return defaultSettings[property];
            }
            // 如果 defaultSettings 中也不存在，则返回 undefined
            EDITOR.error(`变量 ${property} 未在默认设置中找到, 请检查代码`)
            return undefined;
        },
        set: (_, property, value) => {
            console.log(`设置变量 ${property} 为 ${value}`)
            if (!power_user[target]) {
                power_user[target] = {}; // 初始化，如果不存在
            }
            power_user[target][property] = value;
            saveSettings();
            return true;
        },
    })
}

export const BASE = {
    templates: new Proxy({}, {  // 获取储存于用户设置中的模板数据
        get: () => {
            return power_user.templates;
        },
        set: () => {
            EDITOR.error('请不要直接修改模板数据，请使用 BASE.object() 实例进行操作');
            return false;
        },
    }),
    data: new Proxy({}, {  // 储存于用户具体对话上下文中的数据
        get: () => {
            return getContext().table_database;
        },
        set: () => {
            EDITOR.error('请不要直接修改数据，请使用 BASE.object() 实例进行操作');
            return false;
        },
    }),
    object: () => tableBase.object(),   // 获取 TableBase 实例，用于操作数据
};

export const USER = {
    getSettings: () => power_user,
    getContext: () => getContext(),
    getChatPiece: (deep = 0) => {
        const chat = getContext().chat;
        if (!chat || chat.length === 0 || deep >= chat.length) return null;
        return chat[chat.length - 1 - deep]
    },
    applyPowerUserSettings: applyPowerUserSettings,
    tableBaseDefaultSettings: defaultSettings,
    tableBaseSetting: createProxyWithUserSetting('muyoo_dataTable'),
    IMPORTANT_USER_PRIVACY_DATA: createProxyWithUserSetting('IMPORTANT_USER_PRIVACY_DATA'),
}

/**
 * @description `DerivedData` 项目派生数据管理器
 * @description 该管理器用于管理项目派生数据，包括项目配置信息、用户构建的项目内容等
 * @description 请注意，该管理器仅用于编辑器内部，为防止数据混乱，派生数据不应该直接暴露给用户，而应该通过 `Editor` 编辑器控制器提供的方法进行访问
 * @description 用户直接访问派生数据可能会导致数据不一致，因为编辑器内部可能会对数据进行缓存、计算等操作
 * @description 用户通过 `Editor` 的任何操作应尽量通过提供事件的方式返回并自动执行对派生数据的修改，以保证数据的一致性和该环境中定义的数据单向流动的结构
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
 * @description `Editor` 编辑器控制器
 * @description 该控制器用于管理编辑器的状态、事件、设置等数据，包括鼠标位置、聚焦面板、悬停面板、活动面板等
 * @description 编辑器自身数据相对于其他数据相互独立，对于修改编辑器自身数据不会影响派生数据和用户数据，反之亦然
 * @description 提供给用户的用户原始数据（资产）的编辑操作请通过 `FocusedFile` 控制器提供的方法进行访问和修改
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

    info: (message, detail = '', timeout = 500) => consoleMessageToEditor.info(message, detail, timeout),
    success: (message, detail = '', timeout = 500) => consoleMessageToEditor.success(message, detail, timeout),
    warning: (message, detail = '', timeout = 2000) => consoleMessageToEditor.warning(message, detail, timeout),
    error: (message, detail = '', timeout = 2000) => consoleMessageToEditor.error(message, detail, timeout),
    clear: () => consoleMessageToEditor.clear(),
    logAll: () => {
        SYSTEM.codePathLog({
            'user_setting': USER.getSettings(),
            'user_context': USER.getContext(),
            'user_last_chat': USER.getChatPiece(),
            'user_important_user_privacy_data': USER.IMPORTANT_USER_PRIVACY_DATA,
            'tableBase_setting': USER.tableBaseSetting,
            'tableBase_default_setting': USER.tableBaseDefaultSettings,
            'tableBase_templates': BASE.templates,
            'tableBase_data': BASE.data,
        }, 3);
    },
}

/**
 * @description `SYSTEM` 系统控制器 - 用于管理系统的数据，如文件读写、任务计时等
 */
export const SYSTEM = {
    getComponent: (name) => {
        console.log('getComponent', name);
        return renderExtensionTemplateAsync('third-party/st-memory-enhancement/assets/templates', name);
    },
    htmlToDom: (html, targetId = '') => {
        const dom = new DOMParser().parseFromString(html, 'text/html');
        if (targetId === '') return dom;
        return dom.getElementById(targetId);
    },
    lazy: lazy,
    codePathLog: function (context = '', deep = 2) {
        const r = getRelativePositionOfCurrentCode(deep);
        const rs = `${r.codeFileRelativePathWithRoot}[${r.codePositionInFile}] `;
        console.log(`%c${rs}${r.codeAbsolutePath}`, 'color: red', context);
    },
    generateRandomString: generateRandomString,
    generateRandomNumber: generateRandomNumber,
    calculateStringHash: calculateStringHash,

    readFile: fileManager.readFile,
    writeFile: fileManager.writeFile,

    // taskTiming: ,
    code: (f) => pushCodeToQueue(f),
};
