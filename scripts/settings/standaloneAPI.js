// standaloneAPI.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import {PopupConfirm} from "../../components/popupConfirm.js";
import { oai_settings, prepareOpenAIMessages, sendOpenAIRequest } from '/scripts/openai.js';

let loadingToast = null;
let currentApiKeyIndex = 0;// 用于记录当前使用的API Key的索引


/**
 * 统一处理和规范化API响应数据。
 * - 自动解析JSON字符串。
 * - 自动处理嵌套的 'data' 对象。
 * @param {*} responseData - 从API收到的原始响应数据
 * @returns {object} 规范化后的数据对象
 */
function normalizeApiResponse(responseData) {
    let data = responseData;
    // 1. 如果响应是字符串，尝试解析为JSON
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            console.error("API响应JSON解析失败:", e);
            // 返回一个错误结构，以便下游可以一致地处理
            return { error: { message: 'Invalid JSON response' } };
        }
    }
    // 2. 检查并解开嵌套的 'data' 属性
    // 这种情况经常出现在一些代理服务中，例如 { "data": { "data": [...] } }
    if (data && typeof data.data === 'object' && data.data !== null && !Array.isArray(data.data)) {
        if (Object.hasOwn(data.data, 'data')) {
            data = data.data;
        }
    }
    return data;
}


/**
 * 加密
 * @param {*} rawKey - 原始密钥
 * @param {*} deviceId - 设备ID
 * @returns {string} 加密后的字符串
 */
export function encryptXor(rawKey, deviceId) {
    // 处理多个逗号分隔的API Key
    const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.trim().length > 0);
    const uniqueKeys = [...new Set(keys)];
    const uniqueKeyString = uniqueKeys.join(',');

    // 如果有重复Key，返回去重数量和加密后的Key
    if (keys.length !== uniqueKeys.length) {
        return {
            encrypted: Array.from(uniqueKeyString).map((c, i) =>
                c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)
            ).map(c => c.toString(16).padStart(2, '0')).join(''),
            duplicatesRemoved: keys.length - uniqueKeys.length
        };
    }

    // 没有重复Key时直接返回加密结果
    return Array.from(uniqueKeyString).map((c, i) =>
        c.charCodeAt(0) ^ deviceId.charCodeAt(i % deviceId.length)
    ).map(c => c.toString(16).padStart(2, '0')).join('');
}

export function processApiKey(rawKey, deviceId) {
    try {
        const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.trim().length > 0);
        const invalidKeysCount = rawKey.split(',').length - keys.length; // 计算无效Key的数量
        const encryptedResult = encryptXor(rawKey, deviceId);
        const totalKeys = rawKey.split(',').length;
        const remainingKeys = totalKeys - (encryptedResult.duplicatesRemoved || 0); // 剩余去掉无效和重复之后Key的数量

        let message = `已更新API Key，共${remainingKeys}个Key`;
        if(totalKeys - remainingKeys > 0 || invalidKeysCount > 0){
            const removedParts = [];
            if (totalKeys - remainingKeys > 0) removedParts.push(`${totalKeys - remainingKeys}个重复Key`);
            if (invalidKeysCount > 0) removedParts.push(`${invalidKeysCount}个空值`);
            message += `（已去除${removedParts.join('，')}）`;
        }
        return {
            encryptedResult,
            encrypted: encryptedResult.encrypted,
            duplicatesRemoved: encryptedResult.duplicatesRemoved,
            invalidKeysCount: invalidKeysCount,
            remainingKeys: remainingKeys,
            totalKeys: totalKeys,
            message: message,
        }
    } catch (error) {
        console.error('API Key 处理失败:', error);
        throw error;
    }
}


/**
 * API KEY解密
 * @returns {Promise<string|null>} 解密后的API密钥
 */
