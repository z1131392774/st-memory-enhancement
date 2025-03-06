import {DERIVED, EDITOR, SYSTEM, USER} from "../manager.js";
import {getTableView} from "./tableDataView.js";
import {getEditView} from "./tableEditView.js";

let tableDrawer = null;
let tableDrawerIcon = null;
let tableDrawerContent = null;
let appHeaderTableContainer = null;
let databaseButton = null;
let editorButton = null;
let settingButton = null;

let isEventListenersBound = false; // 添加一个标志来跟踪事件监听器是否已绑定

/**
 * 初始化应用头部表格抽屉 (只调用一次)
 */
async function initAppHeaderTableDrawer() {
    if (isEventListenersBound) {
        return; // 如果事件监听器已绑定，则直接返回，避免重复绑定
    }

    tableDrawer = $('#table_database_settings_drawer');
    tableDrawerIcon = $('#table_drawer_icon');
    tableDrawerContent = $('#table_drawer_content');
    appHeaderTableContainer = $('#app_header_table_container');
    databaseButton = $('#database_button');
    editorButton = $('#editor_button');
    settingButton = $('#setting_button');

    // 添加按钮点击事件监听器 (只绑定一次)
    databaseButton.on('click', function() {
        loadDatabaseContent();
    });

    editorButton.on('click', function() {
        loadEditorContent();
    });

    settingButton.on('click', function() {
        loadSettingContent();
    });

    isEventListenersBound = true; // 设置标志为已绑定
}


export async function openAppHeaderTableDrawer() {
    // 确保初始化函数已经被调用过 (虽然通常应该在应用启动时就调用)
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

        tableDrawerContent.addClass('resizing').each((_, el) => { // 添加 resizing 类，防止动画冲突
            EDITOR.slideToggle(el, {
                ...EDITOR.getSlideToggleOptions(),
                onAnimationEnd: function (el) {
                    el.closest('.drawer-content').classList.remove('resizing'); // 动画结束后移除 resizing 类
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

let tableViewDom = null;
let tableEditDom = null;
let settingContainer = null;
// 定义加载不同内容的函数
async function loadDatabaseContent() {
    // 淡出当前内容
    appHeaderTableContainer.fadeOut('fast', async function() { // 'fast' 是一个预设的动画速度，你也可以使用毫秒值，例如 200
        appHeaderTableContainer.empty(); // 清空之前的内容
        if (tableViewDom === null) {
            tableViewDom = await getTableView(-1);
        }
        appHeaderTableContainer.append(tableViewDom);
        // 淡入新内容
        appHeaderTableContainer.fadeIn('fast');
    });
}

async function loadEditorContent() {
    // 淡出当前内容
    appHeaderTableContainer.fadeOut('fast', async function() {
        appHeaderTableContainer.empty();
        if (tableEditDom === null) {
            // 使用 jQuery 将 HTML 字符串转换为 jQuery 对象 (代表 DOM 元素)
            tableEditDom = $(`<div style="height: 100%; overflow: auto; outline: 3px solid #41b681; border-radius: 3px"></div>`);
            tableEditDom.append(await getEditView(-1));
        }
        appHeaderTableContainer.append(tableEditDom);
        // 淡入新内容
        appHeaderTableContainer.fadeIn('fast');
    });
}

async function loadSettingContent() {
    // 淡出当前内容
    appHeaderTableContainer.fadeOut('fast', async function() {
        appHeaderTableContainer.empty();
        if (settingContainer === null) {
            settingContainer = $('.memory_enhancement_container').find('#memory_enhancement_settings_inline_drawer_content');
        }
        appHeaderTableContainer.append(settingContainer);
        // 淡入新内容
        appHeaderTableContainer.fadeIn('fast');
    });
}
