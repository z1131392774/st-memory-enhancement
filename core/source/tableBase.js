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
export const EventType = { // Export EventType
    sheet_origin: 'sheet_origin',
    column_header: 'column_header',
    row_header: 'row_header',
    cell: 'cell',
}
export const EventStatus = { // Export EventStatus
    waiting: 'waiting',
    mounted: 'mounted',
    hidden: 'hidden',
    deleted: 'deleted',
}
export const EventDirection = { // Export EventDirection
    up: 'up',
    right: 'right',
    down: 'down',
    left: 'left',
}

let _tableBaseInstance = null;
let _sheetTemplateInstance = null;

export const tableBase = { // Keep tableBase export as is
    TableBase:(target) => {
        if (_tableBaseInstance === null) _tableBaseInstance = new TableBase(target);
        else _tableBaseInstance.load(target)
        return _tableBaseInstance;
    },
    SheetTemplate: (target) => {
        if (_sheetTemplateInstance === null) _sheetTemplateInstance = new SheetTemplate(target);
        else _sheetTemplateInstance.load(target);
        return _sheetTemplateInstance;
    },
    tablesToTableBase(chat) {
        // 将 chat 中的所有表格数据转换为 TableBase 数据
    }
}

/**
 * 表格模板类，用于管理所有表格模板数据
 */
export class SheetTemplate { // Keep SheetTemplate export as is
    constructor(target = null) {
        this.uid = '';
        this.name = '';
        this.domain = SheetDomain.global;
        this.type = SheetType.free;

        this.events = new Map();
        this.eventHistory = [];
        this.eventSheet = [];

        this.load(target);
    }

    init() {
        this.uid = '';
        this.name = '';
        this.domain = SheetDomain.global;
        this.type = SheetType.free;
        this.eventHistory = [];
        this.eventSheet = [];
        this.events = new Map();
        return this;
    };
    load(target, source = this) {
        let targetUid = target?.uid || target;
        let targetTemplate = this.loadAllUserTemplates().find(t => t.uid === targetUid) || {};
        try {
            console.log(`根据 uid 查找模板：${targetTemplate?.uid}`);
            source = {...source, ...targetTemplate};
            source.events = new Map();
            source.eventHistory?.forEach(e => source.events.set(e.uid, e));
            if (source.uid === '') {
                console.log('实例化空模板');
            } else {
                console.log('成功加载模板：', source);
            }
        } catch (e) {
            source.init();
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
        this.uid = `template_${SYSTEM.generateRandomString(8)}`;
        this.name = `新模板_${this.uid.slice(-4)}`;
        this.save();
        return this;
    }
    save() {
        let templates = this.loadAllUserTemplates();
        if (!templates) templates = [];
        try {
            let r = this.load({});
            if (templates.some(t => t.uid === r.uid)) {
                templates = templates.map(t => t.uid === r.uid ? r : t);
            } else {
                templates.push(r);
            }
            USER.getSettings().table_database_templates = templates;
            USER.saveSettings();
            return this;
        } catch (e) {
            EDITOR.error(`保存模板失败：${e}`);
            return false;
        }
    }
    delete() {
        let templates = this.loadAllUserTemplates();
        USER.getSettings().table_database_templates = templates.filter(t => t.uid !== this.uid);
        USER.saveSettings();
        return templates;
    }
    destroyAll() {
        if (confirm("确定要销毁所有表格模板数据吗？") === false) return;
        USER.getSettings().table_database_templates = [];
        USER.saveSettings();
    }

    event(props = {}, targetUid = this.eventSheet[0][0]) {
        let event = new Event(this);
        event.update(props, targetUid);
        return event;
    }

    cellClickEvent(callback) {
        callback();
    }
}

/**
 * 表格库类，用于管理所有表格数据
 */
class TableBase { // Keep TableBase export as is
    constructor() {
        this.uid = '';
        this.config = {};
        this.sheets = [];
    }
}

/**
 * 表格类 (新增)
 */
export class Sheet { // Keep Sheet export as is
    constructor(template) {
        if (template instanceof SheetTemplate) {
            this.uid = `sheet_${SYSTEM.generateRandomString(8)}`;
            this.name = template.name;
            this.domain = template.domain;
            this.type = template.type;
            this.templateUid = template.uid; // 关联模板

            this.events = new Map();
            this.eventHistory = [];
            this.eventSheet = [];

            this.init();
        } else {
            // Handle cases where template is not a SheetTemplate instance or is undefined.
            console.error("Sheet constructor requires a SheetTemplate instance as argument.");
            return null; // Or throw an error.
        }
    }

