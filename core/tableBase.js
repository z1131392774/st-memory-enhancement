// tableBase.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import { replaceUserTag } from '../utils/stringUtil.js';
import { readonly } from "../utils/utility.js";

const SheetDomain = {
    global: 'global',
    role: 'role',
    chat: 'chat',
}
const SheetType = {
    free: 'free',
    dynamic: 'dynamic',
    fixed: 'fixed',
    static: 'static',
}
const CellAction = {
    editCell: 'editCell',
    insertLeftColumn: 'insertLeftColumn',
    insertRightColumn: 'insertRightColumn',
    insertUpRow: 'insertUpRow',
    insertDownRow: 'insertDownRow',
    deleteSelfColumn: 'deleteSelfColumn',
    deleteSelfRow: 'deleteSelfRow',
    clearSheet: 'clearSheet',
}
const CellType = {
    sheet_origin: 'sheet_origin',
    column_header: 'column_header',
    row_header: 'row_header',
    cell: 'cell',
}
const cellStyle = `
    .sheet-table { border-collapse: collapse; width: max-content; }
    .sheet-cell { border: 1px solid var(--SmartThemeBodyColor); padding: 1px; min-width: 28px; text-align: center; vertical-align: middle; cursor: cell; }
    .sheet-cell-origin { min-width: 20px; min-height: 20px }
    .sheet-header-cell-top { font-weight: bold }
    .sheet-header-cell-left { font-weight: bold }
    .sheet-cell-other { min-width: 50px; border: 1px dashed var(--SmartThemeEmColor); }
`

class SheetBase {
    SheetDomain = SheetDomain;
    SheetType = SheetType;

    constructor() {
        // 以下为基本属性
        this.uid = '';
        this.name = '';
        this.domain = '';
        this.type = SheetType.dynamic;
        this.enable = true;                     // 用于标记是否启用
        this.required = false;                  // 用于标记是否必填
        this.tochat = true;                     // 用于标记是否发送到聊天

        // 以下为持久化数据
        this.cellHistory = [];                  // cellHistory 持久保持，只增不减
        this.hashSheet = [];                    // 每回合的 hashSheet 结构，用于渲染出表格

        // 以下为派生数据
        this.cells = new Map();                 // cells 在每次 Sheet 初始化时从 cellHistory 加载
        this.data = new Proxy({}, {     // 用于存储用户自定义的表格数据
            get: (target, prop) => {
                return this.source.data[prop];
            },
            set: (target, prop, value) => {
                this.source.data[prop] = value;
                return true;
            },
        });
        this._cellPositionCacheDirty = true;    // 用于标记是否需要重新计算 sheetCellPosition
        this.positionCache = new Proxy(new Map(), {
            get: (map, uid) => {
                if (this._cellPositionCacheDirty) {
                    map.clear();
                    this.hashSheet.forEach((row, rowIndex) => {
                        row.forEach((cellUid, colIndex) => {
                            map.set(cellUid, [rowIndex, colIndex]);
                        });
                    });
                    this._cellPositionCacheDirty = false;   // 更新完成，标记为干净
                    console.log('重新计算 positionCache: ', map);
                }
                return map.get(uid);
            },
        });
    }
    get source() {
        return this.cells.get(this.hashSheet[0][0]);
    }

    markPositionCacheDirty() {
        this._cellPositionCacheDirty = true;
        // console.log(`标记 Sheet: ${this.name} (${this.uid}) 的 positionCache 为脏`);
    }

    init(column = 2, row = 2) {
        this.cells = new Map();
        this.cellHistory = [];
        this.hashSheet = [];

        // 初始化 hashSheet 结构
        const r = Array.from({ length: row }, (_, i) => Array.from({ length: column }, (_, j) => {
            let cell = new Cell(this);
            this.cells.set(cell.uid, cell);
            this.cellHistory.push(cell);
            if (i === 0 && j === 0) {
                cell.type = CellType.sheet_origin;
            } else if (i === 0) {
                cell.type = CellType.column_header;
            } else if (j === 0) {
                cell.type = CellType.row_header;
            }
            return cell.uid;
        }));
        this.hashSheet = r;

        return this;
    };

