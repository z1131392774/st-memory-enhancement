import {DERIVED, EDITOR, SYSTEM, USER} from "../../manager.js";
import {getChatSheetsView} from "../editor/chatSheetsDataView.js";
import {getEditView} from "../editor/tableTemplateEditView.js";

let tableDrawer = null;
let tableDrawerIcon = null;
let tableDrawerContent = null;
let appHeaderTableContainer = null;
let databaseButton = null;
let editorButton = null;
let settingButton = null;
let inlineDrawerHeaderContent = null;
let tableDrawerContentHeader = null;

let tableViewDom = null;
let tableEditDom = null;
let settingContainer = null;
const timeOut = 200;
const easing = 'easeInOutCubic';

let isEventListenersBound = false;
let currentActiveButton = null; // Track currently active button

/**
 * 更新按钮选中状态
 * @param {jQuery} selectedButton 当前选中的按钮
 */
function updateButtonStates(selectedButton) {
    // 如果点击的是当前已激活的按钮，则不执行任何操作
    if (currentActiveButton && currentActiveButton.is(selectedButton)) {
        return false;
    }

    // 重置所有按钮状态
    databaseButton.css('opacity', '0.5');
    editorButton.css('opacity', '0.5');
    settingButton.css('opacity', '0.5');

    // 设置选中按钮状态
    selectedButton.css('opacity', '1');
    currentActiveButton = selectedButton;
    return true;
}

/**
 * 初始化应用头部表格抽屉 (只调用一次)
 */
export async function initAppHeaderTableDrawer() {
    if (isEventListenersBound) {
        return;
    }

    tableDrawer = $('#table_database_settings_drawer');
    tableDrawerIcon = $('#table_drawer_icon');
    tableDrawerContent = $('#table_drawer_content');
    appHeaderTableContainer = $('#app_header_table_container');
    databaseButton = $('#database_button');
    editorButton = $('#editor_button');
    settingButton = $('#setting_button');
    inlineDrawerHeaderContent = $('#inline_drawer_header_content');
    tableDrawerContentHeader = $('#table_drawer_content_header');

    // 替换logo_block中存在class为fa-panorama的子项，替换fa-panorama为fa-table
    $('.fa-panorama').removeClass('fa-panorama').addClass('fa-image');
    $('.fa-user-cog').removeClass('fa-user-cog').addClass('fa-user');

    // 获取表格视图、编辑视图和设置容器的内容
    if (tableViewDom === null) {
        tableViewDom = await getChatSheetsView(-1);
    }
    if (tableEditDom === null) {
        tableEditDom = $(`<div style=""></div>`);
        tableEditDom.append(await getEditView(-1));
    }
    if (settingContainer === null) {
        const header = $(`<div></div>`).append($(`<div style="margin: 10px 0;"></div>`).append(inlineDrawerHeaderContent));
        settingContainer = header.append($('.memory_enhancement_container').find('#memory_enhancement_settings_inline_drawer_content'));
    }

    // 创建容器 div 并将内容包裹起来
    const databaseContentDiv = $(`<div id="database-content" style="width: 100%; height: 100%; overflow: hidden;"></div>`).append(tableViewDom);
    const editorContentDiv = $(`<div id="editor-content" style="width: 100%; height: 100%; display: none; overflow: hidden;"></div>`).append(tableEditDom);
    const settingContentDiv = $(`<div id="setting-content" style="width: 100%; height: 100%; display: none; overflow: hidden;"></div>`).append(settingContainer);

    // 将所有内容容器添加到 appHeaderTableContainer 中
    appHeaderTableContainer.append(databaseContentDiv);
    appHeaderTableContainer.append(editorContentDiv);
    appHeaderTableContainer.append(settingContentDiv);

    // 初始时显示数据库内容，隐藏编辑器和设置内容
    $('#database-content').show();
    $('#editor-content').hide();
    $('#setting-content').hide();

    // 初始化按钮状态
    updateButtonStates(databaseButton);

    $('#tableUpdateTag').click(function() {
        $('#extensions_details').trigger('click');
    });

    // 添加按钮点击事件监听器
    databaseButton.on('click', function() {
        // 如果当前已经是数据库视图，则不执行任何操作
        if (!updateButtonStates(databaseButton)) return;
        loadDatabaseContent();
    });

    editorButton.on('click', function() {
        // 如果当前已经是编辑器视图，则不执行任何操作
        if (!updateButtonStates(editorButton)) return;
        loadEditorContent();
    });

    settingButton.on('click', function() {
        // 如果当前已经是设置视图，则不执行任何操作
        if (!updateButtonStates(settingButton)) return;
        loadSettingContent();
    });

    isEventListenersBound = true;

    // 移除旧版本在插件页面中的memory_enhancement_container元素
    $('.memory_enhancement_container').remove();
}

export async function openAppHeaderTableDrawer() {
    if (!isEventListenersBound) {
        await initAppHeaderTableDrawer();
    }

    if (tableDrawerIcon.hasClass('closedIcon')) {
        // 当前是关闭状态，需要打开抽屉，关闭其他已打开的抽屉
        $('.openDrawer').not('#table_drawer_content').not('.pinnedOpen').addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
        $('.openIcon').not('#table_drawer_icon').not('.drawerPinnedOpen').toggleClass('closedIcon openIcon');
        $('.openDrawer').not('#table_drawer_content').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');

        // 打开当前的抽屉
        tableDrawerIcon.toggleClass('closedIcon openIcon');
        tableDrawerContent.toggleClass('closedDrawer openDrawer');

        tableDrawerContent.addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
    } else {
        // 当前是打开状态，需要关闭抽屉
        tableDrawerIcon.toggleClass('openIcon closedIcon');
        tableDrawerContent.toggleClass('openDrawer closedDrawer');

        tableDrawerContent.addClass('resizing').each((_, el) => {
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing');
                },
            });
        });
    }
}

async function loadDatabaseContent() {
    const currentContent = appHeaderTableContainer.children(':visible');
    const targetContent = $('#database-content');

    if (currentContent.length > 0) {
        currentContent.slideUp(timeOut, easing).delay(timeOut).hide(0);
        targetContent.slideDown(timeOut, easing);
    } else {
        targetContent.slideDown(timeOut, easing);
    }
}

async function loadEditorContent() {
    const currentContent = appHeaderTableContainer.children(':visible');
    const targetContent = $('#editor-content');

    if (currentContent.length > 0) {
        currentContent.slideUp(timeOut, easing).delay(timeOut).hide(0);
        targetContent.slideDown(timeOut, easing);
    } else {
        targetContent.slideDown(timeOut, easing);
    }
}

async function loadSettingContent() {
    const currentContent = appHeaderTableContainer.children(':visible');
    const targetContent = $('#setting-content');

    if (currentContent.length > 0) {
        currentContent.slideUp(timeOut, easing).delay(timeOut).hide(0);
        targetContent.slideDown(timeOut, easing);
    } else {
        targetContent.slideDown(timeOut, easing);
    }
}
