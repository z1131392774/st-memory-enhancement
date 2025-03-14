import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import JSON5 from '../utils/json5.min.mjs'
import {findTableStructureByIndex} from "../index.js";

/**
 * 表格类
 */
export class Table {
    constructor(tableName, tableIndex, columns, content = [], insertedRows = [], updatedRows = []) {
        this.tableName = tableName;
        this.tableIndex = tableIndex;
        this.columns = Array.isArray(columns) ? columns.map(col => String(col)) : [];
        this.content = content;
        this.insertedRows = insertedRows;
        this.updatedRows = updatedRows;
        this.cellClickCallback = null; // Store the callback function
        this.cellData = null; // Store the data of the clicked cell
    }

    /**
     * 清空插入或更新记录
     */
    clearInsertAndUpdate() {
        this.insertedRows = []
        this.updatedRows = []
    }

    /**
     * 获取表格内容的提示词，可以通过指定['title', 'node', 'headers', 'rows', 'editRules']中的部分，只获取部分内容
     * @returns 表格内容提示词
     */
    getTableText(customParts = ['title', 'node', 'headers', 'rows', 'editRules']) {
        const structure = findTableStructureByIndex(this.tableIndex);
        if (!structure) return;

        const title = `* ${this.tableIndex}:${replaceUserTag(this.tableName)}\n`;
        const node = structure.note && structure.note !== '' ? '【说明】' + structure.note + '\n' : '';
        const headers = "rowIndex," + this.columns.map((colName, index) => index + ':' + replaceUserTag(colName)).join(',') + '\n';
        const newContent = this.content.filter(Boolean);
        const rows = newContent.length > 0 ? (newContent.map((row, index) => index + ',' + row.join(',')).join('\n') + '\n') : getEmptyTablePrompt(structure.Required, replaceUserTag(structure.initNode));
        const editRules = getTableEditRules(structure, newContent.length === 0) + '\n';

        let result = '';

        if (customParts.includes('title')) {
            result += title;
        }
        if (customParts.includes('node')) {
            result += node;
        }
        if (customParts.includes('headers')) {
            result += '【表格内容】\n' + headers;
        }
        if (customParts.includes('rows')) {
            result += rows;
        }
        if (customParts.includes('editRules')) {
            result += editRules;
        }

        return result;
    }

    /**
     * 插入一行数据
     * @param {object} data
     */
    insert(data) {
        const newRow = new Array(this.columns.length).fill("");
        Object.entries(data).forEach(([key, value]) => {
            const colIndex = parseInt(key);
            if (colIndex < this.columns.length) { // 防止越界
                newRow[colIndex] = handleCellValue(value);
            }
        });
        const newRowIndex = this.content.length; // 直接使用当前长度作为新索引
        this.content.push(newRow);
        this.insertedRows.push(newRowIndex);
        return newRowIndex;
    }

    /**
     * 插入一个空行
     * @param {number} rowIndex 插入空行的索引
     */
    insertEmptyRow(rowIndex) {
        this.content.splice(rowIndex, 0, this.getEmptyRow())
    }

    /**
     * 获取一个空行
     * @returns 一个空行
     */
    getEmptyRow() {
        return this.columns.map(() => '')
    }

    /**
     * 更新单个行的内容
     * @param {number} rowIndex 需要更新的行索引
     * @param {object} data 需要更新的数据
     */
    update(rowIndex, data) {
        const row = this.content[rowIndex]
        if (!row) return this.insert(data)
        Object.entries(data).forEach(([key, value]) => {
            if (key >= this.columns.length) return
            row[key] = handleCellValue(value)
            this.updatedRows.push(`${rowIndex}-${key}`)
        })
    }

    /**
     * 删除单个行
     * @param {number} rowIndex 删除单个行的索引
     */
    delete(rowIndex) {
        this.content[rowIndex] = null
    }

    /**
     * 清除空行
     */
    clearEmpty() {
        this.content = this.content.filter(Boolean)
    }

    /**
     * 获取某个单元格的值
     * @param {number} rowIndex 行索引
     * @param {number} colIndex 列索引
     * @returns 此单元格的值
     */
    getCellValue(rowIndex, colIndex) {
        return this.content[rowIndex][colIndex]
    }

    /**
     * 设置某个单元格的值
     * @param {number} rowIndex 行索引
     * @param {number} colIndex 列索引
     * @param {any} value 需要设置的值
     */
    setCellValue(rowIndex, colIndex, value) {
        this.content[rowIndex][colIndex] = handleCellValue(value)
    }