    rebuildHashSheetByValueSheet(valueSheet) {
        const cols = valueSheet[0].length
        const rows = valueSheet.length
        const newHashSheet = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => {
            const cell = new Cell(this);
            this.cells.set(cell.uid, cell);
            this.cellHistory.push(cell);
            cell.data.value = valueSheet[i][j] || ''; // 设置单元格的值
            if (i === 0 && j === 0) {
                cell.type = CellType.sheet_origin;
            } else if (i === 0) {
                cell.type = CellType.column_header;
            } else if (j === 0) {
                cell.type = CellType.row_header;
            }
            return cell.uid;
        }));
        this.hashSheet = newHashSheet
        return this
    }

    loadCells() {
        // 从 cellHistory 遍历加载 Cell 对象
        try {
            this.cells = new Map(); // 初始化 cells Map
            this.cellHistory?.forEach(c => { // 从 cellHistory 加载 Cell 对象
                const cell = new Cell(this);
                Object.assign(cell, c);
                this.cells.set(cell.uid, cell);
            });
        } catch (e) {
            console.error(`加载失败：${e}`);
            return false;
        }

        // 加载后，根据 hashSheet 结构重新初始化所有 Cell
        try {
            if (this.hashSheet && this.hashSheet.length > 0) {
                // 如果 hashSheet 只有一行，说明没有数据，只初始化表头行
                if (this.hashSheet.length === 1) {
                    this.hashSheet[0].forEach(hash => {
                        const cell = this.cells.get(hash);
                        this.cells.set(cell.uid, cell);
                    });
                }
                // 如果 hashSheet 有数据，遍历 hashSheet，初始化每一个 Cell
                this.hashSheet.forEach((rowUids, rowIndex) => {
                    rowUids.forEach((cellUid, colIndex) => {
                        const cell = this.cells.get(cellUid);
                        if (cell) {
                            if (rowIndex === 0 && colIndex === 0) {
                                cell.type = CellType.sheet_origin;
                            } else if (rowIndex === 0) {
                                cell.type = CellType.column_header;
                            } else if (colIndex === 0) {
                                cell.type = CellType.row_header;
                            } else {
                                cell.type = CellType.cell; // 默认单元格类型
                            }
                        }
                    });
                });
            }
        } catch (e) {
            console.error(`加载失败：${e}`);
            return false;
        }
    }

    findCellByValue(value) {
        const cell = this.cellHistory.find(cell => cell.data.value === value);
        if (!cell) {
            return null;
        }
        return cell;
    }

    findCellByPosition(rowIndex, colIndex) {
        if (rowIndex < 0 || colIndex < 0 || rowIndex >= this.hashSheet.length || colIndex >= this.hashSheet[0].length) {
            console.warn('无效的行列索引');
            return null;
        }
        const hash = this.hashSheet[rowIndex][colIndex]
        const target = this.cells.get(hash) || null;
        if (!target) {
            console.warn(`未找到单元格 ${rowIndex} ${colIndex} ${hash}`);
            return null;
        }
        return target;
    }
    /**
     * 通过行号获取行的所有单元格
     * @param {number} rowIndex
     * @returns cell[]
     */
    getCellsByRowIndex(rowIndex) {
        if (rowIndex < 0 || rowIndex >= this.hashSheet.length) {
            console.warn('无效的行索引');
            return null;
        }
        return this.hashSheet[rowIndex].map(uid => this.cells.get(uid));
    }
    /**
     * 获取表格csv格式的内容
     * @returns
     */
    getSheetCSV( removeHeader = true,key = 'value') {
        if (this.isEmpty())
            if (this.required) return this.source.initNode;
            else return '';
        console.log("测试获取map", this.cells)
        const content = this.hashSheet.slice(removeHeader?1:0).map((row, index) => row.map(cellUid => {
            const cell = this.cells.get(cellUid)
            if (!cell) return
            return cell.type === CellType.row_header ? index : cell.data[key]
        }).join(',')).join('\n');
        return content + "\n";
    }
    /**
     * 表格是否为空
     * @returns 是否为空
     */
    isEmpty() {
        return this.hashSheet.length <= 1;
    }

    filterSavingData() {
        return filterSavingData(this)
    }

    getRowCount() {
        return this.hashSheet.length;
    }
}

