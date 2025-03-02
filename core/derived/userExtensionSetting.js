import { DERIVED, EDITOR, SYSTEM } from '../manager.js';
import {updateSystemMessageTableStatus} from "./tablePushToChat.js";

import {refreshTableActions, updateModelList,rebuildTableActions,encryptXor} from "./absoluteRefresh.js";
import {generateDeviceId} from "../../utils/utility.js";
import {openTableDebugLogPopup} from "./devConsole.js";

/**
 * 表格重置弹出窗
 */
const tableInitPopupDom = `<span>将重置以下表格数据，是否继续？</span><br><span style="color: rgb(211 39 39)">（建议重置前先备份数据）</span>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_basic" checked><span>基础设置</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_message_template"><span>消息模板</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_refresh_template"><span>重新整理表格设置与消息模板</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_to_chat_container"><span>对话中的面板样式</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_structure"><span>所有表格结构数据</span>
</div>
<div class="checkbox flex-container">
    <input type="checkbox" id="table_init_api"><span>个人API配置</span>
</div>
`

/**
 * 格式化深度设置
 */
function formatDeep() {
    EDITOR.data.deep = Math.abs(EDITOR.data.deep)
}

/**
 * 更新设置中的开关状态
 */
function updateSwitch(selector, switchValue) {
    if (switchValue) {
        $(selector).prop('checked', true);
    } else {
        $(selector).prop('checked', false);
    }
}

/**
 * 导出插件设置
 */