export async function getDecryptedApiKey() { // Export this function
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

/**
 * 解密
 * @param {string} encrypted - 加密字符串
 * @param {string} deviceId - 设备ID
 * @returns {string|null} 解密后的字符串，如果解密失败则返回null
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

async function createLoadingToast(isUseMainAPI = true, isSilent = false) {
    if (isSilent) {
        // 在静默模式下，不显示弹窗，直接模拟“后台继续”
        // 返回 false，因为 PopupConfirm 中“后台继续”按钮（cancelBtn）返回 false
        return Promise.resolve(false);
    }
    loadingToast?.close()
    loadingToast = new PopupConfirm();
    return await loadingToast.show(
        isUseMainAPI
            ? '正在使用【主API】重新生成完整表格...'
            : '正在使用【自定义API】重新生成完整表格...',
        '后台继续',
        '中止执行',
    )
}

/**主API调用
 * @param {string|Array<object>} systemPrompt - 系统提示或消息数组
 * @param {string} [userPrompt] - 用户提示 (如果第一个参数是消息数组，则此参数被忽略)
 * @param {boolean} [isSilent=false] - 是否以静默模式运行，不显示加载提示
 * @returns {Promise<string>} 生成的响应内容
 */
export async function handleMainAPIRequest(systemPrompt, userPrompt, isSilent = false) {
    let finalSystemPrompt = '';
    let finalUserPrompt = '';
    let suspended = false; // Define suspended outside the blocks

    if (Array.isArray(systemPrompt)) {
        // --- Start: Processing for array input ---
        const messages = systemPrompt; // messages is defined here now

        // Loading toast logic
        createLoadingToast(true, isSilent).then((r) => {
            if (loadingToast) loadingToast.close();
            suspended = r; // Assign to the outer suspended variable
        });

        let startTime = Date.now();
        if (loadingToast) {
            loadingToast.frameUpdate(() => {
                if (loadingToast) {
                    loadingToast.text = `正在使用【主API】(多消息)重新生成完整表格: ${((Date.now() - startTime) / 1000).toFixed(1)}秒`;
                }
            });
        }

        console.log('主API请求的多消息数组:', messages); // Log the actual array
        // Use TavernHelper.generateRaw with the array, enabling streaming
        const response = await TavernHelper.generateRaw({
            ordered_prompts: messages, // Pass the array directly
            should_stream: true,      // Re-enable streaming
        });
        loadingToast.close();
        return suspended ? 'suspended' : response;
        // --- End: Processing for array input ---

    } else { // Correctly placed ELSE block
        // --- Start: Original logic for non-array input ---
        finalSystemPrompt = systemPrompt;
        finalUserPrompt = userPrompt;

        createLoadingToast(true, isSilent).then((r) => {
            if (loadingToast) loadingToast.close();
            suspended = r; // Assign to the outer suspended variable
        });

        let startTime = Date.now();
        if (loadingToast) {
            loadingToast.frameUpdate(() => {
                if (loadingToast) {
                    loadingToast.text = `正在使用【主API】重新生成完整表格: ${((Date.now() - startTime) / 1000).toFixed(1)}秒`;
                }
            });
        }

        // Use EDITOR.generateRaw for non-array input
        const response = await EDITOR.generateRaw(
            finalUserPrompt,
            '',
            false,
            false,
            finalSystemPrompt,
        );
        loadingToast.close();
        return suspended ? 'suspended' : response;
        // --- End: Original logic ---
    }
} // Correct closing brace for the function

/**
 * 处理 API 测试请求，包括获取输入、解密密钥、调用测试函数和返回结果。
 * @param {string} apiUrl - API URL.
 * @param {string} encryptedApiKeys - 加密的 API 密钥字符串.
 * @param {string} modelName - 模型名称.
 * @returns {Promise<Array<{keyIndex: number, success: boolean, error?: string}>>} 测试结果数组.
 */
export async function handleApiTestRequest(apiUrl, encryptedApiKeys, modelName) {
    if (!apiUrl || !encryptedApiKeys) {
        EDITOR.error('请先填写 API URL 和 API Key。');
        return []; // 初始验证失败时返回空数组
    }

    const decryptedApiKeysString = await getDecryptedApiKey(); // Use imported function
    if (!decryptedApiKeysString) {
        EDITOR.error('API Key 解密失败或未设置！');
        return []; // 解密失败时返回空数组
    }

    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(k => k.length > 0);
    if (apiKeys.length === 0) {
        EDITOR.error('未找到有效的 API Key。');
        return []; // 如果找不到有效的密钥则返回空数组
    }
    const testAll = await EDITOR.callGenericPopup(`检测到 ${apiKeys.length} 个 API Key。\n注意：测试方式和酒馆自带的相同，将会发送一次消息（token数量很少），但如果使用的是按次计费的API请注意消费情况。`, EDITOR.POPUP_TYPE.CONFIRM, '', { okButton: "测试第一个key", cancelButton: "取消" });
    let keysToTest = [];
    if (testAll === null) return []; // 用户取消弹窗，返回空数组

    if (testAll) {
        keysToTest = [apiKeys[0]];
        EDITOR.info(`开始测试第 ${keysToTest.length} 个 API Key...`);
    } else {
        return []; // 用户点击取消，返回空数组
    }
    //！！~~~保留测试多个key的功能，暂时只测试第一个key~~~！！
    try {
        // 调用测试函数
        const results = await testApiConnection(apiUrl, keysToTest, modelName);

        // 处理结果并显示提示消息
        if (results && results.length > 0) {
            EDITOR.clear(); // 清除之前显示的'开始测试第x个API Key...'提示
            let successCount = 0;
            let failureCount = 0;
            results.forEach(result => {
                if (result.success) {
                    successCount++;
                } else {
                    failureCount++;
                    // 记录详细错误，如果可用则使用原始密钥索引
                    console.error(`Key ${result.keyIndex !== undefined ? result.keyIndex + 1 : '?'} 测试失败: ${result.error}`);
                }
            });

            if (failureCount > 0) {
                EDITOR.error(`${failureCount} 个 Key 测试失败。请检查控制台获取详细信息。`);
                EDITOR.error(`API端点: ${apiUrl}`);
                EDITOR.error(`错误详情: ${results.find(r => !r.success)?.error || '未知错误'}`);
            }
            if (successCount > 0) {
                EDITOR.success(`${successCount} 个 Key 测试成功！`);
            }
        } else if (results) {
            // 处理testApiConnection可能返回空数组的情况(例如用户取消)
        }

        return results; // 返回结果数组
    } catch (error) {
        EDITOR.error(`API 测试过程中发生错误: ${error.message}`);
        console.error("API Test Error:", error);
        // 发生一般错误时返回一个表示所有测试密钥失败的数组
        return keysToTest.map((_, index) => ({
            keyIndex: apiKeys.indexOf(keysToTest[index]), // 如果需要则查找原始索引
            success: false,
            error: `测试过程中发生错误: ${error.message}`
        }));
    }
}

/**
 * 测试API连接
 * @param {string} apiUrl - API URL
 * @param {string[]} apiKeys - API密钥数组
 * @param {string} modelName - 模型名称
 * @returns {Promise<Array<{keyIndex: number, success: boolean, error?: string}>>} 测试结果数组
 */
export async function testApiConnection(apiUrl, apiKeys, modelName) {
    const results = [];
    const testPrompt = "Say 'test'";
    const apiKey = apiKeys[0];

    const processResponse = (rawResponseData) => {
        const responseData = normalizeApiResponse(rawResponseData);
        // 测试连接时，我们不关心返回的具体内容，只关心是否成功收到一个有效的JSON响应。
        // 即使 content 为空，只要 choices 数组存在，就代表API调用是通的。
        if (responseData && Array.isArray(responseData.choices)) {
            results.push({ keyIndex: 0, success: true });
        } else {
            const errorMessage = responseData?.error?.message || `收到的响应无效或为空。`;
            throw new Error(`${errorMessage} 响应: ${JSON.stringify(rawResponseData)}`);
        }
    };

    try {
        // 模式一：通过后端代理
        console.log("尝试通过后端代理测试连接...");
        const data = await $.ajax({
            url: '/api/backends/chat-completions/generate',
            type: 'POST',
            contentType: 'application/json',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            data: JSON.stringify({
                chat_completion_source: 'custom',
                custom_url: apiUrl,
                api_key: apiKey,
                messages: [{ role: 'user', content: testPrompt }],
                model: modelName || 'gpt-3.5-turbo',
                temperature: 0.1,
                max_tokens: 50,
                stream: false,
            }),
        });
        processResponse(data);
    } catch (proxyError) {
        console.warn("后端代理模式测试失败:", proxyError);

        try {
            // 模式二：前端直接连接
            console.log("尝试前端直接连接测试...");
            const finalApiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
            const response = await fetch(finalApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: testPrompt }],
                    model: modelName || 'gpt-3.5-turbo',
                    temperature: 0.1,
                    max_tokens: 50,
                    stream: false,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || response.statusText || '请求失败');
            }

            const responseData = await response.json();
            processResponse(responseData);
            
        } catch (directError) {
            console.error("前端直连模式测试也失败了:", directError);
            const finalErrorMessage = `两种模式均失败：\n1. 代理: ${proxyError.statusText || proxyError.message}\n2. 直连: ${directError.message}`;
            results.push({ keyIndex: 0, success: false, error: finalErrorMessage });
        }
    }
    
    return results;
}