export class SheetTemplate extends SheetBase {
    constructor(target = null) {
        super();
        this.domain = this.SheetDomain.global
        this.currentPopupMenu = null;           // 用于跟踪当前弹出的菜单 - 移动到 Sheet (如果需要PopupMenu仍然在Sheet中管理)
        this.element = null;                    // 用于存储渲染后的 table 元素
        this.lastCellEventHandler = null;       // 保存最后一次使用的 cellEventHandler

        this.#load(target);
    }

    /**
     * 渲染表格
     * @description 接受 cellEventHandler 参数，提供一个 `Cell` 对象作为回调函数参数，用于处理单元格事件
     * @description 可以通过 `cell.parent` 获取 Sheet 对象，因此不再需要传递 Sheet 对象
     * @description 如果不传递 cellEventHandler 参数，则使用上一次的 cellEventHandler
     * @param {Function} cellEventHandler
     * */
    renderSheet(cellEventHandler = this.lastCellEventHandler) {
        this.lastCellEventHandler = cellEventHandler;

        if (!this.element) {
            this.element = document.createElement('table');
            this.element.classList.add('sheet-table', 'tableDom');
            this.element.style.position = 'relative';
            this.element.style.display = 'flex';
            this.element.style.flexDirection = 'column';
            this.element.style.flexGrow = '0';
            this.element.style.flexShrink = '1';

            const styleElement = document.createElement('style');
            styleElement.textContent = cellStyle;
            this.element.appendChild(styleElement);
        }

        // 确保 element 中有 tbody，没有则创建
        let tbody = this.element.querySelector('tbody');
        if (!tbody) {
            tbody = document.createElement('tbody');
            this.element.appendChild(tbody);
        }
        // 清空 tbody 的内容
        tbody.innerHTML = '';

        // 遍历 hashSheet，渲染每一个单元格
        this.hashSheet.forEach((rowUids, rowIndex) => {
            if (rowIndex > 0) return;
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                const cell = this.cells.get(cellUid)
                const cellElement = cell.initCellRender(rowIndex, colIndex);
                rowElement.appendChild(cellElement);    // 调用 Cell 的 initCellRender 方法，仍然需要传递 rowIndex, colIndex 用于渲染单元格内容
                if (cellEventHandler) {
                    cellEventHandler(cell);
                }
            });
            tbody.appendChild(rowElement); // 将 rowElement 添加到 tbody 中
        });
        return this.element;
    }

    createNewTemplate(column = 2, row = 2, isSave = true) {
        this.init(column, row); // 初始化基本数据结构
        this.uid = `template_${SYSTEM.generateRandomString(8)}`;
        this.name = `新模板_${this.uid.slice(-4)}`;
        this.loadCells();
        isSave && this.save(); // 保存新创建的 Sheet
        return this; // 返回 Sheet 实例自身
    }

    /**
     * 保存表格数据
     * @returns {SheetTemplate}
     */
    save() {
        let templates = BASE.templates;
        if (!templates) templates = [];
        try {
            const sheetDataToSave = this.filterSavingData();
            if (templates.some(t => t.uid === sheetDataToSave.uid)) {
                templates = templates.map(t => t.uid === sheetDataToSave.uid ? sheetDataToSave : t);
            } else {
                templates.push(sheetDataToSave);
            }
            console.log("保存模板数据", templates)
            USER.getSettings().table_database_templates = templates;
            USER.saveSettings();
            return this;
        } catch (e) {
            EDITOR.error(`保存模板失败：${e}`);
            return null;
        }
    }
    /**
     * 删除表格数据，根据 domain 决定删除的位置
     * @returns {*}
     */
    delete() {
        let templates = BASE.templates;
        USER.getSettings().table_database_templates = templates.filter(t => t.uid !== this.uid);
        USER.saveSettings();
        return templates;
    }

    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */

    #load(target) {
        if (target === null) {
            // 创建一个新的空 Sheet
            this.init();
            return this;
        }
        if (target instanceof Sheet) {
            // 从 Sheet 实例模板化
            this.uid = `template_${SYSTEM.generateRandomString(8)}`;
            this.name = target.name.replace('表格', '模板');
            this.hashSheet = [target.hashSheet[0]];
            this.cellHistory = target.cellHistory.filter(c => this.hashSheet[0].includes(c.uid));
            this.loadCells();
            this.markPositionCacheDirty();
            return this;
        } else {
            // 从模板库中加载
            let targetUid = target?.uid || target;
            let targetSheetData = BASE.templates?.find(t => t.uid === targetUid);
            if (targetSheetData?.uid) {
                Object.assign(this, targetSheetData);
                this.loadCells();
                this.markPositionCacheDirty();
                return this;
            }

            throw new Error('未找到对应的模板');
        }
    }

}

