import { USER } from "../manager";

/**
 * 替换字符串中的user标签
 */
export function replaceUserTag(str) {
    if (str == null) return ''; // 处理 null 或 undefined
    if (typeof str !== 'string') {
        console.warn('非字符串输入:', str);
        str = String(str); // 强制转换为字符串
    }
    return str.replace(/<user>/g, USER.getContext().name1);
}

/**
 * 将单元格中的逗号替换为/符号
 * @param {string | number} cell
 * @returns 处理后的单元格值
 */
export function handleCellValue(cell) {
    if (typeof cell === 'string') {
        return cell.replace(/,/g, "/")
    } else if (typeof cell === 'number') {
        return cell
    }
    return ''
}