/**自定义API调用
 * @param {string|Array<object>} systemPrompt - 系统提示或消息数组
 * @param {string} [userPrompt] - 用户提示 (如果第一个参数是消息数组，则此参数被忽略)
 * @param {boolean} [isStepByStepSummary=false] - 是否为分步总结模式，用于控制流式传输
 * @param {boolean} [isSilent=false] - 是否以静默模式运行，不显示加载提示
 * @returns {Promise<string>} 生成的响应内容
 */
export async function handleCustomAPIRequest(systemPrompt, userPrompt, isStepByStepSummary = false, isSilent = false) {
    const decryptedApiKeysString = await getDecryptedApiKey();
    if (!decryptedApiKeysString) {
        EDITOR.error('API key解密失败或未设置!');
        return;
    }

    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(Boolean);
    if (apiKeys.length === 0) {
        EDITOR.error('未找到有效的API Key.');
        return;
    }
    
    let suspended = false;
    createLoadingToast(false, isSilent).then(r => {
        loadingToast?.close();
        suspended = r;
    });

    const keyIndexToTry = currentApiKeyIndex % apiKeys.length;
    const currentApiKey = apiKeys[keyIndexToTry];
    currentApiKeyIndex++;
    
    if (loadingToast) {
        loadingToast.text = `尝试使用第 ${keyIndexToTry + 1}/${apiKeys.length} 个自定义API Key...`;
    }

    let messages;
    if (Array.isArray(systemPrompt)) {
        messages = systemPrompt;
    } else {
        messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];
    }

    const processResponse = (rawResponseData) => {
        const responseData = normalizeApiResponse(rawResponseData);
        const responseText = responseData?.choices?.[0]?.message?.content;
        if (suspended) return 'suspended';
        if (!responseText) {
            const errorMessage = responseData?.error?.message || `响应中未找到有效内容。`;
            throw new Error(`${errorMessage} 响应: ${JSON.stringify(rawResponseData)}`);
        }
        return responseText;
    };

    try {
        // 模式一：通过后端代理
        console.log("尝试通过后端代理发送请求...");
        const requestData = {
            chat_completion_source: 'custom',
            custom_url: USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url,
            api_key: currentApiKey,
            messages: messages,
            model: USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name,
            temperature: USER.tableBaseSetting.custom_temperature,
            stream: false,
        };
        const response = await $.ajax({
            url: '/api/backends/chat-completions/generate',
            type: 'POST',
            contentType: 'application/json',
            headers: {
                'Authorization': `Bearer ${currentApiKey}`
            },
            data: JSON.stringify(requestData),
        });
        const result = processResponse(response);
        loadingToast?.close();
        return result;
    } catch (proxyError) {
        console.warn("后端代理模式失败:", proxyError);
        
        try {
            // 模式二：前端直接连接
            console.log("尝试前端直接连接发送请求...");
            const finalApiUrl = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url.replace(/\/$/, '') + '/chat/completions';
            const response = await fetch(finalApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentApiKey}`,
                },
                body: JSON.stringify({
                    messages: messages,
                    model: USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name,
                    temperature: USER.tableBaseSetting.custom_temperature,
                    stream: false,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || response.statusText || '请求失败');
            }
            
            const responseData = await response.json();
            loadingToast?.close();
            return processResponse(responseData);

        } catch (directError) {
            console.error("前端直连模式也失败了:", directError);
            const finalErrorMessage = `两种模式均失败：\n1. 代理: ${proxyError.statusText || proxyError.message}\n2. 直连: ${directError.message}`;
            EDITOR.error(`API 调用失败 (Key ${keyIndexToTry + 1}): ${finalErrorMessage}`);
            loadingToast?.close();
            return `错误: ${finalErrorMessage}`;
        }
    }
}

/**请求模型列表
 * @returns {Promise<void>}
 */
/**
 * 格式化API Key用于错误提示
 * @param {string} key - API Key
 * @returns {string} 格式化后的Key字符串
 */
function maskApiKey(key) {
    const len = key.length;
    if (len === 0) return "[空密钥]";
    if (len <= 8) {
        const visibleCount = Math.ceil(len / 2);
        return key.substring(0, visibleCount) + '...';
    } else {
        return key.substring(0, 4) + '...' + key.substring(len - 4);
    }
}

/**请求模型列表
 * @returns {Promise<void>}
 */
export async function updateModelList() {
    const apiUrl = $('#custom_api_url').val().trim();
    const $selector = $('#model_selector');
    
    if (!apiUrl) {
        EDITOR.error('请输入API URL');
        return;
    }

    const decryptedApiKeysString = await getDecryptedApiKey();
    if (!decryptedApiKeysString) {
        EDITOR.error('API Key解密失败或未设置!');
        return;
    }

    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(Boolean);
    if (apiKeys.length === 0) {
        EDITOR.error('未找到有效的API Key.');
        return;
    }
    
    $selector.prop('disabled', true).empty().append($('<option>', { value: '', text: '正在获取...' }));

    const processResponse = (rawResponseData) => {
        const responseData = normalizeApiResponse(rawResponseData);
        const models = responseData.data || []; // 经过 normalizeApiResponse 处理后，models 就在 .data 中

        if (responseData.error || !Array.isArray(models) || models.length === 0) {
            const errorMessage = responseData?.error?.message || '未返回有效模型列表。';
            throw new Error(`${errorMessage} 响应: ${JSON.stringify(rawResponseData)}`);
        }

        $selector.prop('disabled', false).empty();
        const customModelName = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
        let hasMatchedModel = false;
        
        const getModelId = (model) => model.id || model.model;

        const sortedModels = models.sort((a, b) => {
            const idA = getModelId(a) || '';
            const idB = getModelId(b) || '';
            return idA.localeCompare(idB);
        });

        sortedModels.forEach(model => {
            const modelId = getModelId(model);
            if (!modelId) return; // 跳过没有标识符的模型

            $selector.append($('<option>', { value: modelId, text: modelId }));
            if (modelId === customModelName) hasMatchedModel = true;
        });

        if (hasMatchedModel) {
            $selector.val(customModelName);
        } else if (sortedModels.length > 0) {
            const firstModelId = getModelId(sortedModels[0]);
            $('#custom_model_name').val(firstModelId);
            USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name = firstModelId;
        }

        EDITOR.success(`成功获取 ${sortedModels.length} 个模型`);
    };

    try {
        // 模式一：通过后端代理
        console.log("尝试通过后端代理获取模型列表...");
        const data = await $.ajax({
            url: '/api/backends/chat-completions/status',
            type: 'POST',
            contentType: 'application/json',
            headers: {
                'Authorization': `Bearer ${apiKeys[0]}`
            },
            data: JSON.stringify({
                chat_completion_source: 'custom',
                custom_url: apiUrl,
                api_key: apiKeys[0],
            }),
        });
        processResponse(data);
    } catch (proxyError) {
        console.warn("后端代理模式失败:", proxyError);

        try {
            // 模式二：前端直接连接
            console.log("尝试前端直接连接获取模型列表...");
            const finalApiUrl = apiUrl.replace(/\/$/, '') + '/models';
            const response = await fetch(finalApiUrl, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${apiKeys[0]}` },
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || response.statusText || '请求失败');
            }
            
            const responseData = await response.json();
            processResponse(responseData);

        } catch (directError) {
            console.error("前端直连模式也失败了:", directError);
            const finalErrorMessage = `两种模式均失败：\n1. 代理: ${proxyError.statusText || proxyError.message}\n2. 直连: ${directError.message}`;
            EDITOR.error(finalErrorMessage);
            $selector.empty().append($('<option>', { value: '', text: '获取失败,请手动输入' }));
        }
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
/**
 * @description
 * - **功能**: 导出所有表格数据，方便其他插件调用。
 * - **使用场景**: 当其他插件需要访问或处理当前插件管理的表格数据时，可以通过此函数获取。
 * - **返回值**: 返回一个包含所有表格数据的数组，每个表格对象包含：
 *   - `name`: 表格的名称。
 *   - `data`: 一个二维数组，表示表格的完整数据（包括表头和所有行）。
 *
 * @returns {Array<Object<{name: string, data: Array<Array<string>>}>>}
 */
