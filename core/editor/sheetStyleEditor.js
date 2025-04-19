// sheetStyleEditor.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../manager.js';

/**
 * 解析表格渲染样式
 * @param {string} sheetStyleReplace 样式模板
 * @param {object} sheet 表格对象
 * @returns {string} 渲染后的HTML
 */
function parseSheetRender(sheetStyleReplace, sheet) {
    if (!sheetStyleReplace) {
        return sheet?.element || '<div>表格数据未加载</div>';
    }
    if (!sheet) {
        return sheetStyleReplace;
    }

    return sheetStyleReplace.replace(/\$(\w)(\d+)/g, (match, colLetter, rowNumber) => {
        const colIndex = colLetter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
        const rowIndex = parseInt(rowNumber);
        const c = sheet.findCellByPosition(rowIndex, colIndex);
        console.log(c, rowIndex, colIndex, match);

        return c ? (c.data.value || `<span style="color: red">?</span>`) :
                    `<span style="color: red">无单元格</span>`;
    });
}

async function initBindings($dlg) {
    return {
        rendererDisplay: $dlg.find('#tableRendererDisplay'),
        benchmark: $dlg.find('#push_to_chat_based_on'),
        regex: $dlg.find('#table_to_chat_regex'),
        replace: $dlg.find('#table_to_chat_replace'),
        tableToChatButton: $dlg.find('#table_to_chat_button'),
        tableStyleButton: $dlg.find('#table_style_button'),
        tablePreviewButton: $dlg.find('#table_style_preview_button'),
        presetStyle: $dlg.find('#preset_style'),
        matchMethod: $dlg.find('#match_method'),
        addStyleButton: $dlg.find('#table-push-to-chat-style-add'),
        editStyleButton: $dlg.find('#table-push-to-chat-style-edit'),
        importStyleButton: $dlg.find('#table-push-to-chat-style-import'),
        exportStyleButton: $dlg.find('#table-push-to-chat-style-export'),
        deleteStyleButton: $dlg.find('#table-push-to-chat-style-delete'),
        debugStyleButton: $dlg.find('#table-push-to-chat-style-debug'),
        previewStyleButton: $dlg.find('#table-push-to-chat-style-preview'),
        copyTextButton: $dlg.find('#table-push-to-chat-style-export').last(),
        table_renderer_display_container: $dlg.find('#table_renderer_display_container'),
        match_method_regex_container: $dlg.find('#match_method_regex_container'),
        push_to_chat_style_edit_guide_content: $dlg.find('#push_to_chat_style_edit_guide_content'),
    };
}

function updateGuideContent(elements, isRegex) {
    elements.match_method_regex_container[isRegex ? 'show' : 'hide']();
    elements.push_to_chat_style_edit_guide_content.empty()
    elements.push_to_chat_style_edit_guide_content.html(isRegex
        ? `支持标准的正则表达式语法。`
        : `当样式内容为空时默认显示原始表格。支持HTML、CSS定义结构样式，并使用<code>\\$\\w\\s+</code>的方式定位单元格。<br>例如<code>$A0</code>代表第1列第1行(表头)，<code>$A1</code>代表第1列第2行(表内容第一行)。`
    );
}

/**
 * 更新表格样式并绑定事件
 * @param {object} elements UI元素集合
 * @param {object} sheet 表格对象
 * @returns {object} 更新后的表格对象
 */
async function updateSheetStyle(elements, sheet) {
    if (!sheet) {
        console.warn("updateSheetStyle: 未能获取到有效的 table 对象。");
        return;
    }

    // 初始化样式预览表格
    sheet.element = `<div class="justifyLeft scrollable">${sheet.renderSheet((cell) => {
        cell.element.style.cursor = 'default';
    }).outerHTML}</div>`;

    const renderHTML = () => {
        elements.rendererDisplay.html(parseSheetRender(elements.replace.val(), sheet));
    };

    // 初始化编辑器内容并绑定事件
    renderHTML();

    // 解除并重新绑定事件
    elements.regex.off('input').on('input', renderHTML);
    elements.replace.off('input').on('input', renderHTML);

    // 表格预览按钮事件
    elements.tablePreviewButton.off('change').on('change', function() {
        elements.table_renderer_display_container[this.checked ? 'show' : 'hide']();
    });

    // 匹配方法变更事件
    elements.matchMethod.off('change').on('change', function() {
        updateGuideContent(elements, $(this).val() === 'regex')
    });

    // 默认隐藏预览容器
    elements.table_renderer_display_container.hide();

    return sheet;
}

/**
 * 初始化UI组件的值
 * @param {object} elements UI元素集合
 * @param {object} config 配置对象
 */
