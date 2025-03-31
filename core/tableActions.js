import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';

/**
 * 将单元格中的逗号替换为/符号
 * @param {string | number} cell
 * @returns 处理后的单元格值
 */
function handleCellValue(cell) {
    if (typeof cell === 'string') {
        return cell.replace(/,/g, "/")
    } else if (typeof cell === 'number') {
        return cell
    }
    return ''
}

/**
 * 在表格末尾插入行
 * @param {number} tableIndex 表格索引
 * @param {object} data 插入的数据
 * @returns 新插入行的索引
 */
export function insertRow(tableIndex, data) {
    if (tableIndex == null) return EDITOR.error('insert函数，tableIndex函数为空');
    if (data == null) return EDITOR.error('insert函数，data函数为空');
    const table = DERIVED.any.waitingTable[tableIndex];
    const newRow = Object.entries(data)
        .reduce((row, [key, value]) => {
            row[parseInt(key)] = handleCellValue(value);
            return row;
        }, new Array(table.columns.length).fill(""));
    const dataStr = JSON.stringify(newRow);
    // 检查是否已存在相同行
    if (table.content.some(row => JSON.stringify(row) === dataStr)) {
        console.log(`跳过重复插入: table ${tableIndex}, data ${dataStr}`);
        return -1; // 返回-1表示未插入
    }
    const newRowIndex = table.insert(data);
    console.log(`插入成功: table ${tableIndex}, row ${newRowIndex}`);
    return newRowIndex;
}

/**
 * 删除行
 * @param {number} tableIndex 表格索引
 * @param {number} rowIndex 行索引
 */
export function deleteRow(tableIndex, rowIndex) {
    if (tableIndex == null) return EDITOR.error('delete函数，tableIndex函数为空');
    if (rowIndex == null) return EDITOR.error('delete函数，rowIndex函数为空');
    const table = DERIVED.any.waitingTable[tableIndex]
    table.delete(rowIndex)
}

/**
 * 更新单个行的信息
 * @param {number} tableIndex 表格索引
 * @param {number} rowIndex 行索引
 * @param {object} data 更新的数据
 */
export function updateRow(tableIndex, rowIndex, data) {
    if (tableIndex == null) return EDITOR.error('update函数，tableIndex函数为空');
    if (rowIndex == null) return EDITOR.error('update函数，rowIndex函数为空');
    if (data == null) return EDITOR.error('update函数，data函数为空');
    const table = DERIVED.any.waitingTable[tableIndex]
    table.update(rowIndex, data)
}