function exportTableSet() {
    const blob = new Blob([JSON.stringify(EDITOR.data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a')
    a.href = url;
    a.download = `tableExtensionPrompt.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * 更新设置中的表格结构DOM
 */
function updateTableStructureDOM() {
    const container = $('#dataTable_tableEditor_list');
    container.empty();
    EDITOR.data.tableStructure.forEach((tableStructure) => {
        container.append(tableStructureToSettingDOM(tableStructure));
    })
}

/**
 * 将表格结构转为设置DOM
 * @param {object} tableStructure 表格结构
 * @returns 设置DOM
 */
function tableStructureToSettingDOM(tableStructure) {
    const tableIndex = tableStructure.tableIndex;
    const $item = $('<div>', { class: 'dataTable_tableEditor_item' });
    const $index = $('<div>').text(`#${tableIndex}`); // 编号
    const $input = $('<div>', {
        class: 'tableName_pole margin0',
    });
    $input.text(tableStructure.tableName);
    const $checkboxLabel = $('<label>', { class: 'checkbox' });
    const $checkbox = $('<input>', { type: 'checkbox', 'data-index': tableIndex, checked: tableStructure.enable, class: 'tableEditor_switch' });
    $checkboxLabel.append($checkbox, '启用');
    const $editButton = $('<div>', {
        class: 'menu_button menu_button_icon fa-solid fa-pencil tableEditor_editButton',
        title: '编辑',
        'data-index': tableIndex, // 绑定索引
    }).text('编辑');
    $item.append($index, $input, $checkboxLabel, $editButton);
    return $item;
}

/**
 * 导入插件设置
 */
async function importTableSet(/**@type {FileList}*/files) {
    for (let i = 0; i < files.length; i++) {
        await importSingleTableSet(files.item(i))
    }
}

/**
 * 导入表格数据文件
 * */
async function importTableDataFile(){
    const importFileElement = document.querySelector('#table-set-importFile'); // 获取文件输入元素

    // 定义一个具名的事件处理函数
    async function changeEventHandler(event) {
        const files = event.target.files; // 从事件对象中获取 files 列表
        console.log("选择的文件列表:", files);

        if (files && files.length > 0) { // 确保用户选择了文件
            await importTableSet(files); // 调用 importTableSet 函数处理文件
            importFileElement.value = null; // 清空文件输入框的值，以便下次可以选择相同文件
        } else {
            console.log("用户取消了文件选择或未选择文件。");
        }

        // 移除事件监听器
        importFileElement.removeEventListener('change', changeEventHandler); // 使用具名函数引用移除
    }

    // 添加 change 事件监听器，使用具名函数引用
    importFileElement.addEventListener('change', changeEventHandler);

    importFileElement.click(); // 触发文件选择对话框
}



async function importSingleTableSet(/**@type {File}*/file) {
    try {
        const text = await file.text()
        const props = JSON.parse(text)
        console.log(props)
        if (props.message_template && props.tableStructure) {
            EDITOR.data.tableStructure = props.tableStructure
            EDITOR.data.message_template = props.message_template
            EDITOR.data.to_chat_container = props.to_chat_container
            EDITOR.data.deep = props.deep
            EDITOR.data.injection_mode = props.injection_mode
            EDITOR.saveSettingsDebounced()
            renderSetting()
            EDITOR.success('导入成功')
        } else EDITOR.error('导入失败，非记忆插件预设')
    } catch (e) {
        EDITOR.error('导入失败，请检查文件格式')
    }
}

/**
 * 重置设置
 */
async function resetSettings() {
    const tableInitPopup = $(tableInitPopupDom)
    const confirmation = await EDITOR.callGenericPopup(tableInitPopup, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "继续", cancelButton: "取消" });
    if (confirmation) {
        // 千万不要简化以下的三元表达式和赋值顺序！！！，否则会导致重置设置无法正确运行
        // 判断是否重置所有基础设置(这条判断语句必须放在第一行)
        let newSettings = tableInitPopup.find('#table_init_basic').prop('checked') ? {...EDITOR.data, ...EDITOR.defaultSettings} : {...EDITOR.data};

        // 以下的赋值顺序可以改变
        // 判断是否重置消息模板
        if (tableInitPopup.find('#table_init_message_template').prop('checked')) {
            newSettings.message_template = EDITOR.defaultSettings.message_template;
        } else {
            newSettings.message_template = EDITOR.data.message_template;
        }
        // 判断是否重置重新整理表格的提示词
        if (tableInitPopup.find('#table_init_refresh_template').prop('checked')) {
            newSettings.refresh_system_message_template = EDITOR.defaultSettings.refresh_system_message_template;
            newSettings.refresh_user_message_template = EDITOR.defaultSettings.refresh_user_message_template;
            newSettings.rebuild_system_message_template = EDITOR.defaultSettings.rebuild_system_message_template;
            newSettings.rebuild_user_message_template = EDITOR.defaultSettings.rebuild_user_message_template;
        } else {
            newSettings.refresh_system_message_template = EDITOR.data.refresh_system_message_template;
            newSettings.refresh_user_message_template = EDITOR.data.refresh_user_message_template;
            newSettings.rebuild_system_message_template = EDITOR.data.rebuild_system_message_template;
            newSettings.rebuild_user_message_template = EDITOR.data.rebuild_user_message_template;
        }
        // 判断是否重置所有表格结构
        if (tableInitPopup.find('#table_init_structure').prop('checked')) {
            newSettings.tableStructure = EDITOR.defaultSettings.tableStructure;
        } else {
            newSettings.tableStructure = EDITOR.data.tableStructure;
        }
        // 判断是否重置推送到聊天框的内容样式
        if (tableInitPopup.find('#table_init_to_chat_container').prop('checked')) {
            newSettings.to_chat_container = EDITOR.defaultSettings.to_chat_container;
        } else {
            newSettings.to_chat_container = EDITOR.data.to_chat_container;
        }

        // 以下为独立的赋值，不会影响其他设置
        // 判断是否重置用户个人API设置
        if (tableInitPopup.find('#table_init_api').prop('checked')) {
            EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_url = '';
            EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_key = '';
            EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = '';
        }

        EDITOR.data = newSettings;
        EDITOR.saveSettingsDebounced();
        renderSetting()
        EDITOR.success('已重置所选设置');
    }
}

function InitBinging() {
    console.log('初始化绑定')
    // 开始绑定事件
    // 导入预设
    $('#table-set-import').on('click', () => importTableDataFile());
    // 导出
    $("#table-set-export").on('click', () => exportTableSet());
    // 重置设置
    $("#table-reset").on('click', () => resetSettings());
    // 插件总体开关
    $('#table_switch').change(function () {
        EDITOR.data.isExtensionAble = this.checked;
        EDITOR.saveSettingsDebounced();
        EDITOR.success(this.checked ? '插件已开启' : '插件已关闭，可以打开和手动编辑表格但AI不会读表和生成');
        updateSystemMessageTableStatus();   // 将表格数据状态更新到系统消息中
    });
    // 调试模式开关
    $('#table_switch_debug_mode').change(function () {
        EDITOR.data.tableDebugModeAble = this.checked;
        EDITOR.saveSettingsDebounced();
        EDITOR.success(this.checked ? '调试模式已开启' : '调试模式已关闭');
    });
    // 插件读表开关
    $('#table_read_switch').change(function () {
        EDITOR.data.isAiReadTable = this.checked;
        EDITOR.saveSettingsDebounced();
        EDITOR.success(this.checked ? 'AI现在会读取表格' : 'AI现在将不会读表');
    });
    // 插件写表开关
    $('#table_edit_switch').change(function () {
        EDITOR.data.isAiWriteTable = this.checked;
        EDITOR.saveSettingsDebounced();
        EDITOR.success(this.checked ? 'AI的更改现在会被写入表格' : 'AI的更改现在不会被写入表格');
    });

    // 表格插入模式
    $('#dataTable_injection_mode').on('change', (event) => {
        EDITOR.data.injection_mode = event.target.value;
        EDITOR.saveSettingsDebounced();
    });
    // 表格消息模板
    $('#dataTable_message_template').on("input", function () {
        const value = $(this).val();
        EDITOR.data.message_template = value;
        EDITOR.saveSettingsDebounced();
    })
    // 表格推送至对话
    $("#dataTable_to_chat_button").on("click", async function () {
        const result = await EDITOR.callGenericPopup("自定义推送至对话的表格的包裹样式，支持HTML与CSS，使用$0表示表格整体的插入位置", EDITOR.POPUP_TYPE.INPUT, EDITOR.data.to_chat_container, { rows: 10 })
        if (result) {
            EDITOR.data.to_chat_container = result;
            EDITOR.saveSettingsDebounced()
            updateSystemMessageTableStatus()
        }
    })
    // 表格深度
    $('#dataTable_deep').on("input", function () {
        const value = $(this).val();
        EDITOR.data.deep = Math.abs(value);
        EDITOR.saveSettingsDebounced();
    })




    $('#step_by_step').on('change', function() {
        $('#reply_options').toggle(!this.checked);
        EDITOR.data.step_by_step = this.checked;
        EDITOR.saveSettingsDebounced();
    });


    // 表格推送至对话开关
    $('#table_to_chat').change(function () {
        EDITOR.data.isTableToChat = this.checked;
        EDITOR.saveSettingsDebounced();
        EDITOR.success(this.checked ? '表格会被推送至对话中' : '关闭表格推送至对话');
        updateSystemMessageTableStatus();   // 将表格数据状态更新到系统消息中
    });


    //整理表格相关高级设置
    $('#advanced_settings').on('change', function() {
        $('#advanced_options').toggle(this.checked);
        EDITOR.data.advanced_settings = this.checked;
        EDITOR.saveSettingsDebounced();
    });
    // 忽略删除
    $('#ignore_del').on('change', function() {
        EDITOR.data.bool_ignore_del = $(this).prop('checked');
        EDITOR.saveSettingsDebounced();
        console.log('bool_ignore_del:' + EDITOR.data.bool_ignore_del);
    });
    // 清理聊天记录楼层
    $('#clear_up_stairs').on('input', function() {
        const value = $(this).val();
        $('#clear_up_stairs_value').text(value);
        EDITOR.data.clear_up_stairs = Number(value);
        EDITOR.saveSettingsDebounced();
    });
    // 模型温度设定
    $('#custom_temperature').on('input', function() {
        const value = $(this).val();
        $('#custom_temperature_value').text(value);
        EDITOR.data.custom_temperature = Number(value);
        EDITOR.saveSettingsDebounced();
    });
    // 强制刷新
    $('#bool_force_refresh').on('change', function() {
        EDITOR.data.bool_force_refresh = $(this).prop('checked');
        console.log('bool_force_refresh:',EDITOR.data.bool_force_refresh)
        EDITOR.saveSettingsDebounced();
    });
    // 静默刷新
    $('#bool_silent_refresh').on('change', function() {
        EDITOR.data.bool_silent_refresh = $(this).prop('checked');
        console.log('bool_silent_refresh:',EDITOR.data.bool_silent_refresh)
        EDITOR.saveSettingsDebounced();
    });


    // API设置
    // 初始化API设置显示状态
    $('#use_main_api').on('change', function() {
        $('#custom_api_settings').toggle(!this.checked);
        EDITOR.data.use_main_api = this.checked;
        EDITOR.saveSettingsDebounced();
    });
    // API URL
    $('#custom_api_url').on('input', function() {
        EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_url = $(this).val();
        EDITOR.saveSettingsDebounced();
    });
    // API KEY
    $('#custom_api_key').on('input', async function() {
        try {
            const rawKey = $(this).val();
            // 加密
            EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_key = encryptXor(rawKey, generateDeviceId());
            // console.log('加密后的API密钥:', EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_key);
            EDITOR.saveSettingsDebounced();

        } catch (error) {
            console.error('API Key 处理失败:', error);
            EDITOR.error('未能获取到API KEY，请重新输入~');
        }
    })

    // 模型名称
    $('#custom_model_name').on('input', function() {
        EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = $(this).val();
        EDITOR.saveSettingsDebounced();
    });
    // 获取模型列表
    $('#fetch_models_button').on('click', updateModelList);
    // 根据下拉列表选择的模型更新自定义模型名称
    $('#model_selector').on('change', function() {
        const selectedModel = $(this).val();
        $('#custom_model_name').val(selectedModel);
        EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = selectedModel;
        EDITOR.saveSettingsDebounced();
    });
    // 开始整理表格
    $("#table_clear_up").on('click', () => refreshTableActions(
        EDITOR.data.bool_force_refresh,
        EDITOR.data.bool_silent_refresh)
    );
    // 完整重建表格
    $('#rebuild_table').on('click', () => rebuildTableActions(
        EDITOR.data.bool_force_refresh,
        EDITOR.data.bool_silent_refresh)
    );
}

/**
 * 渲染设置
 */
export function renderSetting() {
    $(`#dataTable_injection_mode option[value="${EDITOR.data.injection_mode}"]`).attr('selected', true);
    $('#dataTable_deep').val(EDITOR.data.deep);
    $('#dataTable_message_template').val(EDITOR.data.message_template);
    updateSwitch("#table_switch", EDITOR.data.isExtensionAble)
    updateSwitch("#table_switch_debug_mode", EDITOR.data.tableDebugModeAble)
    updateSwitch("#table_read_switch", EDITOR.data.isAiReadTable)
    updateSwitch("#table_edit_switch", EDITOR.data.isAiWriteTable)
    updateSwitch("#table_to_chat", EDITOR.data.isTableToChat)
    updateSwitch("#advanced_settings", EDITOR.data.advanced_settings)
    $('#advanced_options').toggle(EDITOR.data.advanced_settings)
    $('#custom_api_settings').toggle(!EDITOR.data.use_main_api);
    updateTableStructureDOM()
    console.log("设置已渲染")
}

/**
 * 加载设置
 */
export function loadSettings() {
    EDITOR.data = EDITOR.data || {};
    EDITOR.IMPORTANT_USER_PRIVACY_DATA = EDITOR.IMPORTANT_USER_PRIVACY_DATA || {};

    for (const key in EDITOR.defaultSettings) {
        if (!Object.hasOwn(EDITOR.data, key)) {
            EDITOR.data[key] = EDITOR.defaultSettings[key];
        }
    }
    if (EDITOR.data.updateIndex != 3) {
        EDITOR.data.message_template = EDITOR.defaultSettings.message_template
        EDITOR.data.to_chat_container = EDITOR.defaultSettings.to_chat_container
        EDITOR.data.tableStructure = EDITOR.defaultSettings.tableStructure
        EDITOR.data.updateIndex = 3
    }
    if (EDITOR.data.deep < 0) formatDeep()

    InitBinging();
    renderSetting()

    //api初始化
    $('#step_by_step').prop('checked', EDITOR.data.step_by_step ?? true);
    $('#reply_options').toggle(!EDITOR.data.step_by_step);
    $('#use_main_api').prop('checked', EDITOR.data.use_main_api ?? true);
    $('#custom_api_settings').toggle(!EDITOR.data.use_main_api);

    $('#custom_api_url').val(EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_url || '');
    $('#custom_api_key').val(EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_api_key || '');
    $('#custom_model_name').val(EDITOR.IMPORTANT_USER_PRIVACY_DATA.custom_model_name || '');

    if (typeof EDITOR.data.bool_ignore_del === 'undefined') {
        EDITOR.data.bool_ignore_del = EDITOR.defaultSettings.bool_ignore_del;
    }

    EDITOR.data.clear_up_stairs = EDITOR.data.clear_up_stairs || 9;
    $('#clear_up_stairs').val(EDITOR.data.clear_up_stairs);
    $('#clear_up_stairs_value').text(EDITOR.data.clear_up_stairs);

    EDITOR.data.custom_temperature = EDITOR.data.custom_temperature || 1.0;
    $('#custom_temperature').val(EDITOR.data.custom_temperature);
    $('#custom_temperature_value').text(EDITOR.data.custom_temperature);
    $('#bool_force_refresh').prop('checked', EDITOR.data.bool_force_refresh || false);
    $('#bool_silent_refresh').prop('checked', EDITOR.data.bool_silent_refresh || false);
}