async function initUIWithConfig(elements, config) {
    // 初始化复选框状态
    elements.tableToChatButton.prop('checked', config.toChat !== false);
    elements.tableStyleButton.prop('checked', config.useCustomStyle !== false);
    elements.tablePreviewButton.prop('checked', false);

    // 初始化预设样式下拉框
    const presetDropdown = elements.presetStyle;
    presetDropdown.empty();

    if (config.customStyles && Object.keys(config.customStyles).length > 0) {
        // 添加所有自定义样式到下拉框
        Object.keys(config.customStyles).forEach((styleName) => {
            presetDropdown.append(new Option(styleName, styleName));
        });

        console.log("选中的样式", config.customStyles, config.selectedCustomStyleKey, config.customStyles[config.selectedCustomStyleKey]);

        // 设置选中的样式
        if (config.selectedCustomStyleKey && config.customStyles[config.selectedCustomStyleKey]) {
            presetDropdown.val(config.selectedCustomStyleKey);
        } else {
            // 如果没有有效的selectedCustomStyleKey，则选择第一个样式
            const firstStyleKey = presetDropdown.find('option:first').val();
            presetDropdown.val(firstStyleKey);
            config.selectedCustomStyleKey = firstStyleKey; // 更新配置中的selectedCustomStyleKey
        }
    } else {
        presetDropdown.append(new Option('默认', 'default'));
    }

    // 获取当前选中的样式并初始化表单
    const currentStyle = getCurrentSelectedStyle(config);
    elements.matchMethod.val(currentStyle.mode || 'regex');
    elements.benchmark.val(currentStyle.basedOn || 'html');
    elements.regex.val(currentStyle.regex || '.*');
    elements.replace.val(currentStyle.replace || '');

    // 渲染预览
    renderPreview(elements);
    setTimeout(() => {
        updateGuideContent(elements, currentStyle.mode === 'regex');
    },0)
}

/**
 * 获取当前选中的样式
 * @param {object} config 配置对象
 * @returns {object} 当前选中的样式
 */
function getCurrentSelectedStyle(config) {
    if (!config.customStyles || Object.keys(config.customStyles).length === 0) {
        return {mode: 'regex', basedOn: 'html', regex: '.*', replace: ''};
    }

    const selectedKey = config.selectedCustomStyleKey;
    return config.customStyles[selectedKey] ||
           config.customStyles[Object.keys(config.customStyles)[0]] ||
           {mode: 'regex', basedOn: 'html', regex: '.*', replace: ''};
}

/**
 * 从UI收集配置
 * @param {object} elements UI元素集合
 * @param {object} config 原始配置对象，用于保留其他样式
 * @returns {object} 收集的配置对象
 */
function collectConfigFromUI(elements, config) {
    const selectedKey = elements.presetStyle.val();
    const styleName = elements.presetStyle.find('option:selected').text();

    // 创建自定义样式对象的副本，以便进行修改
    const customStyles = {...(config.customStyles || {})};

    // 创建当前样式对象
    const currentStyle = {
        mode: elements.matchMethod.val(),
        basedOn: elements.benchmark.val(),
        regex: elements.regex.val(),
        replace: elements.replace.val()
    };

    // 查找并更新当前样式，如果不存在则添加
    if (selectedKey !== 'default') {
        customStyles[styleName] = currentStyle;
    }

    // 创建配置对象，包含更新后的自定义样式对象
    return {
        toChat: elements.tableToChatButton.prop('checked'),
        useCustomStyle: elements.tableStyleButton.prop('checked'),
        selectedCustomStyleKey: styleName,
        customStyles: customStyles
    };
}

/**
 * 渲染预览
 * @param {object} elements UI元素集合
 */
function renderPreview(elements) {
    try {
        const regex = elements.regex.val();
        const replace = elements.replace.val();

        if (regex && replace) {
            const htmlContent = elements.rendererDisplay.html();
            const regExp = new RegExp(regex, 'g');
            elements.rendererDisplay.html(htmlContent.replace(regExp, replace));
        }
    } catch (e) {
        console.error("Preview rendering error:", e);
    }
}

/**
 * 绑定事件处理程序
 * @param {object} elements UI元素集合
 * @param {object} sheet 表格对象
 * @param {object} config 配置对象
 */
