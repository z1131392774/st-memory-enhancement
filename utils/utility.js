// 生成或获取设备ID（从用户代码中提取）

let step = 0;  // 保证每次调用该函数时绝对能生成不一样的随机数
function stepRandom(bias = step) {
    // console.log('stepRandom');
    let r = 100000 / (100000 / Math.random() + bias++);
    return r;
}

/**
 * 生成一个随机字符串
 * @description 请注意，该函数不适用于安全敏感的场景，在长度低于 12 时有碰撞的风险
 * @description 在 length = 8 时有 0.000023% (1,000,000次实验) 的可能性会出现重复
 * @param length
 * @param bias
 * @param characters
 * @returns {string}
 */
export function generateRandomString(length = 12, bias = step, characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(stepRandom(bias) * characters.length));
    }
    return result;
}

/**
 * 生成一个随机数字
 * @description 请注意，该函数不适用于安全敏感的场景，且在 length = 8 时有 0.00005% (1,000,000次实验) 的可能性会出现重复
 * @param length
 * @param forceLength
 * @returns {number}
 */
export function generateRandomNumber(length = 12, forceLength = true) {
    let randomNumber;

    do {
        randomNumber = Math.floor(stepRandom() * Math.pow(10, length));

        // 如果需要强制长度，确保生成的数字符合要求
        if (forceLength && randomNumber.toString().length < length) {
            randomNumber *= Math.pow(10, length - randomNumber.toString().length);
        }
    } while (forceLength && randomNumber.toString().length !== length);

    return randomNumber;
}

//random一个唯一id加密用
export function generateUid() {
    const rid = `st-${Date.now()}-${generateRandomString(32)}`;
    console.log('生成的唯一ID:', rid);
    return rid;
}

export function generateDeviceId() {
    let deviceId = localStorage.getItem('st_device_id') || generateUid();
    if (!localStorage.getItem('st_device_id')) {
        localStorage.setItem('st_device_id', deviceId);
    }
    return deviceId;
}

/**
 * 使用原生 JavaScript 方法计算字符串的 MD5 哈希值
 * @param {string} string 要计算哈希的字符串
 * @returns {Promise<string>}  返回一个 Promise，resolve 值为十六进制表示的 MD5 哈希字符串
 */
export async function calculateStringHash(string) {
    // 检查string是否为字符串
    if (typeof string !== 'string') {
        throw new Error('The input value is not a string.');
    }

    // 步骤 1: 将字符串编码为 Uint8Array
    const textEncoder = new TextEncoder();
    const data = textEncoder.encode(string);

    // 步骤 2: 使用 crypto.subtle.digest 计算哈希值
    // 仅适用于非安全敏感的场景，例如数据校验。
    const hashBuffer = await crypto.subtle.digest('MD5', data);

    // 步骤 3: 将 ArrayBuffer 转换为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
        .map(byte => byte.toString(16).padStart(2, '0')) // 将每个字节转换为两位十六进制字符串
        .join(''); // 连接成一个完整的十六进制字符串

    return hashHex;
}