export function ext_getAllTables() {
    // 核心重构：与 ext_exportAllTablesAsJson 保持一致，确保数据源是最新的持久化状态。
    
    // 1. 获取最新的 piece
    const { piece } = BASE.getLastSheetsPiece();
    if (!piece || !piece.hash_sheets) {
        console.warn("[Memory Enhancement] ext_getAllTables: 未找到任何有效的表格数据。");
        return [];
    }

    // 2. 基于最新的 hash_sheets 创建/更新 Sheet 实例
    const tables = BASE.hashSheetsToSheets(piece.hash_sheets);
    if (!tables || tables.length === 0) {
        return [];
    }
    
    // 3. 遍历最新的实例构建数据
    const allData = tables.map(table => {
        if (!table.enable) return null; // 跳过禁用的表格
        const header = table.getHeader();
        const body = table.getBody();
        const fullData = [header, ...body];

        return {
            name: table.name,
            data: fullData,
        };
    }).filter(Boolean); // 过滤掉 null (禁用的表格)

    return allData;
}

/**
 * @description
 * - **功能**: 导出所有表格为一个 JSON 对象，格式与 '范例表格.json' 类似。
 * - **使用场景**: 用于将当前所有表格的状态和数据导出为一个单一的 JSON 文件。
 * - **返回值**: 返回一个 JSON 对象，键是表格的 UID，值是表格的完整配置和数据。
 *
 * @returns {Object}
 */
