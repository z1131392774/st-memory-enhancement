import {DERIVED, EDITOR, SYSTEM, USER} from "../manager.js";

let tableDrawer = null;
let tableDrawerIcon = null;
let tableDrawerContent = null;
let appHeaderTableContainer = null;
let databaseButton = null;
let editorButton = null;
let settingButton = null;

export async function openAppHeaderTableDrawer() {
    tableDrawer = $('#table_database_settings_drawer');
    tableDrawerIcon = $('#table_drawer_icon');
    tableDrawerContent = $('#table_drawer_content');
    appHeaderTableContainer = $('#app_header_table_container');
    databaseButton = $('#database_button');
    editorButton = $('#editor_button');
    settingButton = $('#setting_button');

    // 添加按钮点击事件监听器 (确保在元素被获取后添加)
    databaseButton.on('click', function() {
        loadDatabaseContent();
    });

    editorButton.on('click', function() {
        loadEditorContent();
    });

    settingButton.on('click', function() {
        loadSettingContent();
    });


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

// 定义加载不同内容的函数
function loadDatabaseContent() {
    appHeaderTableContainer.empty();
    appHeaderTableContainer.text("Database");
}

function loadEditorContent() {
    appHeaderTableContainer.empty();
    appHeaderTableContainer.text("Editor");
}

function loadSettingContent() {
    appHeaderTableContainer.empty();
    appHeaderTableContainer.text("Setting");
}