    init() {
        if (this.type === SheetType.free) {
            this.eventSheet = [[this.createEvent(EventType.sheet_origin)]];
        } else if (this.type === SheetType.dynamic) {

        } else if (this.type === SheetType.fixed) {

        } else if (this.type === SheetType.static) {

        }
    }

    updateCell(targetUid, value) {
        const event = this.events.get(targetUid);
        if (event && event.type === EventType.cell) {
            event.update({ value }, targetUid);
        } else {
            console.error("只能更新单元格事件");
        }
    }

    createEvent(type, props = {}, targetUid) {
        const event = new Event(this, type);
        event.update(props, targetUid);
        return event;
    }

    render() {
        const table = document.createElement('table');
        table.className = 'sheet-table';
        table.dataset.sheetUid = this.uid;
        const tbody = document.createElement('tbody');
        table.appendChild(tbody);

        this.eventSheet.forEach((rowEvents, rowIndex) => {
            const row = tbody.insertRow();
            rowEvents.forEach((event, colIndex) => {
                const cell = row.insertCell();
                cell.dataset.eventUid = event.uid;
                if (rowIndex === 0 && colIndex > 0) {
                    cell.className = 'column-header';
                    cell.textContent = event.props.name || `列 ${colIndex}`;
                } else if (colIndex === 0 && rowIndex > 0) {
                    cell.className = 'row-header';
                    cell.textContent = event.props.name || `行 ${rowIndex}`;
                } else if (rowIndex > 0 && colIndex > 0) {
                    cell.className = 'cell';
                    cell.textContent = event.value || '';
                } else if (rowIndex === 0 && colIndex === 0) {
                    cell.className = 'sheet-origin';
                    cell.textContent = this.name;
                }
            });
        });
        return table;
    }
}

/**
 * 事件类
 */
class Event { // Keep Event export as is, though it's implicitly exported because Sheet and SheetTemplate use it. For clarity you could add 'export class Event'
    constructor(parent, type = EventType.cell) {
        this.uid = `e_${parent.uid.split('_')[1]}_${SYSTEM.generateRandomString(8)}`;
        this.value = '';
        this.parent = parent;
        this.type = type;
        this.status = EventStatus.waiting;
        this.targetUid = '';
        this.props = {};
    }

    init() {
        this.uid = '';
        this.value = '';
        this.parent = null;
        this.type = '';
        this.status = EventStatus.waiting;
        this.targetUid = '';
        this.props = {};
    }
    load(targetUid) {

    }
    update(props, targetUid) {
        if(targetUid) this.targetUid = targetUid;
        this.props = { ...this.props, ...props };
        this.run();
    }

    run() {
        this.status = EventStatus.mounted;
        this.parent.events.set(this.uid, this);
        this.parent.eventHistory.push(this);
    }

    insertColumn(targetUid, direction) {
        if (direction === EventDirection.up || direction === EventDirection.down) {
            console.error('只允许在列头添加左右插入事件');
            return;
        }

        let target = this.parent.events.get(targetUid);

        if (target.type !== EventType.column_header){
            console.error('只允许在列头添加左右插入事件');
            return;
        }

        let index = this.parent.eventSheet[0].findIndex(e => e.uid === targetUid);
        if (index === -1) {
            console.error(`找不到目标事件：${targetUid}`);
            return;
        }

        const newColumnHeader = this.parent.createEvent(EventType.column_header, {}, targetUid);

        this.parent.eventSheet.forEach((row, rowIndex) => {
            if (rowIndex === 0) {
                row.splice(direction === EventDirection.right ? index + 1 : index, 0, newColumnHeader);
            } else {
                let newCell = this.parent.createEvent(EventType.cell);
                row.splice(direction === EventDirection.right ? index + 1 : index, 0, newCell);
            }
        });
    }

    insertRow(targetUid, direction) {
        if (direction === EventDirection.left || direction === EventDirection.right) {
            console.error('只允许在行头添加上下插入事件');
            return;
        }

        let target = this.parent.events.get(targetUid);
        if(target.type !== EventType.row_header){
            console.error('只允许在行头添加上下插入事件');
            return;
        }

        let index = this.parent.eventSheet.findIndex(e => e[0].uid === targetUid);
        if (index === -1) {
            console.error(`找不到目标事件：${targetUid}`);
            return;
        }

        const newRowHeader = this.parent.createEvent(EventType.row_header, {}, targetUid)

        const newRow = [newRowHeader];
        for (let i = 1; i < this.parent.eventSheet[0].length; i++) {
            let newCell = this.parent.createEvent(EventType.cell);
            newRow.push(newCell);
        }

        this.parent.eventSheet.splice(direction === EventDirection.down ? index + 1 : index, 0, newRow);
    }
}
