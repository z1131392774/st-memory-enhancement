// tableBase.js
import { SYSTEM, USER, EDITOR } from '../manager.js';

export const SheetDomain = { // Export SheetDomain
    global: 'global',
    role: 'role',
    chat: 'chat',
}
export const SheetType = { // Export SheetType
    free: 'free',
    dynamic: 'dynamic',
    fixed: 'fixed',
    static: 'static',
}
export const CellType = { // Export CellType (Corrected name)
    sheet_origin: 'sheet_origin',
    column_header: 'column_header',
    row_header: 'row_header',
    cell: 'cell',
}
// const CellStatus = { // Export CellStatus (Corrected name)
//     waiting: 'waiting',
//     mounted: 'mounted',
//     hidden: 'hidden',
//     deleted: 'deleted',
// }
const Direction = { // Export Direction (Corrected name)
    up: 'up',
    right: 'right',
    down: 'down',
    left: 'left',
}

let _sheetInstance = null; // Renamed from _tableBaseInstance and _sheetTemplateInstance, now singular

export const tableBase = { // Keep tableBase export as is, but adjusted to manage Sheet
    Sheet: (target) => { // Renamed from SheetTemplate and TableBase, now just Sheet
        if (_sheetInstance === null) _sheetInstance = new Sheet(target); // Use the merged Sheet class
        else _sheetInstance.load(target);
        return _sheetInstance;
    },
}

/**
 * 表格类，融合了模板和表格的功能
 */
export class Sheet { // Merged Sheet and SheetTemplate, now just Sheet
    constructor(target = null) {
        this.uid = '';
        this.name = '';
        this.domain = SheetDomain.global;
        this.type = SheetType.free;
        this.asTemplate = false; // Flag to indicate if it's a template

        this.cells = new Map();
        this.cellHistory = []; // Renamed from eventHistory to cellHistory for clarity in Sheet context
        this.cellSheet = []; // Renamed from eventSheet to cellSheet for clarity in Sheet context

        this.Direction = Direction; // Expose Direction in Sheet instance

        if (target?.asTemplate === true) {
            this.asTemplate = true;
        }

        this.load(target);
    }

