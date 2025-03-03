import { saveSettingsDebounced, } from '../../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../../extensions.js';
import { POPUP_TYPE, Popup, callGenericPopup } from '../../../../popup.js';
import { generateRaw } from '../../../../../../../script.js';
import { Table } from "./source/table.js";
import { TableEditAction } from "./source/tableActions.js";
import { consoleMessageToEditor } from "./derived/devConsole.js";
import {calculateStringHash, generateDeviceId, generateRandomNumber, generateRandomString} from "../utils/utility.js";
import {defaultSettings} from "./source/pluginSetting.js";

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

/**
 * @description `DerivedData` 项目派生数据管理器
 * @description 该管理器用于管理项目派生数据，包括项目配置信息、用户构建的项目内容等
 * @description 请注意，该管理器仅用于编辑器内部，为防止数据混乱，派生数据不应该直接暴露给用户，而应该通过 `Editor` 编辑器控制器提供的方法进行访问
 * @description 用户直接访问派生数据可能会导致数据不一致，因为编辑器内部可能会对数据进行缓存、计算等操作
 * @description 用户通过 `Editor` 的任何操作应尽量通过提供事件的方式返回并自动执行对派生数据的修改，以保证数据的一致性和该环境中定义的数据单向流动的结构
 * */
export let DERIVED = {
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
export let EDITOR = {
    Popup: Popup,
    callGenericPopup: callGenericPopup,
    POPUP_TYPE: POPUP_TYPE,
    generateRaw: generateRaw,
    saveSettingsDebounced: saveSettingsDebounced,

    info: consoleMessageToEditor.info,
    success: consoleMessageToEditor.success,
    warning: consoleMessageToEditor.warning,
    error: consoleMessageToEditor.error,
    clear: consoleMessageToEditor.clear,

    defaultSettings: defaultSettings,
    allData: extension_settings.muyoo_dataTable,
    /**
     * @description 优化的 data 属性，优先从 extension_settings.muyoo_dataTable 获取，
     *              如果不存在则从 defaultSettings 中获取
     */
    data: new Proxy({}, {
        get(_, property) {
            // 如果property为空，则返回所有数据
            // if (!property) {
            //     return extension_settings.muyoo_dataTable;
            // }

            // 优先从 extension_settings.muyoo_dataTable 中获取
            if (extension_settings.muyoo_dataTable && property in extension_settings.muyoo_dataTable) {
                EDITOR.saveSettingsDebounced();
                return extension_settings.muyoo_dataTable[property];
            }
            // 如果 extension_settings.muyoo_dataTable 中不存在，则从 defaultSettings 中获取
            if (defaultSettings && property in defaultSettings) {
                console.log(`变量 ${property} 未找到, 已从默认设置中获取`)
                EDITOR.saveSettingsDebounced();
                return defaultSettings[property];
            }
            // 如果 defaultSettings 中也不存在，则返回 undefined
            consoleMessageToEditor.error(`变量 ${property} 未在默认设置中找到, 请检查代码`)
            EDITOR.saveSettingsDebounced();
            return undefined;
        },
        set(_, property, value) {
            // 将设置操作直接作用于 extension_settings.muyoo_dataTable
            if (!extension_settings.muyoo_dataTable) {
                extension_settings.muyoo_dataTable = {}; // 初始化，如果不存在
            }
            extension_settings.muyoo_dataTable[property] = value;
            // console.log(`设置变量 ${property} 为 ${value}`)
            EDITOR.saveSettingsDebounced();
            return true;
        }
    }),
    IMPORTANT_USER_PRIVACY_DATA: extension_settings.IMPORTANT_USER_PRIVACY_DATA,

    getContext: getContext,
}

let antiShakeTimers = {};
/**
 * @description `SYSTEM` 系统控制器 - 用于管理系统的数据，如文件读写、任务计时等
 */
export let SYSTEM = {
    getComponent: (name) => {
        console.log('getComponent', name);
        return renderExtensionTemplateAsync('third-party/st-memory-enhancement/assets/templates', name);
    },
    /**
     * 防抖函数，控制某个操作的执行频率
     * @param {string} uid 唯一标识符，用于区分不同的防抖操作
     * @param {number} interval 时间间隔，单位毫秒，在这个间隔内只允许执行一次
     * @returns {boolean} 如果允许执行返回 true，否则返回 false
     */
    lazy: function(uid, interval = 100) {
        if (!antiShakeTimers[uid]) {
            antiShakeTimers[uid] = { lastExecutionTime: 0 };
        }
        const timer = antiShakeTimers[uid];
        const currentTime = Date.now();

        if (currentTime - timer.lastExecutionTime < interval) {
            return false; // 时间间隔太短，防抖，不允许执行
        }

        timer.lastExecutionTime = currentTime;
        return true; // 允许执行
    },
    generateRandomString: generateRandomString,
    generateRandomNumber: generateRandomNumber,
    calculateStringHash: calculateStringHash,
    // readFile: ,
    // writeFile: ,
    //
    // taskTiming: ,
};
