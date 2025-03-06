// standaloneAPI.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';

/**
 * 加密
 * @param {*} rawKey - 原始密钥
 * @param {*} deviceId - 设备ID
 * @returns {string} 加密后的字符串
 */
export function encryptXor(rawKey, deviceId) {
    return Array.from(rawKey).map((c, i) =>
        c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)
    ).map(c => c.toString(16).padStart(2, '0')).join('');
}


/**
 * 解密
 * @param {string} encrypted - 加密的字符串
 * @param {string} deviceId - 设备ID
 * @returns {string|null} 解密后的字符串
 */
async function decryptXor(encrypted, deviceId) {
    try {
        const bytes = encrypted.match(/.{1,2}/g).map(b =>
            parseInt(b, 16)
        );
        return String.fromCharCode(...bytes.map((b, i) =>
            b ^ deviceId.charCodeAt(i % deviceId.length)
        ));
    } catch(e) {
        console.error('解密失败:', e);
        return null;
    }
}

/**
 * API KEY解密
 * @returns {Promise<string|null>} 解密后的API密钥
 */
async function getDecryptedApiKey() {
    try {
        const encrypted = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_key;
        const deviceId = localStorage.getItem('st_device_id');
        if (!encrypted || !deviceId) return null;

        return await decryptXor(encrypted, deviceId);
    } catch (error) {
        console.error('API Key 解密失败:', error);
        return null;
    }
}

/**主API调用
 * @param {string} systemPrompt - 系统提示
 * @param {string} userPrompt - 用户提示
 * @returns {Promise<string>} 生成的响应内容
 */
export async function handleMainAPIRequest(systemPrompt, userPrompt) {
    const response = await EDITOR.generateRaw(
        userPrompt,
        '',
        false,
        false,
        systemPrompt,
    );
    return response;
}

/**自定义API调用
 * @param {string} systemPrompt - 系统提示
 * @param {string} userPrompt - 用户提示
 * @returns {Promise<string>} 生成的响应内容
 */
export async function handleCustomAPIRequest(systemPrompt, userPrompt) {
    const USER_API_URL = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
    const USER_API_KEY = await getDecryptedApiKey(); // 调用传入的 getDecryptedApiKey 函数
    const USER_API_MODEL = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;

    if (!USER_API_URL || !USER_API_MODEL) {// 移除!USER_API_KEY检测，兼容本地模型和部分渠道
        EDITOR.error('请填写完整的自定义API配置');
        return;
    }

    // 公共请求配置
    const requestConfig = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${USER_API_KEY}`
        },
        body: JSON.stringify({
            model: USER_API_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: USER.tableBaseConfig.custom_temperature
        })
    };

    // 通用请求函数
    const makeRequest = async (url) => {
        const response = await fetch(url, requestConfig);
        if (!response.ok) {
            const errorBody = await response.text();
            throw { status: response.status, message: errorBody };
        }
        return response.json();
    };

    let firstError;
    try {
        // 第一次尝试补全/chat/completions
        const modifiedUrl = new URL(USER_API_URL);
        modifiedUrl.pathname = modifiedUrl.pathname.replace(/\/$/, '') + '/chat/completions';
        const result = await makeRequest(modifiedUrl.href);
        return result.choices[0].message.content;
    } catch (error) {
        firstError = error;
    }

    try {
        // 第二次尝试原始URL
        const result = await makeRequest(USER_API_URL);
        return result.choices[0].message.content;
    } catch (secondError) {
        const combinedError = new Error('API请求失败');
        combinedError.details = {
            firstAttempt: firstError?.message || '第一次请求无错误信息',
            secondAttempt: secondError.message
        };
        throw combinedError;
    }
}

/**请求模型列表
 * @returns {Promise<void>}
 */
export async function updateModelList(){
    const apiUrl = $('#custom_api_url').val().trim();
    const apiKey = await getDecryptedApiKey();// 使用传入的 getDecryptedApiKey 函数

    if (!apiKey) {
        EDITOR.error('API key解密失败，请重新输入API key吧！');
        return;
    }
    if (!apiUrl) {
        EDITOR.error('请输入API URL');
        return;
    }

    try {
        // 规范化URL路径
        const normalizedUrl = new URL(apiUrl);
        normalizedUrl.pathname = normalizedUrl.pathname.replace(/\/$/, '')+'/models';

        const response = await fetch(normalizedUrl, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`请求失败: ${response.status}`);

        const data = await response.json();
        const $selector = $('#model_selector').empty();

        data.data.forEach(model => {
            $selector.append($('<option>', {
                value: model.id,
                text: model.id
            }));
        });

        EDITOR.success('成功获取模型列表');
    } catch (error) {
        console.error('模型获取失败:', error);
        EDITOR.error(`模型获取失败: ${error.message}`);
    }
}
/**
 * 估算 Token 数量
 * @param {string} text - 要估算 token 数量的文本
 * @returns {number} 估算的 token 数量
 */
export function estimateTokenCount(text) {
    // 统计中文字符数量
    let chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;

    // 统计英文单词数量
    let englishWords = text.match(/\b\w+\b/g) || [];
    let englishCount = englishWords.length;

    // 估算 token 数量
    let estimatedTokenCount = chineseCount + Math.floor(englishCount * 1.2);
    return estimatedTokenCount;
}
