export class LLMApiService {
    constructor(config = {}) {
        this.config = {
            api_url: config.api_url || "https://api.openai.com/v1",
            api_key: config.api_key || "",
            model_name: config.model_name || "gpt-3.5-turbo",
            system_prompt: config.system_prompt || "你是一个专业的助手",
            temperature: config.temperature || 1.0,
            max_tokens: config.max_tokens || 4096,
            stream: config.stream || false
        };
    }

    async callLLM(textToTranslate, streamCallback = null) {
        if (!textToTranslate || textToTranslate.trim().length < 2) {
            throw new Error("输入文本太短");
        }

        if (!this.config.api_url || !this.config.api_key || !this.config.model_name) {
            throw new Error("API配置不完整");
        }

        let apiEndpoint = this.config.api_url;
        if (!apiEndpoint.endsWith("/chat/completions")) {
            apiEndpoint += "/chat/completions";
        }

        const headers = {
            'Authorization': `Bearer ${this.config.api_key}`,
            'Content-Type': 'application/json'
        };

        const messages = [
            { role: 'system', content: this.config.system_prompt },
            { role: 'user', content: textToTranslate }
        ];

        const data = {
            model: this.config.model_name,
            messages: messages,
            temperature: this.config.temperature,
            max_tokens: this.config.max_tokens,
            stream: this.config.stream
        };

        try {
            if (this.config.stream) {
                if (!streamCallback || typeof streamCallback !== 'function') {
                    throw new Error("流式模式下必须提供有效的streamCallback函数");
                }

                return await this._handleStreamResponse(apiEndpoint, headers, data, streamCallback);
            } else {
                return await this._handleRegularResponse(apiEndpoint, headers, data);
            }
        } catch (error) {
            console.error("LLM API调用错误:", error);
            throw error;
        }
    }

    async _handleRegularResponse(apiEndpoint, headers, data) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        const responseData = await response.json();

        if (!responseData.choices || responseData.choices.length === 0 ||
            !responseData.choices[0].message || !responseData.choices[0].message.content) {
            throw new Error("API返回无效的响应结构");
        }

        let translatedText = responseData.choices[0].message.content;
        return this._cleanResponse(translatedText);
    }

    async _handleStreamResponse(apiEndpoint, headers, data, streamCallback) {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        if (!response.body) {
            throw new Error("无法获取响应流");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullResponse = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;

                    try {
                        if (line.startsWith('data: ')) {
                            const dataStr = line.substring(6).trim();
                            if (dataStr === '[DONE]') continue;

                            const jsonData = JSON.parse(dataStr);
                            if (jsonData.choices?.[0]?.delta?.content) {
                                const content = jsonData.choices[0].delta.content;
                                fullResponse += content;
                                streamCallback(content);
                            }
                        }
                    } catch (e) {
                        console.warn("解析流数据失败:", e, "数据:", line);
                    }
                }
            }

            // 处理缓冲区剩余内容
            if (buffer.trim()) {
                try {
                    const jsonData = JSON.parse(buffer);
                    if (jsonData.choices?.[0]?.delta?.content) {
                        const content = jsonData.choices[0].delta.content;
                        fullResponse += content;
                        streamCallback(content);
                    }
                } catch (e) {
                    console.warn("解析缓冲区数据失败:", e);
                }
            }

            return this._cleanResponse(fullResponse);
        } finally {
            reader.releaseLock();
        }
    }

    _cleanResponse(text) {
        if (!text || text.trim() === "") {
            throw new Error("API返回了空的翻译结果");
        }

        // 清理思维链标记
        const thinkingRegex = /<(?:thinking|think)>(.*?)<\/(?:thinking|think)>/gs;
        return text.replace(thinkingRegex, '').trim();
    }

    async testConnection() {
        const testMessage = "Hello, can you hear me? Please respond with a simple yes.";

        const messages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: testMessage }
        ];

        let apiEndpoint = this.config.api_url;
        if (!apiEndpoint.endsWith("/chat/completions")) {
            apiEndpoint += "/chat/completions";
        }

        const headers = {
            'Authorization': `Bearer ${this.config.api_key}`,
            'Content-Type': 'application/json'
        };

        const data = {
            model: this.config.model_name,
            messages: messages,
            temperature: this.config.temperature,
            max_tokens: this.config.max_tokens,
            stream: false
        };

        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API测试请求失败: ${response.status} - ${errorText}`);
            }

            const responseData = await response.json();
            return responseData.choices[0].message.content;
        } catch (error) {
            console.error("API连接测试错误:", error);
            throw error;
        }
    }
}

// 浏览器环境使用示例
export async function testStreamingAPI(outputElementId = 'stream-output') {
    const testConfig = {
        api_key: '',
        stream: true
    };

    const llmService = new LLMApiService(testConfig);
    const testText = "This is a test sentence for streaming response.";
    const outputElement = document.getElementById(outputElementId);

    if (!outputElement) {
        console.error("输出元素未找到");
        return;
    }

    console.log("开始流式传输测试...");
    outputElement.innerHTML = "开始流式传输测试...<br>";

    let receivedChunks = 0;
    const startTime = Date.now();

    await llmService.callLLM(testText, (chunk) => {
        receivedChunks++;
        outputElement.innerHTML += chunk;
        outputElement.scrollTop = outputElement.scrollHeight; // 自动滚动到底部
    });

    const duration = (Date.now() - startTime) / 1000;
    const summary = `<br><br>测试完成，共接收 ${receivedChunks} 个数据块，耗时 ${duration.toFixed(2)} 秒`;
    outputElement.innerHTML += summary;
    console.log(summary);
}

// 自动挂载到window对象
if (typeof window !== 'undefined') {
    window.LLMApiService = LLMApiService;
    window.testStreamingAPI = testStreamingAPI;
}

export default LLMApiService;
