// 生成或获取设备ID（从用户代码中提取）
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