/**
 * @description
 * - **功能**: 将一个 hash_sheets 对象转换为与导出格式兼容的 JSON 对象。
 * - **这是所有基于 hash_sheets 导出的核心函数**
 * @param {Object} hashSheets - The hash_sheets object from a chat piece.
 * @returns {Object} A JSON object representing the tables.
 */
export function ext_hashSheetsToJson(hashSheets) {
    const exportData = {};
    if (!hashSheets) return exportData;

    try {
        const tables = BASE.hashSheetsToSheets(hashSheets);
        if (tables && tables.length > 0) {
            tables.forEach(table => {
                if (!table.enable) return; // 跳过禁用的表格

                try {
                    const rawContent = table.getContent(true) || [];
                    const sanitizedContent = rawContent.map(row =>
                        Array.isArray(row) ? row.map(cell => String(cell ?? '')) : []
                    );

                    exportData[table.uid] = {
                        uid: table.uid,
                        name: table.name,
                        content: sanitizedContent
                    };
                } catch (error) {
                    console.error(`[Memory Enhancement] 导出表格 ${table.name} (UID: ${table.uid}) 时出错:`, error);
                }
            });
        }
    } catch (error) {
        console.error("[Memory Enhancement] 从 hash_sheets 转换表格时发生意外错误:", error);
    }
    
    return exportData;
}