function bindEvents(elements, sheet, config) {
    // 预设样式下拉框变更事件
    elements.presetStyle.on('change', function() {
        const selectedKey = $(this).val();
        const selectedStyle = config.customStyles[selectedKey];

        if (selectedStyle) {
            elements.matchMethod.val(selectedStyle.mode || 'regex');
            elements.benchmark.val(selectedStyle.basedOn || 'html');
            elements.regex.val(selectedStyle.regex || '.*');
            elements.replace.val(selectedStyle.replace || '');
            renderPreview(elements);
            setTimeout(() => {
                updateGuideContent(elements, elements.matchMethod.val() === 'regex');
            },0)
        }
    });

    // 添加样式按钮
    elements.addStyleButton.on('click', async function() {
        const styleName = await EDITOR.callGenericPopup("输入新样式名称：", EDITOR.POPUP_TYPE.INPUT);
        if (styleName) {
            const newStyle = {
                mode: elements.matchMethod.val(),
                basedOn: elements.benchmark.val(),
                regex: elements.regex.val(),
                replace: elements.replace.val()
            };

            // 添加新样式到customStyles对象
            config.customStyles[styleName] = newStyle;
            elements.presetStyle.append(new Option(styleName, styleName));
            elements.presetStyle.val(styleName).trigger('change');
        }
    });

    // 编辑样式名称按钮
    elements.editStyleButton.on('click', async function() {
        const selectedKey = elements.presetStyle.val();
        if (selectedKey !== 'default' && config.customStyles[selectedKey]) {
            const currentName = selectedKey;
            const newName = await EDITOR.callGenericPopup("修改样式名称：", EDITOR.POPUP_TYPE.INPUT, currentName);

            if (newName && newName !== currentName) {
                // 创建一个新的键值对，并删除旧的
                const styleData = config.customStyles[currentName];
                config.customStyles[newName] = styleData;
                delete config.customStyles[currentName];

                // 更新下拉菜单
                const option = elements.presetStyle.find(`option[value="${currentName}"]`);
                option.text(newName);
                option.val(newName);
                elements.presetStyle.val(newName);
            }
        }
    });

    // 删除样式按钮
    elements.deleteStyleButton.on('click', async function() {
        const selectedKey = elements.presetStyle.val();
        if (selectedKey === 'default') {
            return EDITOR.error('不能删除默认样式');
        }

        const confirmation = await EDITOR.callGenericPopup("确定要删除此样式吗？", EDITOR.POPUP_TYPE.CONFIRM);
        if (confirmation) {
            delete config.customStyles[selectedKey];
            elements.presetStyle.find(`option[value="${selectedKey}"]`).remove();
            elements.presetStyle.val(elements.presetStyle.find('option:first').val()).trigger('change');
        }
    });

    // 导入样式按钮
    elements.importStyleButton.on('click', async function() {
        const importData = await EDITOR.callGenericPopup("粘贴样式配置JSON：", EDITOR.POPUP_TYPE.INPUT, '', {rows: 10});
        if (importData) {
            try {
                const styleData = JSON.parse(importData);
                const styleName = styleData.name || "导入样式";

                // 移除name属性，因为现在name就是key
                delete styleData.name;
                delete styleData.uid;

                config.customStyles[styleName] = styleData;
                elements.presetStyle.append(new Option(styleName, styleName));
                elements.presetStyle.val(styleName).trigger('change');
                EDITOR.success('导入样式成功');
            } catch (e) {
                EDITOR.error('导入样式失败，JSON格式错误');
            }
        }
    });

    // 导出样式按钮
    elements.exportStyleButton.on('click', function() {
        const selectedKey = elements.presetStyle.val();

        if (selectedKey !== 'default' && config.customStyles[selectedKey]) {
            // 创建一个副本，并添加name属性用于导出
            const exportData = {...config.customStyles[selectedKey], name: selectedKey};

            navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
                .then(() => EDITOR.success('样式已复制到剪贴板'));
        }
    });

    // 一行实现简单按钮功能
    elements.previewStyleButton.on('click', () => renderPreview(elements));
    elements.copyTextButton.on('click', () =>
        navigator.clipboard.writeText(elements.rendererDisplay.html())
            .then(() => EDITOR.success('HTML内容已复制到剪贴板')));
}

/**
 * 打开表格样式渲染器弹窗
 * @param {object} originSheet 原始表格对象
 * @returns {Promise<object>} 处理结果
 */
export async function openSheetStyleRendererPopup(originSheet) {
    // 初始化表格样式编辑弹窗
    const manager = await SYSTEM.getTemplate('customSheetStyle');
    const tableRendererPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.CONFIRM, '', {large: true, wide: true, allowVerticalScrolling: true, okButton: "保存修改", cancelButton: "取消"});
    const $dlg = $(tableRendererPopup.dlg);

    // 初始化UI元素、配置和表格
    const elements = await initBindings($dlg);
    const sheet = new BASE.SheetTemplate(originSheet);
    const configCopy = JSON.parse(JSON.stringify(originSheet.config || {}));

    // 初始化UI和绑定事件
    await initUIWithConfig(elements, configCopy);
    await updateSheetStyle(elements, sheet);
    bindEvents(elements, sheet, configCopy);

    // 显示表格样式编辑弹窗
    await tableRendererPopup.show();

    // 处理确认保存
    if (tableRendererPopup.result) {
        const finalConfig = collectConfigFromUI(elements, configCopy);

        // 更新全部配置属性
        sheet.config.customStyles = finalConfig.customStyles;
        sheet.config.selectedCustomStyleKey = finalConfig.selectedCustomStyleKey;
        sheet.config.toChat = finalConfig.toChat;
        sheet.config.useCustomStyle = finalConfig.useCustomStyle;
        sheet.save()

        console.log("用户确认保存修改", finalConfig);
        EDITOR.success('表格样式已更新');
    }

    return sheet;
}