    /**
     * 干运行
     * @param {TableEditAction[]} actions 需要执行的编辑操作
     */
    dryRun(actions) {
        this.clearInsertAndUpdate()
        let nowRowIndex = this.content.length
        for (const action of actions) {
            if (action.tableIndex !== this.tableIndex) continue
            if (action.type === 'Insert') {
                action.rowIndex = nowRowIndex
                this.insertedRows.push(nowRowIndex)
                nowRowIndex++
            } else if (action.type === 'Update') {
                const updateData = action.data
                for (const colIndex in updateData) {
                    this.updatedRows.push(`${action.rowIndex}-${colIndex}`)
                }
            }
        }
    }

    /**
     * 单元格点击事件注册
     * @param {function} callback 点击单元格后的回调函数，参数为{rowIndex, colIndex, cellContent}
     */
    cellClickEvent(callback) {
        this.cellClickCallback = callback;
    }

    /**
     * 把表格数据渲染成DOM元素
     * @returns DOM容器元素
     */
    render() {
        const container = document.createElement('div')
        container.classList.add('justifyLeft')
        container.classList.add('scrollable')
        const title = document.createElement('h3')
        title.innerText = replaceUserTag(this.tableName)
        const table = document.createElement('table')
        table.classList.add('tableDom')
        const thead = document.createElement('thead')
        const titleTr = document.createElement('tr')
        this.columns.forEach((colName, colIndex) => { // Added colIndex here
            const th = document.createElement('th');
            $(th).data("tableData", this.tableIndex + '-0-0');
            th.innerText = replaceUserTag(colName);
            // Add click event listener to header cells (<th>)
            th.onclick = () => {
                if (this.cellClickCallback) {
                    this.cellClickCallback({
                        rowIndex: -1, // Use -1 to indicate header row
                        colIndex: colIndex,
                        cellContent: colName // Or th.innerText if you prefer
                    });
                }
            };
            titleTr.appendChild(th);
        });
        thead.appendChild(titleTr)
        table.appendChild(thead)
        const tbody = document.createElement('tbody')
        for (let rowIndex in this.content) {
            const tr = document.createElement('tr')
            for (let cellIndex in this.content[rowIndex]) {
                const td = document.createElement('td')
                $(td).data("tableData", this.tableIndex + '-' + rowIndex + '-' + cellIndex)
                td.innerText = this.content[rowIndex][cellIndex]
                if (this.updatedRows && this.updatedRows.includes(rowIndex + '-' + cellIndex)) $(td).css('background-color', 'rgba(0, 98, 128, 0.2)')
                // Add click event listener to data cells (<td>) - already present, keeping it
                td.onclick = () => {
                    if (this.cellClickCallback) {
                        this.cellClickCallback({
                            rowIndex: parseInt(rowIndex),
                            colIndex: parseInt(cellIndex),
                            cellContent: this.content[rowIndex][cellIndex]
                        });
                    }
                };
                tr.appendChild(td)
            }
            if (this.insertedRows && this.insertedRows.includes(parseInt(rowIndex))) {
                $(tr).css('background-color', 'rgba(0, 128, 0, 0.2)')
            }
            tbody.appendChild(tr)
        }
        table.appendChild(tbody)
        container.appendChild(title)
        container.appendChild(table)
        return container
    }
}

/**
 * 获取表格为空时的提示词
 * @param {boolean} Required 此表格是否为必填表格
 * @param {string} node 此表格的初始化提示词
 * @returns
 */
function getEmptyTablePrompt(Required, node) {
    return '（此表格为空' + (Required ? (node ? ('，' + node) : '') : '') + '）\n'
}

/**
 * 获取表格编辑规则提示词
 * @param {Structure} structure 表格结构信息
 * @param {boolean} isEmpty 表格是否为空
 * @returns
 */
function getTableEditRules(structure, isEmpty) {
    if (structure.Required && isEmpty) return '【增删改触发条件】\n插入：' + replaceUserTag(structure.initNode) + '\n'
    else {
        let editRules = '【增删改触发条件】\n'
        if (structure.insertNode) editRules += ('插入：' + replaceUserTag(structure.insertNode) + '\n')
        if (structure.updateNode) editRules += ('更新：' + replaceUserTag(structure.updateNode) + '\n')
        if (structure.deleteNode) editRules += ('删除：' + replaceUserTag(structure.deleteNode) + '\n')
        return editRules
    }
}

/**
 * 替换字符串中的user标签
 */
function replaceUserTag(str) {
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
