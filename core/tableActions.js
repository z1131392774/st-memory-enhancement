import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import JSON5 from '../utils/json5.min.mjs'
import {handleCellValue} from "./table.js";

const OldTableAction = {
    updateRow: 'updateRow',
    insertRow: 'insertRow',
    deleteRow: 'deleteRow',
}

// function event(actionName, props = {}) {
//     const [rowIndex, colIndex] = this.#positionInParentCellSheet();
//     switch (actionName) {
//         case OldTableAction.updateRow:
//             this.#handleEditCell(props);
//             break;
//         case OldTableAction.insertRow:
//             if (colIndex <= 0) return;
//             this.#insertColumn(colIndex - 1);
//             break;
//         case OldTableAction.deleteRow:
//             this.#insertColumn(colIndex);
//             break;
//         case OldTableAction.insertUpRow:
//             if (rowIndex <= 0) return;
//             this.#insertRow(rowIndex - 1);
//             break;
//         case OldTableAction.insertDownRow:
//             this.#insertRow(rowIndex);
//             break;
//         case OldTableAction.deleteSelfColumn:
//             if (colIndex <= 0) return;
//             this.#deleteColumn(colIndex);
//             break;
//         case OldTableAction.deleteSelfRow:
//             if (rowIndex <= 0) return;
//             this.#deleteRow(rowIndex);
//             break;
//         case OldTableAction.clearSheet:
//             this.#clearSheet();
//             break;
//         default:
//             console.warn(`未处理的单元格操作: ${actionName}`);
//     }
//
//     // 触发自定义事件监听器
//     if (this.customEventListeners[actionName]) {
//         this.customEventListeners[actionName].forEach(callback => { // 遍历执行数组中的回调函数
//             callback(this, actionName, props); // 传递 cell 实例, actionName, 和 props
//         });
//     }
//     if (this.customEventListeners['']) {
//         this.customEventListeners[''].forEach(callback => { // 遍历执行数组中的回调函数
//             callback(this, actionName, props); // 监听所有事件的监听器
//         });
//     }
//
//     this.parent.renderSheet(this.parent.lastCellEventHandler);
//     this.parent.save();
//     console.log(`单元格操作: ${actionName} 位置: ${[rowIndex, colIndex]}`);
// }

export function oldTableAction(actionName, index, props) {

}

/**
 * 命令执行对象
 */
export class TableEditAction {
    constructor(str) {
        this.able = true
        if (!str) return
        this.str = str.trim()
        this.parsingFunctionStr()
    }

    parsingFunctionStr() {
        const { type, newFunctionStr } = isTableEditFunction(this.str)
        this.type = type
        if (this.type === 'Comment') {
            if (!this.str.startsWith('//')) this.str = '// ' + this.str
        }
        this.params = ParseFunctionParams(newFunctionStr)
        this.AssignParams()     // 为参数赋值
    }

    AssignParams() {
        for (const paramIndex in this.params) {
            if (typeof this.params[paramIndex] === 'number')
                switch (paramIndex) {
                    case '0':
                        this.tableIndex = this.params[paramIndex]
                        break
                    case '1':
                        this.rowIndex = this.params[paramIndex]
                        break
                    default:
                        break
                }
            else if (typeof this.params[paramIndex] === 'string') {
                // 暂时处理第二位参数为undefined的情况
                if (paramIndex == '1') this.rowIndex = 0
            }
            else if (typeof this.params[paramIndex] === 'object' && this.params[paramIndex] !== null) {
                this.data = this.params[paramIndex]
            }
        }
    }

    execute() {
        try {
            switch (this.type) {
                case 'Update':
                    updateRow(this.tableIndex, this.rowIndex, this.data)
                    break
                case 'Insert':
                    const newRowIndex = insertRow(this.tableIndex, this.data)
                    this.rowIndex = newRowIndex
                    break
                case 'Delete':
                    deleteRow(this.tableIndex, this.rowIndex)
                    break
            }
        } catch (err) {
            EDITOR.error('表格操作函数执行错误，请重新生成本轮文本\n错误语句：' + this.str + '\n错误信息：' + err.message);
        }
    }

