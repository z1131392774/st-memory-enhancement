// 生成或获取设备ID（从用户代码中提取）

let step = 0;  // 保证每次调用该函数时绝对能生成不一样的随机数
function stepRandom(bias = step) {
    // console.log('stepRandom');
    let r = 100000 / (100000 / Math.random() + bias++);
    return r;
}

export function getRandomString(length = 12, bias = step, characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(stepRandom(bias) * characters.length));
    }
    return result;
}

export function getRandomNumber(length = 12, forceLength = true) {
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

export function generateDeviceId() {
    let deviceId = localStorage.getItem('st_device_id') || generateUniId();
    if (!localStorage.getItem('st_device_id')) {
        localStorage.setItem('st_device_id', deviceId);
    }
    return deviceId;
}

//random一个唯一id加密用
export function generateUniId() {
    return `st-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
