// dragManager.js
import {EDITOR, SYSTEM} from "../../manager.js";

let dragInstanceEnabled = false;
export async function openDraggableSpacePopup(){
    if(dragInstanceEnabled === true){
        return;
    }
    const manager = await SYSTEM.getComponent('space');
    const draggableSpacePopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true });
    const $dlg = $(draggableSpacePopup.dlg);
    const $dragLayer = $dlg.find('#dragLayer'); // 获取拖动层
    const $dragContent = $dlg.find('#draggableSpace'); // 获取 space.html 中的 <div id="draggableSpace" class="space-content"> 组件

    // 初始化拖拽缩放功能
    initDraggableSpace($dragLayer[0], $dragContent[0]); // 传递拖动层和内容层的原生 DOM 元素

    // 生成测试表格
    const table = generateTestTable();
    $dragContent.append(table);

    dragInstanceEnabled = true;
    await draggableSpacePopup.show();
    dragInstanceEnabled = false;
}

function initDraggableSpace(dragLayerElement, dragSpaceElement) { // 接收拖动层和内容层元素
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let translateX = 0;
    let translateY = 0;
    let scale = 1;
    // let zoomFactor = 0.1; // 移除旧的 zoomFactor

    let canvasStartX = 0; // 拖拽开始时鼠标在画布上的 X 坐标
    let canvasStartY = 0; // 拖拽开始时鼠标在画布上的 Y 坐标

    // 阈值累积
    let accumulatedX = 0;
    let accumulatedY = 0;
    const threshold = 1; // 阈值，像素

    // 缩放阈值累积
    let accumulatedScale = 0;
    const scaleThreshold = 0.1; // 缩

    // 缩放配置 (参考 DraggableCanvas.vue)
    const zoomValue = 1.1; // 缩放因子，调整此值改变缩放速度
    const zoomRange = [-5, 5]; // 缩放范围，调整此范围限制缩放程度
    let zoomLevel = 0; // 当前缩放等级

    // 应用初始变换
    applyTransform();

    // 将 mousedown 事件监听器绑定到拖动层 dragLayerElement
    dragLayerElement.addEventListener('mousedown', startDrag, false);

    // 将 mousemove 和 mouseup 事件监听器绑定到 document
    document.addEventListener('mousemove', drag, false);
    document.addEventListener('mouseup', endDrag, false);
    dragLayerElement.addEventListener('wheel', zoom, { passive: false }); // 滚轮事件仍然绑定到拖动层

    function startDrag(e) {
        if (e.button === 0) { // 鼠标左键点击在拖动层上即可开始拖拽
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            dragLayerElement.style.cursor = 'grabbing'; // 更改拖动层鼠标样式

            // 计算拖拽开始时鼠标在画布上的坐标
            canvasStartX = (startX - translateX) / scale;
            canvasStartY = (startY - translateY) / scale;
        }
    }

    function drag(e) {
        if (!isDragging) return;
        e.preventDefault(); // 阻止默认行为，例如文本选择
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // 计算鼠标在画布上的当前坐标
        const currentCanvasX = (mouseX - translateX) / scale;
        const currentCanvasY = (mouseY - translateY) / scale;

        mergeOffset(currentCanvasX, currentCanvasY);
    }


    function endDrag() {
        isDragging = false;
        dragLayerElement.style.cursor = 'grab'; // 恢复拖动层鼠标样式
    }

    function zoom(e) {
        e.preventDefault(); // 阻止页面滚动
        const zoomDirection = e.deltaY > 0 ? -1 : 1; // 向下滚动 deltaY 为正，缩小；向上滚动 deltaY 为负，放大

        const originalScale = scale; // 记录缩放前的 scale 值
        const zoomFactor = e.deltaY < 0 ? zoomValue : 1 / zoomValue;
        let targetScale = scale * zoomFactor;

        // 应用 wheelScale 的逻辑限制缩放范围
        targetScale = Math.min(Math.max(Math.pow(zoomValue, zoomRange[0]), targetScale), Math.pow(zoomValue, zoomRange[1]));
        scale = targetScale; // 更新 scale 值

        // 更新 zoomLevel (可选，如果你需要跟踪 zoomLevel)
        zoomLevel = Math.round(Math.log(scale) / Math.log(zoomValue));

        // // 获取鼠标相对于 dragLayerElement 的位置
        const rect = dragLayerElement.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 计算缩放中心的世界坐标 (相对于 dragSpaceElement 原始大小的坐标)
        const worldX = (mouseX - translateX) / originalScale;
        const worldY = (mouseY - translateY) / originalScale;

        // 计算新的 translate 值，保持世界坐标在缩放后仍然在鼠标位置
        translateX = mouseX - worldX * scale;
        translateY = mouseY - worldY * scale;

        applyTransform();
    }

    function mergeOffset(x, y) {
        accumulatedX += x - canvasStartX;
        accumulatedY += y - canvasStartY;
        if (Math.abs(accumulatedX) > threshold || Math.abs(accumulatedY) > threshold) {
            const offsetX = Math.floor(accumulatedX / threshold) * threshold;
            const offsetY = Math.floor(accumulatedY / threshold) * threshold;
            translateX += offsetX;
            translateY += offsetY;
            accumulatedX -= offsetX;
            accumulatedY -= offsetY;
            applyTransform();
        }
    }

    function mergeScale(bias) {
        accumulatedScale += bias;
        if (Math.abs(accumulatedScale) < scaleThreshold) return;

        const updateScale = Math.floor(accumulatedScale / scaleThreshold) * scaleThreshold;
        scale += updateScale;
        accumulatedScale -= updateScale;
    }

    function applyTransform() {
        dragSpaceElement.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`; // 变换应用在内容层 dragSpaceElement 上
    }
}

function generateTestTable() {
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    for (let i = 20; i < 40; i++) { // 生成更大的表格，方便测试拖拽出界
        const row = table.insertRow();
        for (let j = 0; j < 10; j++) {
            const cell = row.insertCell();
            cell.style.border = '1px solid #ccc';
            cell.style.padding = '8px';
            cell.textContent = `Cell ${i}-${j}`;
        }
    }
    return table;
}
