import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';

/**
 * 统一处理要写入单元格的值，确保健壮性。
 * - 字符串：直接返回（移除逗号替换逻辑）。
 * - 数字：转换为字符串返回。
 * - null/undefined：返回空字符串 ''。
 * - 其他类型（如对象、布尔值）：转换为其JSON字符串表示，或返回空字符串。
 * @param {*} cell - 任何类型的单元格数据
 * @returns {string} - 处理后的字符串值
 */
function handleCellValue(cell) {
    if (cell === null || cell === undefined) {
        return ''; // 明确处理 null 和 undefined 为空字符串
    }
    if (typeof cell === 'string') {
        return cell; // 直接返回字符串，不再替换逗号
    }
    if (typeof cell === 'number' || typeof cell === 'boolean') {
        return String(cell); // 数字和布尔值转为字符串
    }
    if (typeof cell === 'object') {
        // 对于对象，可以选择返回其JSON字符串表示或空字符串，这里选择后者以避免复杂结构
        return JSON.stringify(cell) === '{}' ? '' : JSON.stringify(cell);
    }
    return ''; // 其他所有情况都返回空字符串
}


/**
 * 在表格末尾插入行 (已废弃，但为保持兼容性而保留)
 * @param {number} tableIndex 表格索引
 * @param {object} data 插入的数据
 * @returns 新插入行的索引
 */
export function insertRow(tableIndex, data) {
    if (tableIndex == null) return EDITOR.error('insert函数，tableIndex函数为空');
    if (data == null) return EDITOR.error('insert函数，data函数为空');

    const table = DERIVED.any.waitingTable[tableIndex];
    if (!table || !table.columns) {
        console.error(`插入失败: 表格索引 ${tableIndex} 无效或表格结构不完整。`);
        return -1;
    }

    const newRowArray = new Array(table.columns.length).fill("");
    Object.entries(data).forEach(([key, value]) => {
        const colIndex = parseInt(key);
        if (!isNaN(colIndex) && colIndex >= 0 && colIndex < newRowArray.length) {
            newRowArray[colIndex] = handleCellValue(value);
        }
    });

    // 可选：检查是否重复插入
    // const dataStr = JSON.stringify(newRowArray);
    // if (table.content.some(row => JSON.stringify(row) === dataStr)) {
    //     console.log(`跳过重复插入: table ${tableIndex}, data ${dataStr}`);
    //     return -1;
    // }

    table.content.push(newRowArray);
    const newRowIndex = table.content.length - 1;
    console.log(`插入成功: table ${tableIndex}, row ${newRowIndex}`);
    return newRowIndex;
}

/**
 * 删除行 (已废弃，但为保持兼容性而保留)
 * @param {number} tableIndex 表格索引
 * @param {number} rowIndex 行索引
 */
export function deleteRow(tableIndex, rowIndex) {
    if (tableIndex == null) return EDITOR.error('delete函数，tableIndex函数为空');
    if (rowIndex == null) return EDITOR.error('delete函数，rowIndex函数为空');

    const table = DERIVED.any.waitingTable[tableIndex];

    if (table && table.content && rowIndex >= 0 && rowIndex < table.content.length) {
        table.content.splice(rowIndex, 1);
        console.log(`删除成功: table ${tableIndex}, row ${rowIndex}`);
    } else {
        console.error(`删除失败: table ${tableIndex}, 无效的行索引 ${rowIndex} 或 content 不存在`);
    }
}

/**
 * 更新单个行的信息 (已废弃，但为保持兼容性而保留)
 * @param {number} tableIndex 表格索引
 * @param {number} rowIndex 行索引
 * @param {object} data 更新的数据
 */
export function updateRow(tableIndex, rowIndex, data) {
    if (tableIndex == null) return EDITOR.error('update函数，tableIndex函数为空');
    if (rowIndex == null) return EDITOR.error('update函数，rowIndex函数为空');
    if (data == null) return EDITOR.error('update函数，data函数为空');

    const table = DERIVED.any.waitingTable[tableIndex];

    if (table && table.content && table.content[rowIndex]) {
        Object.entries(data).forEach(([key, value]) => {
            const colIndex = parseInt(key);
            if (!isNaN(colIndex) && colIndex >= 0 && colIndex < table.content[rowIndex].length) {
                 table.content[rowIndex][colIndex] = handleCellValue(value);
            }
        });
        console.log(`更新成功: table ${tableIndex}, row ${rowIndex}`);
    } else {
        console.error(`更新失败: table ${tableIndex}, row ${rowIndex} 不存在或 content 不存在`);
    }
}
