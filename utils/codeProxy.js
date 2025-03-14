import { saveSettingsDebounced, saveSettings, getSlideToggleOptions, } from '../../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../../extensions.js';
import { power_user, applyPowerUserSettings, getContextSettings, loadPowerUserSettings } from "../../../../../scripts/power-user.js";
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';

/**
 * @description 辅助函数，递归创建 Proxy
 * @param {Object} obj - 要代理的对象
 * @returns {Object} - 创建的 Proxy 对象
 */
export const createProxy = (obj) => {
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

export const createProxyWithUserSetting = (target) => {
    return new Proxy({}, {
        get: (_, property) => {
            // console.log(`创建代理对象 ${target}`, property)
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
            if (USER.tableBaseDefaultSettings && property in USER.tableBaseDefaultSettings) {
                console.log(`变量 ${property} 未找到, 已从默认设置中获取`)
                return USER.tableBaseDefaultSettings[property];
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
