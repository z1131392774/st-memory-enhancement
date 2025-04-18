import {APP} from "../../manager.js";

/**
 * 异步获取翻译文件
 * @param {string} locale - 语言标识符 (e.g., 'en', 'zh-cn')
 * @returns {Promise<Object>} - 翻译对象
 */
async function fetchTranslations(locale) {
    try {
        const response = await fetch(`/scripts/extensions/third-party/st-memory-enhancement/assets/locales/${locale}.json`);
        if (!response.ok) {
            console.warn(`Could not load translations for ${locale}, falling back to en`);
            // Fallback to English if requested locale is not available
            if (locale !== 'en') {
                return await fetchTranslations('en');
            }
            // If English also fails, return empty object
            return {};
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading translations:', error);
        return {};
    }
}

/**
 * 将翻译应用到 DOM 元素
 * @param {Object} translations - 翻译对象
 */
function applyTranslations(translations) {
    console.log("Applying translations", translations);
    // 遍历所有具有 data-i18n 属性的元素
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[key]) {
            // 如果元素有 title 属性，则翻译 title 属性
            if (element.hasAttribute('title')) {
                element.setAttribute('title', translations[key]);
            } else {
                // 否则翻译元素的文本内容
                element.textContent = translations[key];
            }
        }
    });

    // 对文本需要翻译但没有 data-i18n 属性的元素进行翻译
    // 使用特定的 CSS 选择器或 ID 来定位这些元素
    if (translations["Memory Enhancement (Tables)"]) {
        const headerElement = document.querySelector('#inline_drawer_header_content b');
        if (headerElement) headerElement.textContent = translations["Memory Enhancement (Tables)"];
    }

    if (translations["Click to update"]) {
        const updateElement = document.querySelector('#tableUpdateTag');
        if (updateElement) updateElement.textContent = translations["Click to update"];
    }

    if (translations["Project link"]) {
        const projectLinkElement = document.querySelector('.fa-github.fa-lg').nextElementSibling;
        if (projectLinkElement) projectLinkElement.textContent = translations["Project link"];
    }

    if (translations["Read tutorial"]) {
        const tutorialLinkElement = document.querySelector('.fa-book').nextElementSibling;
        if (tutorialLinkElement) tutorialLinkElement.textContent = translations["Read tutorial"];
    }

    if (translations["Logs"]) {
        const logsElement = document.querySelector('#table_debug_log_button a');
        if (logsElement) logsElement.textContent = translations["Logs"];
    }

    // 通过 CSS 选择器翻译其他元素
    translateElementsBySelector(translations, '#table_clear_up a', "Reorganize tables now");
    translateElementsBySelector(translations, '#dataTable_to_chat_button a', "Edit style of tables rendered in conversation");
}

/**
 * 使用 CSS 选择器翻译元素
 * @param {Object} translations - 翻译对象
 * @param {string} selector - CSS 选择器
 * @param {string} key - 翻译键
 */
function translateElementsBySelector(translations, selector, key) {
    if (translations[key]) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            element.textContent = translations[key];
        });
    }
}

/**
 * 应用翻译和本地化的主函数
 */
export async function executeTranslation() {
    const lang = APP.getCurrentLocale();
    console.log("Current language", lang);

    // Fetch translations for the current locale
    const translations = await fetchTranslations(lang);
    if (Object.keys(translations).length === 0) {
        console.warn("No translations found for locale:", lang);
        return;
    }

    // Apply translations to the DOM
    applyTranslations(translations);

    console.log("Translation completed for locale:", lang);
}
