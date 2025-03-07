// _fotTest.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';


const TESTING = true;

let codeQueue = [];
export function pushCodeToQueue(code) {
    codeQueue.push(code);
}

export function initTest() {
    if (!TESTING || !USER.tableBaseSetting.tableDebugModeAble) return;
    if (!testTestSidebarEnabled) openTestSidebar();
}

async function testingProcess() {
    if (codeQueue.length === 0) {
        console.log('没有注册任何 debugCode，无法执行。');
        return;
    }
    console.log('__________________ 开始执行所有注册的 Code...__________________');
    for (const func of codeQueue) {
        const index = codeQueue.indexOf(func);
        try {
            console.log(`______________ 开始执行 ${index + 1} ______________`);
            const result = await func(); // 执行函数并等待 Promise 完成
            if (result !== undefined) {
                console.log(`______________ 函数 ${index + 1} 返回值:`, result);
            }
            console.log(`______________ 执行 ${index + 1} 完毕 ______________`);
        } catch (error) {
            console.error(`debugCode ${index + 1} 执行出错:`, error);
        }
    }
    console.log('__________________ 所有注册的 debugCode 执行完毕。__________________');
}


let testTestSidebarEnabled = false;
let testSidebarContainer = null;
let isDragging = false;
let offsetX, offsetY;


function openTestSidebar(){
    testTestSidebarEnabled = true;
    testSidebarContainer = createSidebarContainer();
    const toolBar = createToolBar();
    testSidebarContainer.appendChild(toolBar);
    loadAndAppendTestContent(testSidebarContainer);
    addDragListeners();
    // 添加窗口 resize 事件监听器
    window.addEventListener('resize', handleWindowResize);
    document.body.appendChild(testSidebarContainer);

    // 初始化时也进行一次边界检查，确保初始位置也在窗口内
    adjustSidebarPositionWithinBounds();
}


function createSidebarContainer() {
    const container = document.createElement('div');
    container.id = 'test-floating-sidebar';
    Object.assign(container.style, {
        position: 'fixed',
        top: '100px',
        right: '20px', // 初始位置可以放在右侧，窗口resize时会调整
        backgroundColor: '#c00',
        maxWidth: '200px',
        padding: '5px',
        zIndex: '1000',
        borderRadius: '5px',
        cursor: 'move',
        whiteSpace: 'pre-wrap',
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#eee',
        userSelect: 'none',
    });
    container.classList.add('popup');
    return container;
}


function createToolBar() {
    const toolBar = document.createElement('div');
    toolBar.id = 'test_tool_bar';

    // 点击按钮运行注册的所有测试代码
    const retryButton = createToolButton('Retry Code', async (event) => {
        event.stopPropagation();
        await reloadTestContent();
    });
    toolBar.appendChild(retryButton);

    // 点击按钮打印所有数据
    const logButton = createToolButton('Log Data', (event) => {
        event.stopPropagation();
        EDITOR.logAll();
    });
    toolBar.appendChild(logButton);

    return toolBar;
}


function createToolButton(text, onClickHandler) {
    const button = document.createElement('button');
    button.innerText = text;
    Object.assign(button.style, {
        background: 'none',
        border: '1px solid #888',
        cursor: 'pointer',
        color: '#eee',
        margin: '2px'
    });
    button.onclick = onClickHandler;
    return button;
}


function loadAndAppendTestContent(container) {
    appendTestOutput(container, 'SYSTEM.code(()=>{测试代码})');
}


async function reloadTestContent() {
    if (!testSidebarContainer) return;

    while (testSidebarContainer.children.length > 1) {
        testSidebarContainer.removeChild(testSidebarContainer.lastChild);
    }

    await loadAndAppendTestContent(testSidebarContainer);
    await testingProcess();
}



function appendTestOutput(container, outputText) {
    const outputElement = document.createElement('pre');
    outputElement.innerText = outputText;
    container.appendChild(outputElement);
}


function addDragListeners() {
    testSidebarContainer.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);
}


function removeDragListeners() {
    testSidebarContainer.removeEventListener('mousedown', dragStart);
    document.removeEventListener('mousemove', dragMove);
    document.removeEventListener('mouseup', dragEnd);
    // 移除窗口 resize 事件监听器
    window.removeEventListener('resize', handleWindowResize);
}


function dragStart(e) {
    isDragging = true;
    offsetX = e.clientX - testSidebarContainer.offsetLeft;
    offsetY = e.clientY - testSidebarContainer.offsetTop;
}


function dragMove(e) {
    if (!isDragging) return;

    const newX = e.clientX - offsetX;
    const newY = e.clientY - offsetY;

    // 调整 sidebar 位置到边界内
    adjustSidebarPositionWithinBounds(newX, newY);
}


function dragEnd() {
    isDragging = false;
}


function handleWindowResize() {
    // 窗口大小改变时，调整 sidebar 位置到边界内
    adjustSidebarPositionWithinBounds();
}


function adjustSidebarPositionWithinBounds(inputX, inputY) {
    let newX = inputX !== undefined ? inputX : testSidebarContainer.offsetLeft;
    let newY = inputY !== undefined ? inputY : testSidebarContainer.offsetTop;

    // 获取视口宽度和高度
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 获取 sidebar 的宽度和高度
    const sidebarWidth = testSidebarContainer.offsetWidth;
    const sidebarHeight = testSidebarContainer.offsetHeight;

    // 计算允许的边界
    const minX = 0;
    const maxX = viewportWidth - sidebarWidth;
    const minY = 0;
    const maxY = viewportHeight - sidebarHeight;

    // 限制 newX 和 newY 在边界内
    let boundedX = Math.max(minX, Math.min(newX, maxX));
    let boundedY = Math.max(minY, Math.min(newY, maxY));


    testSidebarContainer.style.left = boundedX + 'px';
    testSidebarContainer.style.top = boundedY + 'px';
}
