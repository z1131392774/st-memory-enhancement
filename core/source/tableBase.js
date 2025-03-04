import JSON5 from '../../utils/json5.min.mjs';
import {SYSTEM} from "../manager.js"; // 假设 JSON5 仍然用于某些配置或属性解析

const EventStatus = {
    hidden: 'hidden',
    working: 'working',
    updated: 'updated',
    deleted: 'deleted',
}
const EventTypes = {
    header: 'header',
    row: 'row',
    cell: 'cell',
}
const EventActions = {

}


export class TableBase {
    constructor() {
        this.tables = new Map();
        this.variables = new Map();
        this.functions = new Map();
    }
}

class Table {
    constructor(name, size = [0, 0]) {
        this.uid = SYSTEM.generateRandomString(16);
        this.name = name || '';
        this.events = new Map();    // 记录所有事件，方便查找
        this.history = [];          // 所有事件按照发生顺序推入历史记录
        this.eventSheet = [];       // 以事件记录表格结构，包括列表头、行表头、单元格
        this.status = EventStatus.working;
        this.eventInstance = null;
        this.init();
    }

    init() {
        this.eventInstance = new Event(this);
    }

    event = this.eventInstance;
}

export class Event {
    constructor(parent) {
        this.uid = SYSTEM.generateRandomString(32);
        this.value = '';
        this.status = EventStatus.working;
        this.parent = parent;
    }

    add(target, value) {

    }
    set(target, value) {

    }
    delete(target) {

    }
    get(target) {

    }

    pushEvent(event) {
        // 将事件添加到 parent 的 history, events, eventSheet 中
    }

    EventStatus = EventStatus;
    EventTypes = EventTypes;
    EventActions = EventActions;
}

// class Header {
//     constructor(name, parent) { // 接收 Table 实例
//         this.uid = SYSTEM.generateRandomString(18);
//         this.name = name;
//         this.status = EventStatus.working;
//         this.parent = parent;
//     }
// }
//
// class Row {
//     constructor(parent) { // 接收 Table 实例
//         this.uid = SYSTEM.generateRandomString(18);
//         this.cells = new Map();
//         this.status = EventStatus.working;
//         this.parent = parent;
//     }
// }
//
// class Cell {
//     constructor(value, parent) { // 接收 Table 实例
//         this.uid = SYSTEM.generateRandomString(32);
//         this.value = value;
//         this.status = EventStatus.working;
//         this.parent = parent;
//     }
// }