    init() {
        this.cells = new Map();
        this.cellHistory = [];
        this.cellSheet = [];

        const initialRows = 2;
        const initialCols = 2;
        const r = Array.from({ length: initialRows }, (_, i) => Array.from({ length: initialCols }, (_, j) => {
            let cell = new Cell(this);
            let cellType = CellType.cell; // Default cell type

            if (i === 0 && j === 0) {
                cellType = CellType.sheet_origin;
                cell.value = 'A1';
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
        return this; // Added for method chaining
    };
    load(target, source = this) {
        let targetUid = target?.uid || target;
        let targetSheetData;
        if (this.asTemplate) {
            targetSheetData = this.loadAllUserTemplates().find(t => t.uid === targetUid) || {};
        } else {
            // Logic to load Sheet data if needed from a different source, currently defaults to empty load.
            targetSheetData = {}; // Placeholder for sheet data loading if needed.
        }

        try {
            console.log(`根据 uid 查找 ${this.asTemplate ? '模板' : '表格'}：${targetSheetData?.uid}`);
            source = {...source, ...targetSheetData};
            source.cells = new Map();
            source.cellHistory?.forEach(e => {
                const cell = new Cell(this); // Re-create Cell object to establish parent
                Object.assign(cell, e); // Copy properties from loaded data
                cell.parent = this; // Manually set parent
                source.cells.set(cell.uid, cell)
            }); // Corrected to use cells and cellHistory
            if (source.uid === '') {
                console.log(`实例化空${this.asTemplate ? '模板' : '表格'}`);
                if (this.asTemplate === false) this.initSheetStructure(); // Initialize basic sheet structure for non-templates
            } else {
                console.log(`成功加载${this.asTemplate ? '模板' : '表格'}：`, source);
                if (this.asTemplate === false && source.cellSheet.length === 0) this.initSheetStructure(); // Ensure sheet structure for loaded non-templates if missing
            }
        } catch (e) {
            source.init();
            if (this.asTemplate === false) this.initSheetStructure(); // Initialize basic sheet structure for new non-templates on error
            return source;
        }
        return source;
    }
    loadAllUserTemplates() {
        let templates = USER.getSettings().table_database_templates;
        if (!Array.isArray(templates)) {
            templates = [];
            USER.getSettings().table_database_templates = templates;
            USER.saveSettings();
        }
        return templates;
    }
    createNew() {
        this.init();
        this.uid = `${this.asTemplate ? 'template' : 'sheet'}_${SYSTEM.generateRandomString(8)}`; // Differentiate UID for template/sheet
        this.name = `新${this.asTemplate ? '模板' : '表格'}_${this.uid.slice(-4)}`;
        if (this.asTemplate) this.save(); // Templates need to be saved upon creation. Sheets might have different save logic.
        else this.initSheetStructure(); // Initialize basic sheet structure for new sheets.
        return this;
    }
    save() {
        if (!this.asTemplate) {
            console.warn("表格保存逻辑未实现，当前操作仅为模板保存。"); // Indicate that sheet saving is not yet implemented.
            return false; // Early return as sheet save logic is not defined yet.
        }
        let templates = this.loadAllUserTemplates();
        if (!templates) templates = [];
        try {
            // Create a simplified object for saving, breaking circular references
            const sheetDataToSave = {
                uid: this.uid,
                name: this.name,
                domain: this.domain,
                type: this.type,
                asTemplate: this.asTemplate,
                cellHistory: this.cellHistory.map(cell => { // Serialize cellHistory, but remove parent ref
                    const { parent, ...cellData } = cell; // Destructure to exclude parent
                    return cellData;
                }),
                cellSheet: this.cellSheet,
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
    delete() {
        if (!this.asTemplate) {
            console.warn("表格删除逻辑未实现，当前操作仅为模板删除。"); // Indicate that sheet deletion is not yet implemented.
            return false; // Early return as sheet deletion is not defined yet.
        }
        let templates = this.loadAllUserTemplates();
        USER.getSettings().table_database_templates = templates.filter(t => t.uid !== this.uid);
        USER.saveSettings();
        return templates;
    }
    destroyAll() {
        if (this.asTemplate === false) {
            console.warn("销毁所有表格数据逻辑未实现，当前操作仅为模板销毁。"); // Indicate that sheet destroyAll is not yet implemented.
            return false; // Early return as sheet destroyAll logic is not defined yet.
        }
        if (confirm("确定要销毁所有表格模板数据吗？") === false) return;
        USER.getSettings().table_database_templates = [];
        USER.saveSettings();
    }

    initSheetStructure() {
        if (this.cellSheet.length > 0) return; // Prevent re-initialization if already initialized.
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


    updateCell(targetUid, props) { // Renamed and made more specific to cell updates
        const cell = this.cells.get(targetUid);
        if (cell) {
            cell.props = { ...cell.props, ...props };
            // Consider adding specific update logic or events here if needed.
        }
    }
    insertCell(row, col, direction) { // More flexible insert function
        // ... (Implementation for inserting rows/columns of cells, updating cellSheet, cellHistory, cells Map) ...
        console.warn("insertCell 逻辑未实现。");
    }
    deleteCell(targetUid) { // More specific delete function
        // ... (Implementation for deleting cells, updating cellSheet, cellHistory, cells Map) ...
        console.warn("deleteCell 逻辑未实现。");
    }
    clearSheet() {
        if (confirm("确定要清空表格数据吗？") === false) return;
        this.initSheetStructure(); // Re-initialize to a basic structure.  Consider more nuanced clearing if needed.
    }

    // Row/Column operations - Example stubs, needs implementation
    insertRow(targetUid, direction = Direction.down) {
        console.warn("insertRow 逻辑未实现。");
    }
    insertColumn(targetUid, direction = Direction.right) {
        console.warn("insertColumn 逻辑未实现。");
    }
    deleteRow(targetUid) {
        console.warn("deleteRow 逻辑未实现。");
    }
    deleteColumn(targetUid) {
        console.warn("deleteColumn 逻辑未实现。");
    }
}

class Cell { // Keep Cell export as is
    constructor(parent) {
        this.uid = `cell_${parent.uid.split('_')[1]}_${SYSTEM.generateRandomString(8)}`;
        this.value = '';
        this.parent = parent;
        this.type = '';
        this.status = '';
        this.targetUid = '';
        this.props = {};
    }
}
