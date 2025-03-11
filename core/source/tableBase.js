// tableBase.js
import { BASE, DERIVED, EDITOR, SYSTEM, USER } from '../manager.js';
import {readonly} from "../../utils/utility.js";

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

/**
 * 表格类，用于管理表格数据
 * @description 表格类用于管理表格数据，包括表格的名称、域、类型、单元格数据等
 * @description 表格类还提供了对表格的操作，包括创建、保存、删除、渲染等
 */
export class Sheet {
    SheetDomain = SheetDomain;
    SheetType = SheetType;
    constructor(target = null, asTemplate = false) {
        this.uid = '';
        this.name = '';
        this.domain = SheetDomain.global;
        this.type = SheetType.dynamic;
        this.asTemplate = asTemplate || false;  // 优先使用传入的 asTemplate 参数，否则使用 target 中的 asTemplate

        this.cells = new Map(); // cells 在每次 Sheet 初始化时从 cellHistory 加载
        this.cellHistory = []; // cellHistory 持久保持，只增不减
        this.cellSheet = [];
        this.currentPopupMenu = null;       // 用于跟踪当前弹出的菜单 - 移动到 Sheet (如果需要PopupMenu仍然在Sheet中管理)
        this.tableElement = null;           // 用于存储渲染后的 table 元素
        this.lastCellEventHandler = null;   // 保存最后一次使用的 cellEventHandler

        if (target?.asTemplate === true) {
            this.asTemplate = true;
        }

        this.#load(target);
    }

    /**
     * 创建新的 Sheet 实例
     * @param {Sheet} [template] - 可选的模板 Sheet 实例，用于从模板创建新表格
     * @returns {Sheet} - 返回新的 Sheet 实例
     */
    createNew(template) {
        if (template && template.asTemplate === false) {
            throw new Error('无法使用非模板表格创建新表格'); // 错误：尝试使用非模板创建
        }

        if (template) {
            return this.#createFromTemplate(template); // 从模板创建
        } else {
            return this.#createNewEmpty(); // 创建空表格或模板
        }
    }
    save() {
        if (this.asTemplate === false) {
            throw new Error('表格保存逻辑未实现');
        } else {
            let templates = BASE.loadUserAllTemplates();
            if (!templates) templates = [];
            try {
                const sheetDataToSave = {
                    uid: this.uid,
                    name: this.name,
                    domain: this.domain,
                    type: this.type,
                    asTemplate: this.asTemplate,
                    cellHistory: this.cellHistory.map(cell => { // 保存 cellHistory
                        const { parent, ...cellData } = cell;
                        return cellData;
                    }),
                    cellSheet: this.cellSheet, // 保存 cellSheet (只包含 cell uid)
                };

                if (templates.some(t => t.uid === sheetDataToSave.uid)) {
                    templates = templates.map(t => t.uid === sheetDataToSave.uid ? sheetDataToSave : t);
                } else {
                    templates.push(sheetDataToSave);
                }
                USER.getSettings().table_database_templates = templates;
                USER.saveSettings();
                return this;
            } catch (e) {
                EDITOR.error(`保存${this.asTemplate ? '模板' : '表格'}失败：${e}`);
                return false;
            }
        }
    }

