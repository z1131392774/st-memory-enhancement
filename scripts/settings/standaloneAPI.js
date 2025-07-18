// standaloneAPI.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';
import LLMApiService from "../../services/llmApi.js";
import {PopupConfirm} from "../../components/popupConfirm.js";

// @ts-ignore
let ChatCompletionService = undefined;
try {
    // 动态导入，兼容模块不存在的情况
    const module = await import('/scripts/custom-request.js');
    ChatCompletionService = module.ChatCompletionService;
} catch (e) {
    console.warn("未检测到 /scripts/custom-request.js 或未正确导出 ChatCompletionService，将禁用代理相关功能。", e);
}

let loadingToast = null;
let currentApiKeyIndex = 0;// 用于记录当前使用的API Key的索引


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
    const testPrompt = "Say 'test'"; // 测试用例

    for (let i = 0; i < apiKeys.length; i++) {
        const apiKey = apiKeys[i];
        console.log(`Testing API Key index: ${i}`);
        try {
            const llmService = new LLMApiService({
                api_url: apiUrl,
                api_key: apiKey,
                model_name: modelName || 'gpt-3.5-turbo', // 使用用户设置的模型名称
                system_prompt: 'You are a test assistant.',
                temperature: 0.1 // 使用用户设置的温度
            });

            // 调用API
            const response = await llmService.callLLM(testPrompt);

            if (response && typeof response === 'string') {
                console.log(`API Key index ${i} test successful. Response: ${response}`);
                results.push({ keyIndex: i, success: true });
            } else {
                throw new Error('Invalid or empty response received.');
            }
        } catch (error) {
            console.error(`API Key index ${i} test failed (raw error object):`, error); // Log the raw error object
            let errorMessage = 'Unknown error';
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error && typeof error.toString === 'function') {
                errorMessage = error.toString();
            }
            results.push({ keyIndex: i, success: false, error: errorMessage });
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
    const USER_API_URL = USER.IMPORTANT_USER_PRIVACY_DATA.custom_api_url;
    const decryptedApiKeysString = await getDecryptedApiKey(); // 获取逗号分隔的密钥字符串
    const USER_API_MODEL = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
    // const MAX_RETRIES = USER.tableBaseSetting.custom_api_retries ?? 0; // 从设置中获取重试次数，默认为 0
    const MAX_RETRIES = 0; // 从设置中获取重试次数，默认为 0

    if (!USER_API_URL || !USER_API_MODEL) {
        EDITOR.error('请填写完整的自定义API配置 (URL 和模型)');
        return;
    }

    if (!decryptedApiKeysString) {
        EDITOR.error('API key解密失败或未设置，请检查API key设置！');
        return;
    }

    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length === 0) {
        EDITOR.error('未找到有效的API Key，请检查输入。');
        return;
    }

    let suspended = false;
    createLoadingToast(false, isSilent).then((r) => {
        if (loadingToast) loadingToast.close();
        suspended = r;
    })

    const totalKeys = apiKeys.length;
    const attempts = MAX_RETRIES === 0 ? totalKeys : Math.min(MAX_RETRIES, totalKeys);
    let lastError = null;

    for (let i = 0; i < attempts; i++) {
        if (suspended) break; // 检查用户是否中止了操作

        const keyIndexToTry = currentApiKeyIndex % totalKeys;
        const currentApiKey = apiKeys[keyIndexToTry];
        currentApiKeyIndex++; // 移动到下一个密钥，用于下一次整体请求

        console.log(`尝试使用API密钥索引进行API调用: ${keyIndexToTry}`);
        if (loadingToast) {
            loadingToast.text = `尝试使用第 ${keyIndexToTry + 1}/${totalKeys} 个自定义API Key...`;
        }

        try { // Outer try for the whole attempt with the current key
            const promptData = Array.isArray(systemPrompt) ? systemPrompt : userPrompt;
            let response; // Declare response variable

            // --- ALWAYS Use llmService ---
            console.log(`自定义API: 使用 llmService.callLLM (输入类型: ${Array.isArray(promptData) ? '多消息数组' : '单条消息'})`);
            if (loadingToast) {
                loadingToast.text = `正在使用第 ${keyIndexToTry + 1}/${totalKeys} 个自定义API Key (llmService)...`;
            }

            const llmService = new LLMApiService({
                api_url: USER_API_URL,
                api_key: currentApiKey,
                model_name: USER_API_MODEL,
                // Pass empty system_prompt if promptData is array, otherwise pass the original systemPrompt string
                system_prompt: Array.isArray(promptData) ? "" : systemPrompt,
                temperature: USER.tableBaseSetting.custom_temperature,
                table_proxy_address: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_address,
                table_proxy_key: USER.IMPORTANT_USER_PRIVACY_DATA.table_proxy_key
            });

            const streamCallback = (chunk) => {
                if (loadingToast) {
                    const modeText = isStepByStepSummary ? "(分步)" : ""; // isStepByStepSummary might be useful here still
                    loadingToast.text = `正在使用第 ${keyIndexToTry + 1} 个Key生成${modeText}: ${chunk}`;
                }
            };

            try {
                // Pass promptData (which could be string or array) to callLLM
                response = await llmService.callLLM(promptData, streamCallback);
                console.log(`请求成功 (llmService, 密钥索引: ${keyIndexToTry}):`, response);
                loadingToast?.close();
                return suspended ? 'suspended' : response; // Success, return immediately
            } catch (llmServiceError) {
                // llmService failed, log error and continue loop
                console.error(`API调用失败 (llmService)，密钥索引 ${keyIndexToTry}:`, llmServiceError);
                lastError = llmServiceError;
                EDITOR.error(`使用第 ${keyIndexToTry + 1} 个 Key 调用 (llmService) 失败: ${llmServiceError.message || '未知错误'}`);
                // Let the loop continue to the next key
            }
            // If code reaches here, the llmService call failed for this key

        } catch (error) { // This catch should ideally not be reached due to inner try/catch
            console.error(`处理密钥索引 ${keyIndexToTry} 时发生意外错误:`, error);
            lastError = error;
            EDITOR.error(`处理第 ${keyIndexToTry + 1} 个 Key 时发生意外错误: ${error.message || '未知错误'}`);
        }
    }

    // 所有尝试均失败
    loadingToast?.close();
    if (suspended) {
        EDITOR.warning('操作已被用户中止。');
        return 'suspended';
    }

    const errorMessage = `所有 ${attempts} 次尝试均失败。最后错误: ${lastError?.message || '未知错误'}`;
    EDITOR.error(errorMessage);
    console.error('所有API调用尝试均失败。', lastError);
    return `错误: ${errorMessage}`; // 返回一个明确的错误字符串

    // // 公共请求配置 (Commented out original code remains unchanged)
    // const requestConfig = {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         'Authorization': `Bearer ${USER_API_KEY}`
    //     },
    //     body: JSON.stringify({
    //         model: USER_API_MODEL,
    //         messages: [
    //             { role: "system", content: systemPrompt },
    //             { role: "user", content: userPrompt }
    //         ],
    //         temperature: USER.tableBaseSetting.custom_temperature
    //     })
    // };
    //
    // // 通用请求函数
    // const makeRequest = async (url) => {
    //     const response = await fetch(url, requestConfig);
    //     if (!response.ok) {
    //         const errorBody = await response.text();
    //         throw { status: response.status, message: errorBody };
    //     }
    //     return response.json();
    // };
    // let firstError;
    // try {
    //     // 第一次尝试补全/chat/completions
    //     const modifiedUrl = new URL(USER_API_URL);
    //     modifiedUrl.pathname = modifiedUrl.pathname.replace(/\/$/, '') + '/chat/completions';
    //     const result = await makeRequest(modifiedUrl.href);
    //     if (result?.choices?.[0]?.message?.content) {
    //         console.log('请求成功:', result.choices[0].message.content)
    //         return result.choices[0].message.content;
    //     }
    // } catch (error) {
    //     firstError = error;
    // }
    //
    // try {
    //     // 第二次尝试原始URL
    //     const result = await makeRequest(USER_API_URL);
    //     return result.choices[0].message.content;
    // } catch (secondError) {
    //     const combinedError = new Error('API请求失败');
    //     combinedError.details = {
    //         firstAttempt: firstError?.message || '第一次请求无错误信息',
    //         secondAttempt: secondError.message
    //     };
    //     throw combinedError;
    // }
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

    const isCustomApi = apiUrl && !apiUrl.includes("api.openai.com");

    if (isCustomApi) {
        // 对于自定义API，由于环境兼容性问题，我们不再尝试自动获取模型列表
        // 而是提示用户手动输入
        console.log("检测到自定义API，跳过模型列表自动获取。");
        EDITOR.info("对于自定义API，请在下方的“模型名称”字段中手动输入您的模型ID。");
        $selector.empty()
            .append($('<option>', { value: '', text: '请手动输入模型名称' }))
            .prop('disabled', true);
        return;
    }

    // --- 以下逻辑仅适用于官方或兼容的、非自定义API ---
    $selector.prop('disabled', false);
    const decryptedApiKeysString = await getDecryptedApiKey();

    if (!decryptedApiKeysString) {
        EDITOR.error('API key解密失败或未设置，请检查API key设置！');
        return;
    }

    const apiKeys = decryptedApiKeysString.split(',').map(k => k.trim()).filter(k => k.length > 0);

    if (apiKeys.length === 0) {
        EDITOR.error('未找到有效的API Key，请检查输入。');
        return;
    }

    let modelsUrl;
    try {
        const normalizedUrl = new URL(apiUrl);
        normalizedUrl.pathname = normalizedUrl.pathname.replace(/\/$/, '') + '/models';
        modelsUrl = normalizedUrl.href;
    } catch (e) {
        EDITOR.error(`无效的API URL: ${apiUrl}`);
        return;
    }

    let firstSuccessfulKeyIndex = -1;
    let modelCount = 0;
    const invalidKeysInfo = [];

    for (let i = 0; i < apiKeys.length; i++) {
        if (firstSuccessfulKeyIndex !== -1) break; // Stop if we've succeeded

        const currentApiKey = apiKeys[i];
        try {
            console.log(`[Fetch] 使用第 ${i + 1} 个 Key 直接获取模型...`);
            const response = await fetch(modelsUrl, {
                headers: { 'Authorization': `Bearer ${currentApiKey}` }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`请求失败: ${response.status} ${response.statusText} - ${errorText}`);
            }
            const data = await response.json();

            if (data?.data?.length > 0) {
                firstSuccessfulKeyIndex = i;
                modelCount = data.data.length;

                $selector.empty();
                const customModelName = USER.IMPORTANT_USER_PRIVACY_DATA.custom_model_name;
                let hasMatchedModel = false;
                data.data.forEach(model => {
                    $selector.append($('<option>', { value: model.id, text: model.id }));
                    if (model.id === customModelName) hasMatchedModel = true;
                });
                if (hasMatchedModel) {
                    $selector.val(customModelName);
                }
            } else {
                throw new Error('请求成功但未返回有效模型列表');
            }
        } catch (error) {
            console.error(`使用第 ${i + 1} 个 Key 获取模型失败:`, error);
            invalidKeysInfo.push({ index: i + 1, key: currentApiKey, error: error.message });
        }
    }

    // Final user feedback
    if (firstSuccessfulKeyIndex !== -1) {
        EDITOR.success(`成功获取 ${modelCount} 个模型 (使用第 ${firstSuccessfulKeyIndex + 1} 个 Key)`);
    } else {
        EDITOR.error('未能使用任何提供的API Key获取模型列表');
        $selector.empty().append($('<option>', { value: '', text: '未能获取模型列表' }));
    }

    if (invalidKeysInfo.length > 0 && firstSuccessfulKeyIndex !== -1) {
        const errorDetails = invalidKeysInfo.map(item => `第${item.index}个Key`).join(', ');
        EDITOR.info(`另外, ${errorDetails} 无效`);
    } else if (invalidKeysInfo.length > 0 && firstSuccessfulKeyIndex === -1) {
        const errorDetails = invalidKeysInfo.map(item => `第${item.index}个Key (${maskApiKey(item.key)}) 无效: ${item.error}`).join('\n');
        EDITOR.error(`所有Key均无效:\n${errorDetails}`);
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
export function ext_exportAllTablesAsJson() {
    let exportData = {};

    try {
        // [健壮性改造] 增加前置检查，防止在插件未完全加载或无聊天记录时崩溃。
        const context = USER.getContext();
        if (context && context.chat && context.chat.length > 0) {
            // [数据源一致性] 调用已经过重构的函数链，确保从最新的本地数据生成实例。
            const { piece } = BASE.getLastSheetsPiece();
            if (piece && piece.hash_sheets) {
                const tables = BASE.hashSheetsToSheets(piece.hash_sheets);
                if (tables && tables.length > 0) {
                    tables.forEach(table => {
                        if (!table.enable) return; // 跳过禁用的表格

                        try {
                            // 注意：由于 hashSheetsToSheets 已确保实例是全新的，这里的 getContent 总是能获取到最新数据。
                            const rawContent = table.getContent(true) || [];

                            // 深度清洗，确保所有单元格都是字符串类型。
                            const sanitizedContent = rawContent.map(row =>
                                Array.isArray(row) ? row.map(cell =>
                                    String(cell ?? '') // 将 null 和 undefined 转换为空字符串
                                ) : []
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
            }
        }
    } catch (error) {
        console.error("[Memory Enhancement] 从聊天记录导出表格时发生意外错误:", error);
    }

    try {
        // [新增功能] 尝试从 localStorage 读取暂存的数据并合并
        const stashedDataString = localStorage.getItem('table_stash_data');
        if (stashedDataString) {
            try {
                const stashedData = JSON.parse(stashedDataString);
                // 合并数据，当前聊天中的数据会覆盖暂存的数据
                exportData = { ...stashedData, ...exportData };
            } catch (parseError) {
                console.warn("[Memory Enhancement] 解析 localStorage 中的暂存数据失败:", parseError);
            }
        }
    } catch (error) {
        console.error("[Memory Enhancement] 从 localStorage 读取暂存数据时发生意外错误:", error);
    }

    // 即使发生错误，也返回当前已成功导出的部分，确保函数不会崩溃
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
