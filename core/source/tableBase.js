import { extension_settings, getContext } from '../../../../../extensions.js';
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';
import {defaultSettings} from "./pluginSetting.js";

const BaseConfig = {
    enable_storage_in_user_piece: false,  // 是否储存于用户数据片段
}
const SheetDomain = {
    global: 'global',   // 全局表
    role: 'role',       // 该表被储存于角色
    chat: 'chat',       // 该表被储存于对话，仅在特定对话中可见
}
const SheetType = {
    free: 'free',                       // 自由表，不受任何限制，可编辑行与列的数量
    dynamic: 'dynamic',                 // 动态表，每列表头被严格定义，行数可自由增减，可修改每行内容（针对非用户）
    fixed: 'fixed',                     // 固定表，单元格被严格定义，行列数不可变，但可修改其中内容（针对非用户）
    static: 'static',                   // 静态表，单元格被严格定义，行列数不可变，内容不可修改，仅只读（针对非用户）
}

const EventCategory = {
    sheet_origin: 'sheet_origin',       // [0][0] 被挂载到表格原点，用于储存表自身属性
    column_header: 'column_header',     // {+}[0] 被挂载在列头，用于处理列属性
    row_header: 'row_header',           // [0]{+} 被挂载在行头，用于处理行属性
    cell: 'cell',                       // {+}{+} 被挂载在单元格，用于处理单元格数据
}
const EventType = {
    null: 'null',       // 默认创建空事件，不支持执行任何修改编辑操作
    insert: 'insert',
    set: 'set',
    clear: 'clear',
    delete: 'delete',
}
const EventStatus = {
    waiting: 'waiting',     // 事件等待执行
    canceled: 'canceled',   // 事件在挂载前取消，可能是因为流程不合规自动取消或用户手动取消
    mounted: 'mounted',     // 事件已挂载，正在工作中
    hidden: 'hidden',       // 事件已挂载但隐藏，相关内容在 sheet 不可见
    deleted: 'deleted',     // 事件已被删除
}
const EventDirection = {
    up: 'up',
    right: 'right',
    down: 'down',
    left: 'left',
}


let _tableBaseInstance = null;
let _tableTemplateInstance = null;

export const tableBase = {
    Table:() => {
        if (_tableBaseInstance === null) _tableBaseInstance = new TableBase();
        return _tableBaseInstance;
    },
    TableTemplate: (target) => {
        if (_tableTemplateInstance === null) {
            _tableTemplateInstance = new TableTemplate();
        } else {
            _tableTemplateInstance.init(target);
        }
        return _tableTemplateInstance;
    },
    templates: () => {
        if (!USER.getSettings().table_database_templates) {
            USER.getSettings().table_database_templates = [];
        }
        return USER.getSettings().table_database_templates;
    },
}

class TableTemplate {
    constructor(target = null) {
        this.uid = '';
        this.name = '';
        this.domain = SheetDomain.global;
        this.type = SheetType.free;

        this.eventHistory = [];     // 所有事件按照发生顺序推入历史记录，方便回溯
        this.eventSheet = [];       // 以表格结构可视化事件，包括列属性、行属性、单元格数据

        // 初始化工具函数
        this.init(target);
    }

    init(target) {
        if (target === null) {
            console.log('未指定模板，可以使用 create() 方法创建新的模板实例');
            return;
        }
        if (typeof target === 'string') {
            target = BASE.templates?.find(t => t.uid === target);
            if (target === undefined) {
                EDITOR.error(`未找到指定的模板：${target}`);
                return;
            }
        }
        try {
            this.uid = target.uid;
            this.name = target.name;
            this.domain = target.domain;
            this.type = target.type;
            this.eventHistory = target.eventHistory;
            this.eventSheet = target.eventSheet;
        } catch (e) {
            EDITOR.error(`初始化模板失败：${e}`);
        }
        return this;
    }

    create() {
        this.uid = `template_${SYSTEM.generateRandomString(8)}`;
        this.name = `新模板_${this.uid.slice(-4)}`;
        this.save();
        EDITOR.info('创建了新的 TableTemplate 实例')
        return this;
    }

    save() {
        if (!BASE.templates) {
            BASE.templates = [];
        }
        try {
            BASE.templates.forEach((t, i) => {
                if (t.uid === this.uid) {
                    BASE.templates[i] = this;
                    EDITOR.success(`成功更新模板：${this}`);
                    return true;
                }
            })
            BASE.templates.push(this);
            EDITOR.success(`成功添加新模板：${this}`);
            return true;
        } catch (e) {
            EDITOR.error(`保存模板失败：${e}`);
            return false;
        }
    }

    delete() {
        BASE.templates = BASE.templates.filter(t => t.uid !== this.uid);
        return BASE.templates;
    }
}

/**
 * 表格基类，用于管理所有表格数据
 */
class TableBase {
    constructor() {
        this.uid = '';
        this.config = null;
        this.tables = new Map();
        // this.vars = new Map();  // 保留，但暂不开发该功能
        // this.functions = new Map();  // 保留，但暂不开发该功能

        this.init();
    }