export function ext_exportAllTablesAsJson() {
    let exportData = {};

    try {
        const context = USER.getContext();
        if (context && context.chat && context.chat.length > 0) {
            const { piece } = BASE.getLastSheetsPiece();
            if (piece && piece.hash_sheets) {
                exportData = ext_hashSheetsToJson(piece.hash_sheets);
            }
        }
    } catch (error) {
        console.error("[Memory Enhancement] 从聊天记录导出表格时发生意外错误:", error);
    }

    try {
        const stashedDataString = localStorage.getItem('table_stash_data');
        if (stashedDataString) {
            try {
                const stashedData = JSON.parse(stashedDataString);
                exportData = { ...stashedData, ...exportData };
            } catch (parseError) {
                console.warn("[Memory Enhancement] 解析 localStorage 中的暂存数据失败:", parseError);
            }
        }
    } catch (error) {
        console.error("[Memory Enhancement] 从 localStorage 读取暂存数据时发生意外错误:", error);
    }

    if (Object.keys(exportData).length === 0) {
        console.warn("[Memory Enhancement] ext_exportAllTablesAsJson: 未能从任何来源导出有效数据。");
    }
    
    return exportData;
}

/**
 * 将表格数据暂存到浏览器本地存储 (localStorage)
 * @param {string} key - 存储的键名
 * @param {string} content - 要存储的内容 (JSON字符串)
 * @returns {Promise<boolean>} - 是否成功
 */
export async function saveDataToLocalStorage(key, content) {
    try {
        localStorage.setItem(key, content);
        console.log(`[Memory Enhancement] 成功将数据暂存到 localStorage (key: ${key})`);
        return true;
    } catch (e) {
        console.error(`[Memory Enhancement] 写入 localStorage 失败:`, e);
        return false;
    }
}

/**
 * 从浏览器本地存储 (localStorage) 读取暂存的表格数据
 * @param {string} key - 存储的键名
 * @returns {Promise<string|null>} - 存储的内容或null
 */
export async function readDataFromLocalStorage(key) {
    try {
        const content = localStorage.getItem(key);
        console.log(`[Memory Enhancement] 从 localStorage 读取数据 (key: ${key}):`, content ? '找到内容' : '未找到内容');
        return content;
    } catch (e) {
        console.error(`[Memory Enhancement] 从 localStorage 读取失败:`, e);
        return null;
    }
}