/**
 * 表格类，用于管理表格数据
 * @description 表格类用于管理表格数据，包括表格的名称、域、类型、单元格数据等
 * @description 表格类还提供了对表格的操作，包括创建、保存、删除、渲染等
 */
export class Sheet extends SheetBase {
    constructor(target = null) {
        super(target);

        this.currentPopupMenu = null;           // 用于跟踪当前弹出的菜单 - 移动到 Sheet (如果需要PopupMenu仍然在Sheet中管理)
        this.element = null;                    // 用于存储渲染后的 table 元素
        this.lastCellEventHandler = null;       // 保存最后一次使用的 cellEventHandler
        this.template = null;       // 用于存储模板
        this.#load(target);
    }

    /**
     * 渲染表格
     * @description 接受 cellEventHandler 参数，提供一个 `Cell` 对象作为回调函数参数，用于处理单元格事件
     * @description 可以通过 `cell.parent` 获取 Sheet 对象，因此不再需要传递 Sheet 对象
     * @description 如果不传递 cellEventHandler 参数，则使用上一次的 cellEventHandler
     * @param {Function} cellEventHandler
     * */
    renderSheet(cellEventHandler = this.lastCellEventHandler) {
        this.lastCellEventHandler = cellEventHandler;

        if (!this.element) {
            this.element = document.createElement('table');
            this.element.classList.add('sheet-table', 'tableDom');
            this.element.style.position = 'relative';
            this.element.style.display = 'flex';
            this.element.style.flexDirection = 'column';
            this.element.style.flexGrow = '0';
            this.element.style.flexShrink = '1';

            const styleElement = document.createElement('style');
            styleElement.textContent = cellStyle;
            this.element.appendChild(styleElement);
        }

        // 确保 element 中有 tbody，没有则创建
        let tbody = this.element.querySelector('tbody');
        if (!tbody) {
            tbody = document.createElement('tbody');
            this.element.appendChild(tbody);
        }
        // 清空 tbody 的内容
        tbody.innerHTML = '';

        // 遍历 hashSheet，渲染每一个单元格
        this.hashSheet.forEach((rowUids, rowIndex) => {
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                const cell = this.cells.get(cellUid)
                const cellElement = cell.initCellRender(rowIndex, colIndex);
                rowElement.appendChild(cellElement);    // 调用 Cell 的 initCellRender 方法，仍然需要传递 rowIndex, colIndex 用于渲染单元格内容
                if (cellEventHandler) {
                    cellEventHandler(cell);
                }
            });
            tbody.appendChild(rowElement); // 将 rowElement 添加到 tbody 中
        });
        return this.element;
    }

    /**
     * 保存表格数据
     * @returns {Sheet|boolean}
     */
    save(targetPiece = USER.getChatPiece(), manualSave = false) {
        const sheetDataToSave = this.filterSavingData()
        sheetDataToSave.template = this.template?.uid;

        let sheets = BASE.sheetsData.context ?? [];
        try {
            if (sheets.some(t => t.uid === sheetDataToSave.uid)) {
                sheets = sheets.map(t => t.uid === sheetDataToSave.uid ? sheetDataToSave : t);
            } else {
                sheets.push(sheetDataToSave);
            }
            BASE.sheetsData.context = sheets;
            if( !targetPiece ){
                console.log("没用消息能承载hash_sheets数据，不予保存")
                return this
            }
            if (!targetPiece.hash_sheets) targetPiece.hash_sheets = {};
            targetPiece.hash_sheets[this.uid] = this.hashSheet?.map(row => row.map(hash => hash));
            console.log('保存表格数据', targetPiece, this.hashSheet);
            if (!manualSave) USER.saveChat();
            return this;
        } catch (e) {
            EDITOR.error(`保存模板失败：${e}`);
            return false;
        }
    }

    /**
     * 创建新的 Sheet 实例
     * @returns {Sheet} - 返回新的 Sheet 实例
     */
    async createNewSheet(column = 2, row = 2, isSave = true) {
        this.init(column, row);     // 初始化基本数据结构
        this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
        this.name = `新表格_${this.uid.slice(-4)}`;
        if (isSave) this.save();    // 保存新创建的 Sheet
        return this;                // 返回 Sheet 实例自身
    }

    /**
     * 获取表格内容的提示词，可以通过指定['title', 'node', 'headers', 'rows', 'editRules']中的部分，只获取部分内容
     * @returns 表格内容提示词
     */
    getTableText(customParts = ['title', 'node', 'headers', 'rows', 'editRules']) {
        console.log('获取表格内容提示词', this)
        const title = `* ${this.name}:${replaceUserTag(this.name)}\n`;
        const node = this.source.data.note && this.source.data.note !== '' ? '【说明】' + this.source.data.note + '\n' : '';
        const headers = "rowIndex," + this.getCellsByRowIndex(0).slice(1).map((cell, index) => index + ':' + replaceUserTag(cell.data.value)).join(',') + '\n';
        const rows = this.getSheetCSV()
        const editRules = this.#getTableEditRules() + '\n';

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
    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */

    #load(target) {
        if (target === null) {
            return this;
        }
        if (target.domain === SheetDomain.global) {
            this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
            this.name = target.name.replace('模板', '表格');
            this.hashSheet = [target.hashSheet[0].map(uid => uid)];
            this.cellHistory = target.cellHistory.filter(c => this.hashSheet[0].includes(c.uid));
            this.loadCells();
            this.markPositionCacheDirty();
            this.template = target;
            return
        }
        let targetUid = target?.uid || target;
        let targetSheetData = BASE.sheetsData.context?.find(t => t.uid === targetUid);
        if (targetSheetData?.uid) {
            Object.assign(this, filterSavingData(targetSheetData));
            this.loadCells();
            this.markPositionCacheDirty();
            return this;
        }
        console.log(`未找到对应的模板`, target)
        throw new Error('未找到对应的模板');
    }
    /**
     * 获取表格编辑规则提示词
     * @returns
     */
    #getTableEditRules() {
        const source = this.source;
        if (this.required && this.isEmpty()) return '【增删改触发条件】\n插入：' + replaceUserTag(source.data.initNode) + '\n'
        else {
            let editRules = '【增删改触发条件】\n'
            if (source.data.insertNode) editRules += ('插入：' + replaceUserTag(source.data.insertNode) + '\n')
            if (source.data.updateNode) editRules += ('更新：' + replaceUserTag(source.data.updateNode) + '\n')
            if (source.data.deleteNode) editRules += ('删除：' + replaceUserTag(source.data.deleteNode) + '\n')
            return editRules
        }
    }
}