    /**
     * 初始化 TableBase 实例，如果目标数据为空则创建新的 TableBase 实例，并初始化本地保存
     * @param targetUid
     */
    init() {
        if (USER.getContext().table_database === undefined) {       // 如果目标数据为空则创建新的 TableBase 实例，并初始化本地保存
            EDITOR.info('创建新的 TableBase 实例');
            this.uid = `db_${SYSTEM.generateRandomString(8)}`;
            this.tables = new Map();
            this.config = {...BaseConfig};
            this.save();
        } else {
            const r = USER.getContext().table_database;
            this.uid = r.uid;
            this.tables = r.tables;
            this.config = r.config;
        }
    }
    object(table) {

    }
    load(uid = '') {

    }
    save() {
        USER.getContext().table_database = {
            uid: this.uid,
            data: this.tables,
            config: this.config,
        };
    }
    clear() {
        if (confirm("确定要清除所有表格数据吗？") === false) return;
    }
    destroy() {
        if (confirm("确定要销毁本对话整个事件表数据库吗？将只会保留在本对话中创建的全局模板。") === false) return;
        delete USER.getContext().table_database;
    }

    tablesToTableBase(chat) {
        // 将 chat 中的所有表格数据转换为 TableBase 数据
    }
}

class Table {
    constructor(table, parent) {
        this.uid = `t_${SYSTEM.generateRandomString(16)}`;
        this.name = name || '';
        this.domain = SheetDomain.global;
        this.type = SheetType.free;

        this.events = new Map();    // 记录所有事件，方便以O(1)时间复杂度查找
        this.eventHistory = [];     // 所有事件按照发生顺序推入历史记录，方便回溯
        this.eventSheet = [];       // 以表格结构可视化事件，包括列属性、行属性、单元格数据
        this.parent = parent;

        // 初始化工具函数
        this.init();
    }

    init() {
        const currentChatPiece = USER.getChatPiece();
        if (currentChatPiece === null) {
            EDITOR.warning('当前对话数据为空，无法创建表格');
            return;
        }
        if (currentChatPiece.is_user === true && this.parent.config.enable_storage_in_user_piece === false) {
            EDITOR.warning('当前对话为用户数据片段，未开启在用户的对话回合中保存表格');
            return;
        }
    }
    clear() {
        if (confirm("确定要清除所有事件数据吗？") === false) return;
        this.events.clear();
        this.eventHistory = [];
        this.eventSheet = [];
    }

    /**
     * 在当前表格中创建一个新的事件
     * @param {EventType} type 事件类型，默认为 readonly(空事件)
     * @returns {Event} 创建的事件
     */
    event = new Event(EventType.null, '', this);

    // 事件组，用于快速添加事件
    SheetDomain = SheetDomain;
    SheetType = SheetType;
}

/**
 * 事件类，使用该类请通过 Table 类的 event 属性调用
 * @description 事件类用于记录所有表格的操作，包括插入、设置、清除、删除等操作
 * @description 事件类支持事件回溯，支持事件撤销和重做
 */
class Event {
    constructor(type, lastUid, parent) {
        this.uid = '';
        this.value = '';
        this.status = '';
        this.category = '';
        this.type = type;
        this.lastUid = lastUid;       // 该事件通过哪一个事件触发
        this.parent = parent;
        this.direction = '';
        this.timestamp = Date.now();

        // 根据 type 初始化事件
        this.init();
    }

    // 初始化事件，用于初始化参数与初步判断事件合法性
    init() {
        if (this.type === EventType.null) return;
        // 推入事件历史记录
        this.pushToWaitingQueue(this);
    }

    // 事件执行，不支持 readonly 事件
    run() {
        if (this.type === EventType.null) {
            console.log(`空事件无法被执行：${this}`);
            return;
        }

        if (this.lastUid === '') {
            console.error(`你必须指定一个事件来触发当前事件：${this}`);
            return;
        }
        switch (this.type) {
            case EventType.insert:
                this.insert();
                break;
            case EventType.set:
                this.set();
                break;
            case EventType.clear:
                this.clear();
                break;
            case EventType.delete:
                this.delete();
                break;
            default:
                console.error(`事件不合规：${this}`);
                return;
        }
    }

    lastEvent() {
        // 返回当前事件的上一个事件
        return this.parent.events.get(this.lastUid);
    }

    // 事件操作
    insert(category, value) {
        const lastEvent = this.lastEvent();
        const lastEventCategory = lastEvent.category;

    }
    set(category, value) {
        const lastEvent = this.lastEvent();
        // 检查 value 是否为字符串或数字，如果是则直接设置this.value


        // 检查 value 是否为对象，如果是则遍历对象中的键值对，逐一设置

    }
    clear(category) {
        const lastEvent = this.lastEvent();
    }
    delete(category) {
        const lastEvent = this.lastEvent();
        const lastEventCategory = lastEvent.category;

        // 如果 lastEventCategory = sheet_origin，则不可删除
        if (lastEventCategory === EventCategory.sheet_origin) {
            console.error(`不可删除 sheet_origin 事件：${lastEvent}`);
            return;
        }
        // 如果 lastEventCategory = cell，则不可删除，请使用 clear 事件
        if (lastEventCategory === EventCategory.cell) {
            console.error(`cell 不支持 delete 操作，请使用 clear 事件：${lastEvent}`);
            return;
        }
        // 如果 lastEventCategory = column_header，则删除整列
        if (lastEventCategory === EventCategory.column_header) {
            // 删除整列
        }
        // 如果 lastEventCategory = row_header，则删除整行
        if (lastEventCategory === EventCategory.row_header) {
            // 删除整行
        }
    }


    // 以下方法不被构造类外的方法调用
    // 推入事件历史记录
    pushToWaitingQueue(event) {
        this.status = EventStatus.waiting;

        this.uid = `e_${SYSTEM.generateRandomString(32)}`;
        this.parent.eventHistory.push(event);
        this.parent.events.set(event.uid, event);
    }

    // 事件组，用于快速添加事件
    EventCategory = EventCategory;
    EventType = EventType;
    EventStatus = EventStatus;
    EventDirection = EventDirection;
}
