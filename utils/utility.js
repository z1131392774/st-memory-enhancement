//random一个唯一id加密用
export function generateUniId() {
    return `st-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