/**
 * 单元格类，用于管理表格中的单元格数据
 * @description 单元格类用于管理表格中的单元格数据，包括单元格的位置、值、状态、类型等
 * @description 单元格类还提供了对单元格的操作，包括编辑、插入、删除等
 * @description 单元格类是 Sheet 类的子类，用于管理 Sheet 中的单元格数据
 */
class Cell {
    CellType = CellType;
    CellAction = CellAction;

    constructor(parent, target = null) {
        this.uid = undefined;
        this.parent = parent;

        this.type = '';
        this.status = '';
        this.coordUid = undefined; // 用于存储单元格的坐标 uid
        // this.targetUid = undefined;
        this.element = null;
        this.data = new Proxy({}, {
            get: (target, prop) => {
                return target[prop];
            },
            set: (target, prop, value) => {
                this.editCellData({ prop, value });
                return true;
            },
        });

        this.customEventListeners = {}; // 存储自定义事件监听器，key 为事件名 (CellAction 或 '')，value 为回调函数
        this.#init(target);
    }

    get position() {
        return this.#positionInParentCellSheet();
    }
    get headerX() {
        const p = this.#positionInParentCellSheet();
        const targetUid = this.parent.hashSheet[p[0]][0];   // 获取当前单元格所在行的第一个单元格的 uid
        return this.parent.cells.get(targetUid);
    }
    get headerY() {
        const p = this.#positionInParentCellSheet();
        const targetUid = this.parent.hashSheet[0][p[1]];   // 获取当前单元格所在列的第一个单元格的 uid
        return this.parent.cells.get(targetUid);
    }