    delete() {
        if (!this.asTemplate) {
            throw new Error('表格删除逻辑未实现');
        }
        let templates = BASE.loadUserAllTemplates();
        USER.getSettings().table_database_templates = templates.filter(t => t.uid !== this.uid);
        USER.saveSettings();
        return templates;
    }
    /**
     * 渲染表格，接受 cellEventHandler 参数，提供两个参数：cell, cellElement
     * @param {Function} cellEventHandler
     * */
    render(cellEventHandler) { // render 方法接受 cellEventHandler 参数，不再传递 rowIndex, colIndex
        this.lastCellEventHandler = cellEventHandler; // 保存 cellEventHandler

        if (!this.tableElement) {
            this.tableElement = document.createElement('table');
            this.tableElement.classList.add('sheet-table');
            this.tableElement.style.position = 'relative';
            this.tableElement.style.display = 'flex';
            this.tableElement.style.flexDirection = 'column';
            this.tableElement.style.flexGrow = '0';
            this.tableElement.style.flexShrink = '1';

            const styleElement = document.createElement('style');
            styleElement.textContent = `
                .sheet-table { border-collapse: collapse; width: max-content; }
                .sheet-cell { border: 1px solid #ccc; padding: 1px; text-align: center; vertical-align: middle; }
                .sheet-cell-origin { min-width: 20px; min-height: 20px; cursor: pointer; }
                .sheet-header-cell-top { font-weight: bold; cursor: cell; }
                .sheet-header-cell-left { font-weight: bold; cursor: cell; }
                .sheet-cell-other { min-width: 50px; cursor: cell; }
            `;
            this.tableElement.appendChild(styleElement);
        }

        // 确保 tableElement 中有 tbody，没有则创建
        let tbody = this.tableElement.querySelector('tbody');
        if (!tbody) {
            tbody = document.createElement('tbody');
            this.tableElement.appendChild(tbody);
        }
        // 清空 tbody 的内容
        tbody.innerHTML = '';

        // 遍历 cellSheet，渲染每一个单元格
        this.cellSheet.forEach((rowUids, rowIndex) => {
            const rowElement = document.createElement('tr');
            rowUids.forEach((cellUid, colIndex) => {
                const cell = this.#cell(cellUid);
                rowElement.appendChild(cell.renderCell(rowIndex, colIndex));    // 调用 Cell 的 renderCell 方法，仍然需要传递 rowIndex, colIndex 用于渲染单元格内容
                if (cellEventHandler) {
                    cellEventHandler(cell);
                }
            });
            tbody.appendChild(rowElement); // 将 rowElement 添加到 tbody 中
        });
        return this.tableElement;
    }

    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */
    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */
    /** _______________________________________ 以下函数不进行外部调用 _______________________________________ */
    #cell(cellUid) {
        return this.cells.get(cellUid);
    }
    #init() {
        this.cells = new Map();
        this.cellHistory = [];
        this.cellSheet = [];

        const initialRows = 2;
        const initialCols = 2;
        const r = Array.from({ length: initialRows }, (_, i) => Array.from({ length: initialCols }, (_, j) => {
            let cell = new Cell(this);
            let cellType = CellType.cell;

            if (i === 0 && j === 0) {
                cellType = CellType.sheet_origin;
            } else if (i === 0 && j === 1) {
                cellType = CellType.column_header;
            } else if (i === 1 && j === 0) {
                cellType = CellType.row_header;
            }

            cell.type = cellType;
            this.cells.set(cell.uid, cell);
            this.cellHistory.push(cell);

            return cell.uid;
        }));
        this.cellSheet = r;
        return this;
    };
    #load(target) {
        let targetUid = target?.uid || target;
        let targetSheetData = null;

        if (this.asTemplate === true) {
            targetSheetData = BASE.loadUserAllTemplates().find(t => t.uid === targetUid);
            if (!targetSheetData) {
                console.log('未找到模板数据，创建新模板');
            }
        } else if (targetUid) {
            targetSheetData = BASE.getLastSheets()?.find(s => s.uid === targetUid);
            if (!targetSheetData) {
                throw new Error(`表格数据未找到，UID: ${targetUid}`);
            }
        } else {
            targetSheetData = BASE.getLastSheets() || {};
        }

        try {
            if (targetSheetData) {      // 只有当 targetSheetData 存在时才进行后续操作
                Object.assign(this, targetSheetData);
                this.cells = new Map(); // 初始化 cells Map
                this.cellHistory?.forEach(c => { // 从 cellHistory 加载 Cell 对象
                    const cell = new Cell(this);
                    Object.assign(cell, c);
                    this.cells.set(cell.uid, cell); // cells 记录 cell uid 和 cell 实例
                });

                // **[关键修改]：加载后，根据 cellSheet 结构重新初始化 Cell 的 type**
                if (this.cellSheet && this.cellSheet.length > 0) {
                    this.cellSheet.forEach((rowUids, rowIndex) => {
                        rowUids.forEach((cellUid, colIndex) => {
                            const cell = this.#cell(cellUid);
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


                if (this.uid === '') {
                    if (this.asTemplate === false) this.#initSheetStructure();
                } else {
                    if (this.asTemplate === false && this.cellSheet.length === 0) this.#initSheetStructure();
                }
            }
        } catch (e) {
            this.#init();
            if (this.asTemplate === false) this.#initSheetStructure();
            return this;
        }
        // console.log(`成功加载${this.asTemplate ? '模板' : '表格'}：`, this);
        return this;
    }
    #createNewEmpty() {
        this.#init(); // 初始化基本数据结构
        this.uid = `${this.asTemplate ? 'template' : 'sheet'}_${SYSTEM.generateRandomString(8)}`; // 根据 asTemplate 决定 uid 前缀
        this.name = `新${this.asTemplate ? '模板' : '表格'}_${this.uid.slice(-4)}`; // 根据 asTemplate 决定 name 前缀
        this.#initSheetStructure(); // 初始化表格结构
        this.save(); // 保存新创建的 Sheet
        return this; // 返回 Sheet 实例自身
    }
    #createFromTemplate(template) {
        if (!template) {
            return this.#createNewEmpty(); // 如果 template 为空，则回退到创建空表格
        }
        // 复制模板的基本属性
        this.domain = template.domain;
        this.type = template.type;

        // 初始化新的 cellSheet 结构，并复制模板的单元格数据
        this.cellSheet = template.cellSheet.map(row => {
            return row.map(cellUid => {
                const templateCell = template.#cell(cellUid);
                let newCell = new Cell(this);
                // **[可选项]：决定是否复制单元格的值，这里选择不复制，只复制单元格类型**
                newCell.type = templateCell.type;
                this.cells.set(newCell.uid, newCell);
                this.cellHistory.push(newCell);
                return newCell.uid;
            });
        });

        this.uid = `sheet_${SYSTEM.generateRandomString(8)}`; // 新表格使用 'sheet_' 前缀
        this.name = `新表格_${this.uid.slice(-4)}`; // 新表格默认名称
        this.asTemplate = false; // 确保新表格不是模板
        this.save(); // 保存新创建的 Sheet
        return this; // 返回 Sheet 实例自身
    }
    #initSheetStructure() {
        if (this.cellSheet.length > 0) return;
        const initialRows = 2;
        const initialCols = 2;
        const r = Array.from({ length: initialRows }, (_, i) => Array.from({ length: initialCols }, (_, j) => {
            let cell = new Cell(this);
            this.cells.set(cell.uid, cell);
            this.cellHistory.push(cell);
            if (i === 0 && j === 0) {
                cell.type = CellType.sheet_origin;
                cell.value = 'A1';
            }
            return cell.uid;
        }));
        this.cellSheet = r;
    }

    bridge = {
        initSheetStructure: this.#initSheetStructure.bind(this),
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
        this.uid = '';
        this.parent = parent;
        this.type = '';
        this.status = '';
        this.element = null;
        this.targetUid = '';
        this.data = new Proxy({}, {
            get: (target, prop) => {
                return target[prop];
            },
            set: (target, prop, value) => {
                this.editProps({ prop, value });
                return true;
            },
        });

        this.#init(target);
    }

    get position() {
        return this.#positionInParentCellSheet();
    }
    newAction(actionName) {
        this.#event(actionName);
    }
    editProps(props) {
        this.#event(CellAction.editCell, props);
    }
    renderCell(rowIndex, colIndex) {
        const cellElement = document.createElement('td');
        cellElement.classList.add('sheet-cell'); // 使用 sheet-cell
        this.element = cellElement; // 存储 element

        if (rowIndex === 0 && colIndex === 0) {
            cellElement.classList.add('sheet-cell-origin');
        } else if (rowIndex === 0) {
            cellElement.textContent = getColumnLetter(colIndex - 1); // Column headers (A, B, C...)
            cellElement.classList.add('sheet-header-cell-top');
        } else if (colIndex === 0) {
            cellElement.textContent = rowIndex; // Row headers (1, 2, 3...)
            cellElement.classList.add('sheet-header-cell-left');
        } else {
            const pos = [getColumnLetter(colIndex - 1), rowIndex].join(''); // Cell position (A1, B2, C3...)
            cellElement.textContent = this.value || pos; // 显示单元格值，默认为位置
            cellElement.style.fontSize = '0.8rem';
            cellElement.style.fontWeight = 'normal';
            cellElement.style.color = 'var(--SmartThemeEmColor)'
            cellElement.classList.add('sheet-cell-other');
        }

        return cellElement;
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
        this.uid = targetCell.uid || `cell_${this.parent.uid.split('_')[1]}_${SYSTEM.generateRandomString(8)}`;
        this.type = targetCell.type || CellType.cell;
        this.status = targetCell.status || '';
        this.element = targetCell.element || null;
        this.targetUid = targetCell.targetUid || '';
        this.data = targetCell.data || {};
    }
    #positionInParentCellSheet() {
        if (!this.parent || !this.parent.cellSheet) {
            return [-1, -1]; // 如果没有父级 Sheet 或 cellSheet，则返回 [-1, -1]
        }
        const cellSheet = this.parent.cellSheet;
        for (let rowIndex = 0; rowIndex < cellSheet.length; rowIndex++) {
            const row = cellSheet[rowIndex];
            for (let colIndex = 0; colIndex < row.length; colIndex++) {
                if (row[colIndex] === this.uid) {
                    return [rowIndex, colIndex]; // 找到匹配的 UID，返回 [rowIndex, colIndex]
                }
            }
        }
        console.warn('未找到匹配的 UID'); // 如果遍历完 cellSheet 仍未找到匹配的 UID，则输出警告
        return [-1, -1]; // 如果遍历完 cellSheet 仍未找到匹配的 UID，则返回 [-1, -1] (理论上不应该发生)
    }

    #event(actionName, props = {}) {
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
        this.parent.render(this.parent.lastCellEventHandler);
        this.parent.save();
        EDITOR.info(`单元格操作: ${actionName} 位置: ${[rowIndex, colIndex]}`);
    }
    #handleEditCell(props = {}) {
        if (!props || Object.keys(props).length === 0) {
            console.warn('未提供任何要修改的属性');
            return;
        }
        this.data = { ...this.data, ...props };
    }

    #insertRow(targetRowIndex) {
        // 使用Array.from()方法在cellSheet中targetRowIndex+1的位置插入新行
        const newRow = Array.from({ length: this.parent.cellSheet[0].length }, (_, j) => {
            let cell = new Cell(this.parent); // [BUG修复点1] 使用 this.parent
            this.parent.cells.set(cell.uid, cell);
            this.parent.cellHistory.push(cell);
            return cell.uid;
        });
        this.parent.cellSheet.splice(targetRowIndex + 1, 0, newRow);
    }
    #insertColumn(colIndex) {
        // 遍历每一行，在指定的 colIndex 位置插入新的单元格 UID
        this.parent.cellSheet = this.parent.cellSheet.map(row => {
            const newCell = new Cell(this.parent);
            this.parent.cells.set(newCell.uid, newCell);
            this.parent.cellHistory.push(newCell);
            row.splice(colIndex + 1, 0, newCell.uid);
            return row;
        });
    }
    #deleteRow(rowIndex) {
        if (rowIndex === 0) return;
        if (this.parent.cellSheet.length <= 2) return;
        this.parent.cellSheet.splice(rowIndex, 1);
    }
    #deleteColumn(colIndex) {
        if (colIndex === 0) return;
        if (this.parent.cellSheet[0].length <= 2) return;
        this.parent.cellSheet = this.parent.cellSheet.map(row => {
            row.splice(colIndex, 1);
            return row;
        });
    }
    #clearSheet() {
        this.parent.bridge.initSheetStructure();
    }
}

// Helper function to convert column index to letter (A, B, C...)
function getColumnLetter(colIndex) {
    let letter = '';
    let num = colIndex;
    while (num >= 0) {
        letter = String.fromCharCode('A'.charCodeAt(0) + (num % 26)) + letter;
        num = Math.floor(num / 26) - 1;
    }
    return letter;
}