    format() {
        switch (this.type) {
            case 'Update':
                return `updateRow(${this.tableIndex}, ${this.rowIndex}, ${JSON.stringify(this.data).replace(/\\"/g, '"')})`
            case 'Insert':
                return `insertRow(${this.tableIndex}, ${JSON.stringify(this.data).replace(/\\"/g, '"')})`
            case 'Delete':
                return `deleteRow(${this.tableIndex}, ${this.rowIndex})`
            default:
                return this.str
        }
    }

}

/**
 * 初始化所有表格
 * @returns 所有表格对象数组
 */
export function initAllTable() {
    return USER.tableBaseSetting.tableStructure.map(data => new DERIVED.Table(data.tableName, data.tableIndex, data.columns))
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

/**
 * 检测单个语句是否是执行表格编辑的函数
 * @param {string} str 单个函数执行语句
 * @returns 是那种类型的表格编辑函数
 */
function isTableEditFunction(str) {
    let type = 'Comment'
    let newFunctionStr = ''
    if (str.startsWith("update(") || str.startsWith("updateRow(")) type = 'Update'
    if (str.startsWith("insert(") || str.startsWith("insertRow(")) type = 'Insert'
    if (str.startsWith("delete(") || str.startsWith("deleteRow(")) type = 'Delete'
    if (str.startsWith("update(") || str.startsWith("insert(") || str.startsWith("delete(")) editErrorInfo.functionNameError = true
    if (type !== 'Comment') newFunctionStr = str.replace(/^(insertRow|deleteRow|updateRow|update|insert|delete)\s*/, '').trim()
    return { type, newFunctionStr }
}

/**
 * 解析函数的参数字符串，并返回参数数组
 * @param {string} str 参数字符串
 * @returns 参数数组
 */
function ParseFunctionParams(str) {
    const paramStr = str.replace(/\/\/.*$/, '').trim().replace(/^\(|\)$/g, '');
    const params = splitParams(paramStr)
    // 使用正则表达式匹配对象、字符串、数字
    const newParams = params.map(arg => {
        if (/^{.*}$/.test(arg)) {
            return handleJsonStr(arg); // 替换单引号为双引号后解析对象
        } else if (/^\d+$/.test(arg)) {
            return Number(arg); // 解析数字
        } else {
            return arg.replace(/^['"]|['"]$/g, ''); // 去除字符串的引号
        }
    });
    return newParams
}

/**
 * 分割函数的参数部分
 */
function splitParams(paramStr) {
    let params = [];
    let current = "";
    let inString = false;
    let inObject = 0; // 追踪 `{}` 作用域
    let quoteType = null;

    for (let i = 0; i < paramStr.length; i++) {
        let char = paramStr[i];
        // 处理字符串状态
        if ((char === '"' || char === "'") && paramStr[i - 1] !== '\\') {
            if (!inString) {
                inString = true;
                quoteType = char;
            } else if (char === quoteType) {
                inString = false;
            }
        }
        // 处理对象 `{}` 作用域
        if (char === '{' && !inString) inObject++;
        if (char === '}' && !inString) inObject--;
        // 遇到 `,` 只有在不在字符串和对象里的时候才分割
        if (char === ',' && !inString && inObject === 0) {
            params.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    if (current.trim()) params.push(current.trim()); // 最后一个参数
    return params;
}

/**
 * 处理json格式的字符串
 * @param {string} str json格式的字符串
 * @returns
 */
function handleJsonStr(str) {
    const jsonStr = str.replace(/([{,])\s*(\w+)\s*:/g, '$1"$2":')
    // console.log("asasasa", str);

    return JSON5.parse(jsonStr);
}