    newAction(actionName, props, isSave = true) {
        this.#event(actionName, props, isSave);
    }
    /* newActions(actionList) {
        for (const action of actionList) {
            this.#event(action.type, { value: action.value }, [action.rowIndex, action.colIndex], false);
        }
        this.parent.renderSheet(this.parent.lastCellEventHandler);
        this.parent.save();
    } */
    editCellData(props) {
        this.#event(CellAction.editCell, props);
    }
    initCellRender(rowIndex = -1, colIndex = -1) {
        this.element = document.createElement('td');
        this.element.className = 'sheet-cell';
        this.renderCell(rowIndex, colIndex);

        return this.element;
    }
    renderCell(rowIndex = -1, colIndex = -1) {
        if (rowIndex === -1 && colIndex === -1) {
            [rowIndex, colIndex] = this.#positionInParentCellSheet();
        }

        // 使用 instanceof 获取 this.parent 是 Sheet类 还是 SheetTemplate类
        if (this.parent instanceof SheetTemplate) {
            if (rowIndex === 0 && colIndex === 0) {
                this.element.classList.add('sheet-cell-origin');
            } else if (rowIndex === 0) {
                this.element.textContent = this.data.value || getColumnLetter(colIndex - 1); // Column headers (A, B, C...)
                this.element.classList.add('sheet-header-cell-top');
            } else if (colIndex === 0) {
                if (this.parent.type === SheetType.dynamic || this.parent.type === SheetType.fixed) {
                    this.element.textContent = 'i'
                } else {
                    this.element.textContent = this.data.value || rowIndex; // Row headers (1, 2, 3...)
                }
                this.element.classList.add('sheet-header-cell-left');
            } else {
                if (this.parent.type === SheetType.static) {
                    const pos = [getColumnLetter(colIndex - 1), rowIndex].join(''); // Cell position (A1, B2, C3...)
                    this.element.textContent = this.data.value || pos; // 显示单元格值，默认为位置
                    this.element.style.fontSize = '0.8rem';
                    this.element.style.fontWeight = 'normal';
                    this.element.style.color = 'var(--SmartThemeEmColor)'
                } else {
                    this.element.style.cursor = 'not-allowed';
                }
                this.element.classList.add('sheet-cell-other');
            }
        } else if (this.parent instanceof Sheet) {
            if (rowIndex === 0 && colIndex === 0) {
                // this.element.textContent = 0;
                this.element.classList.add('sheet-cell-origin');
                // this.element.style.border = 'none';
                // this.element.style.outline = 'none';
                this.element.style.color = 'var(--SmartThemeEmColor)';
                this.element.style.fontWeight = 'normal';
            } else if (rowIndex === 0) {
                this.element.textContent = this.data.value || ''; // Column headers (A, B, C...)
                this.element.classList.add('sheet-header-cell-top');
            } else if (colIndex === 0) {
                this.element.textContent = this.data.value || rowIndex; // Row headers (1, 2, 3...)
                this.element.classList.add('sheet-header-cell-left');
                // this.element.style.border = 'none';
                // this.element.style.outline = 'none';
                this.element.style.color = 'var(--SmartThemeEmColor)';
                this.element.style.fontWeight = 'normal';
            } else {
                this.element.textContent = this.data.value || '';
                this.element.classList.add('sheet-cell-other');
                this.element.style.color = 'var(--SmartThemeEmColor)';
            }
        }
    }
    /**
     * 监听事件
     * @description 监听事件，支持监听所有事件、特定 CellAction 事件、原生 DOM 事件
     * @description 如果 event 为 `''` 字符串，则监听所有事件
     * @description 如果 event 是 `CellAction` 事件，则监听特定的 CellAction 事件
     * @description 如果 event 是原生 `DOM` 事件，则监听原生 DOM 事件
     * @param event
     * @param callback
     */
    on(event, callback) {
        if (typeof callback !== 'function') throw new Error('回调函数必须是一个函数');
        if (event === '') {
            if (!this.customEventListeners['']) {
                this.customEventListeners[''] = []; // 初始化为数组
            }
            this.customEventListeners[''].push(callback);           // 监听所有 #event 事件
        } else if (CellAction[event]) {
            if (!this.customEventListeners[event]) {
                this.customEventListeners[event] = []; // 初始化为数组
            }
            this.customEventListeners[event].push(callback);        // 监听特定的 CellAction 事件
        } else {
            try {
                this.element.addEventListener(event, callback); // 监听原生 DOM 事件
            } catch (e) {
                throw new Error(`无法监听事件: ${event}`);
            }
        }
    }

    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */
    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */
    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */

    bridge = {

    }
    #init(target) {
        let targetUid = target?.uid || target;
        let targetCell = {};
        if (targetUid) {
            if (target.uid === targetUid) {
                targetCell = target;
            }
            else {
                targetCell = this.parent.cells.get(targetUid);
            }
            if (!targetCell) {
                throw new Error(`未找到单元格，UID: ${targetUid}`);
            }
        }
        this.uid = targetCell.uid || `cell_${this.parent.uid.split('_')[1]}_${SYSTEM.generateRandomString(16)}`;
        this.coordUid = targetCell.coordUid || `coo_${SYSTEM.generateRandomString(15)}`;
        this.type = targetCell.type || CellType.cell;
        this.status = targetCell.status || '';
        this.element = targetCell.element || null;
        this.targetUid = targetCell.targetUid || '';
        this.data = targetCell.data || {};
        this.element = document.createElement('td');
    }
    #positionInParentCellSheet() {
        return this.parent.positionCache[this.uid] || [-1, -1];
    }

    #event(actionName, props = {}, isSave = true) {
        const [rowIndex, colIndex] = this.#positionInParentCellSheet();
        switch (actionName) {
            case CellAction.editCell:
                this.#handleEditCell(props);
                break;
            case CellAction.insertLeftColumn:
                if (colIndex <= 0) return;
                this.#insertColumn(colIndex - 1);
                break;
            case CellAction.insertRightColumn:
                this.#insertColumn(colIndex);
                break;
            case CellAction.insertUpRow:
                if (rowIndex <= 0) return;
                this.#insertRow(rowIndex - 1);
                break;
            case CellAction.insertDownRow:
                this.#insertRow(rowIndex);
                break;
            case CellAction.deleteSelfColumn:
                if (colIndex <= 0) return;
                this.#deleteColumn(colIndex);
                break;
            case CellAction.deleteSelfRow:
                if (rowIndex <= 0) return;
                this.#deleteRow(rowIndex);
                break;
            case CellAction.clearSheet:
                this.#clearSheet();
                break;
            default:
                console.warn(`未处理的单元格操作: ${actionName}`);
        }

        // 触发自定义事件监听器
        if (this.customEventListeners[actionName]) {
            this.customEventListeners[actionName].forEach(callback => { // 遍历执行数组中的回调函数
                callback(this, actionName, props); // 传递 cell 实例, actionName, 和 props
            });
        }
        if (this.customEventListeners['']) {
            this.customEventListeners[''].forEach(callback => { // 遍历执行数组中的回调函数
                callback(this, actionName, props); // 监听所有事件的监听器
            });
        }
        if (isSave) {
            this.parent.save();
        }

        console.log(`单元格操作: ${actionName} 位置: ${[rowIndex, colIndex]}`);
    }
    #handleEditCell(props = {}) {
        if (!props || Object.keys(props).length === 0) {
            console.warn('未提供任何要修改的属性');
            return;
        }
        let cell = new Cell(this.parent);
        cell.coordUid = this.coordUid;
        cell.data = { ...this.data, ...props };
        const [rowIndex, colIndex] = this.#positionInParentCellSheet()
        this.parent.cells.set(cell.uid, cell);
        console.log("保存前的 cell", this.parent.cellHistory);
        this.parent.cellHistory.push(cell);
        this.parent.hashSheet[rowIndex][colIndex] = cell.uid;
        this.parent.markPositionCacheDirty();
    }

    #insertRow(targetRowIndex) {
        // 使用Array.from()方法在 hashSheet 中 targetRowIndex + 1 的位置插入新行
        const newRow = Array.from({ length: this.parent.hashSheet[0].length }, (_, j) => {
            let cell = new Cell(this.parent); // [BUG修复点1] 使用 this.parent
            this.parent.cells.set(cell.uid, cell);
            this.parent.cellHistory.push(cell);
            return cell.uid;
        });
        this.parent.hashSheet.splice(targetRowIndex + 1, 0, newRow);
        this.parent.markPositionCacheDirty();
    }
    #insertColumn(colIndex) {
        // 遍历每一行，在指定的 colIndex 位置插入新的单元格 UID
        this.parent.hashSheet = this.parent.hashSheet.map(row => {
            const newCell = new Cell(this.parent);
            this.parent.cells.set(newCell.uid, newCell);
            this.parent.cellHistory.push(newCell);
            row.splice(colIndex + 1, 0, newCell.uid);
            return row;
        });
        this.parent.markPositionCacheDirty();
    }
    #deleteRow(rowIndex) {
        console.log("删除行", rowIndex, this.parent.hashSheet.length)
        if (rowIndex === 0) return;
        if (this.parent.hashSheet.length <= 2) return;
        this.parent.hashSheet.splice(rowIndex, 1);
        this.parent.markPositionCacheDirty();
    }
    #deleteColumn(colIndex) {
        if (colIndex === 0) return;
        if (this.parent.hashSheet[0].length <= 2) return;
        this.parent.hashSheet = this.parent.hashSheet.map(row => {
            row.splice(colIndex, 1);
            return row;
        });
        this.parent.markPositionCacheDirty();
    }
    #clearSheet() {
        throw new Error('未实现的方法');
    }
}

// Helper function to convert column index to letter (A, B, C...)
export function getColumnLetter(colIndex) {
    let letter = '';
    let num = colIndex;
    while (num >= 0) {
        letter = String.fromCharCode('A'.charCodeAt(0) + (num % 26)) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
}

function filterSavingData(sheet) {
    return {
        uid: sheet.uid,
        name: sheet.name,
        domain: sheet.domain,
        type: sheet.type,
        enable: sheet.enable,
        required: sheet.required,
        tochat: sheet.tochat,
        hashSheet: sheet.hashSheet, // 保存 hashSheet (只包含 cell uid)
        cellHistory: sheet.cellHistory.map((
            {
                parent,
                element,
                customEventListeners,
                ...filter
            }) => {
            return filter;
        }), // 保存 cellHistory (不包含 parent)
    };
}
