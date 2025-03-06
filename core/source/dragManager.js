// dragManager.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';

/**
 * @description 拖拽管理器 - 用于管理拖拽操作
 */
export class Drag {
    constructor() {
        // 初始化变换参数
        this.translateX = 0;
        this.translateY = 0;
        this.scale = 1;
        this.isDragging = false;
        this.accumulatedX = 0;
        this.accumulatedY = 0;
        this.threshold = 1;
        this.zoomValue = 0.9;
        this.zoomRange = [-5, 10];
        this.elements = new Map();

        // 新增阈值变量
        this.dragThreshold = 10; // 移动超过10px视为拖拽
        this.initialPosition = { x: 0, y: 0 };
        this.shouldDrag = false;

        // 创建容器结构
        this.dragContainer = document.createElement('div');
        this.dragContainer.style.position = 'relative';
        this.dragContainer.style.display = 'flex';
        this.dragContainer.style.flexGrow = '1';
        this.dragContainer.style.flexShrink = '0';
        this.dragContainer.style.width = '100%';
        this.dragContainer.style.height = '100%';
        this.dragContainer.style.minHeight = '500px';
        this.dragContainer.style.overflow = 'hidden';
        // this.dragContainer.style.background = '#32282b';

        // 创建可拖动内容层
        this.dragSpace = document.createElement('div');
        this.dragSpace.style.transformOrigin = '0 0';
        this.dragSpace.style.position = 'absolute';
        this.dragSpace.style.top = '0';
        this.dragSpace.style.left = '0';
        this.dragSpace.style.bottom = '0';
        this.dragSpace.style.transition = 'transform 0.12s cubic-bezier(0.22, 1, 0.36, 1)';
        this.dragContainer.appendChild(this.dragSpace);

        // 创建拖动事件层
        this.dragLayer = document.createElement('div');
        this.dragLayer.style.position = 'absolute';
        this.dragLayer.style.top = '0';
        this.dragLayer.style.left = '0';
        this.dragLayer.style.bottom = '0';
        this.dragLayer.style.width = '100%';
        this.dragLayer.style.height = '100%';
        this.dragLayer.style.cursor = 'grab';
        this.dragLayer.style.userSelect = 'none';
        this.dragContainer.appendChild(this.dragLayer);

        // 绑定事件处理
        this.dragLayer.addEventListener('mousedown', this.handleMouseDown);
        this.dragLayer.addEventListener('wheel', this.handleWheel, { passive: false });
    }


    /**
     * 获取渲染元素，用于挂载到页面上
     * @returns {HTMLDivElement}
     */
    get render() {
        return this.dragContainer;
    }

    /**
     * 设置样式，支持对象形式
     * @param style
     * @example style({background: 'red', color: 'white'})
     */
    style(style){
        this.dragContainer.style = {...this.dragContainer.style, ...style};
    }

    /**
     * 添加元素，支持设置初始位置，默认为[0, 0]
     * @example add('name', element, [100, 100])
     * @param name
     * @param element
     * @param position
     */
    add(name, element, position = [0, 0]) {
        element.style.position = 'absolute';
        element.style.left = `${position[0]}px`;
        element.style.top = `${position[1]}px`;
        this.dragSpace.appendChild(element);
        this.elements.set(name, element);
    }

    /**
     * 移动元素到指定位置，默认为[0, 0]
     * @example move('name', [100, 100])
     * @param name
     * @param position
     */
    move(name, position = [0, 0]) {
        if (this.elements.has(name)) {
            this.elements.get(name).style.left = `${position[0]}px`;
            this.elements.get(name).style.top = `${position[1]}px`;
        }
    }

    /**
     * 删除元素，同时会从页面上移除
     * @example delete('name')
     * @param name
     */
    delete(name) {
        if (this.elements.has(name)) {
            this.dragSpace.removeChild(this.elements.get(name));
            this.elements.delete(name);
        }
    }


    /** ------------------ 以下为拖拽功能实现，为事件处理函数，不需要手动调用 ------------------ */
    // 鼠标按下事件
    handleMouseDown = (e) => {
        if (e.button === 0) {
            // 保存初始位置
            this.initialPosition.x = e.clientX;
            this.initialPosition.y = e.clientY;

            // 临时禁用指针事件
            this.dragLayer.style.pointerEvents = 'none';
            const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            this.dragLayer.style.pointerEvents = 'auto';

            // 如果点击的是可交互元素则直接返回
            if (elementUnderMouse?.closest('button, [onclick], a')) {
                elementUnderMouse.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                return;
            }

            // 初始化拖拽状态
            this.isDragging = false;
            this.shouldDrag = false;
            this.startX = e.clientX;
            this.startY = e.clientY;

            // 添加事件监听
            document.addEventListener('mousemove', this.handleFirstMove);
            document.addEventListener('mouseup', this.handleMouseUp);
        }
    };

    // 在 handleFirstMove 方法中添加拖拽状态标记
    handleFirstMove = (e) => {
        const dx = e.clientX - this.initialPosition.x;
        const dy = e.clientY - this.initialPosition.y;

        if (Math.sqrt(dx * dx + dy * dy) > this.dragThreshold) {
            this.isDragging = true; // 新增这行
            this.shouldDrag = true;
            this.dragLayer.style.cursor = 'grabbing';

            // 初始化画布坐标（从原handleMouseDown移动过来）
            this.canvasStartX = (this.startX - this.translateX) / this.scale;
            this.canvasStartY = (this.startY - this.translateY) / this.scale;

            document.removeEventListener('mousemove', this.handleFirstMove);
            document.addEventListener('mousemove', this.handleMouseMove);
            this.handleMouseMove(e);
        }
    };

    // 修改 handleMouseMove 方法
    handleMouseMove = (e) => {
        if (!this.isDragging) return; // 保持原有判断

        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // 修正坐标计算逻辑
        const deltaX = (mouseX - this.translateX) / this.scale - this.canvasStartX;
        const deltaY = (mouseY - this.translateY) / this.scale - this.canvasStartY;

        this.mergeOffset(deltaX * this.scale, deltaY * this.scale);
    };

    // 鼠标释放事件
    handleMouseUp = (e) => {
        // 清理事件监听
        document.removeEventListener('mousemove', this.handleFirstMove);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        // 如果没有触发拖拽则执行点击
        if (!this.shouldDrag) {
            this.dragLayer.style.pointerEvents = 'none';
            const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            this.dragLayer.style.pointerEvents = 'auto';
            if (elementUnderMouse) {
                elementUnderMouse.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
        }

        // 重置状态
        this.isDragging = false;
        this.shouldDrag = false;
        this.dragLayer.style.cursor = 'grab';
    };

    // 滚轮缩放事件
    handleWheel = (e) => {
        e.preventDefault();
        const originalScale = this.scale;
        const zoomFactor = this.zoomValue ** (e.deltaY > 0 ? 1 : -1);

        // 计算新缩放比例
        let newScale = originalScale * zoomFactor;
        newScale = Math.min(
            Math.max(newScale, Math.pow(this.zoomValue, this.zoomRange[1])),
            Math.pow(this.zoomValue, this.zoomRange[0])
        );
        newScale = Math.round(newScale * 100) / 100;
        this.scale = newScale;

        // 计算缩放中心
        const rect = this.dragLayer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 计算新的位移值
        const worldX = (mouseX - this.translateX) / originalScale;
        const worldY = (mouseY - this.translateY) / originalScale;

        const targetTranslateX = mouseX - worldX * this.scale;
        const targetTranslateY = mouseY - worldY * this.scale;

        // const dynamicThreshold = this.threshold;

        this.mergeOffset(targetTranslateX - this.translateX, targetTranslateY - this.translateY);
        this.updateTransform();
    };

    // 应用位移量
    mergeOffset(x, y) {
        this.accumulatedX += x;
        this.accumulatedY += y;

        if (Math.abs(this.accumulatedX) > this.threshold || Math.abs(this.accumulatedY) > this.threshold) {
            const offsetX = Math.floor(this.accumulatedX / this.threshold) * this.threshold;
            const offsetY = Math.floor(this.accumulatedY / this.threshold) * this.threshold;

            this.translateX += offsetX;
            this.translateY += offsetY;
            this.accumulatedX -= offsetX;
            this.accumulatedY -= offsetY;

            this.updateTransform();
        }
    }

    // 更新变换样式
    updateTransform() {
        this.dragSpace.style.transform =
            `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }
}

const styleElement = document.createElement('style');
styleElement.textContent = `
/*!* 可拖拽的弹窗 *!*/
/*.drag-space-container {*/
/*    user-select: none;*/
/*    -webkit-user-select: none;*/
/*    height: 100%;*/
/*}*/

/*.space-title-bar {*/
/*    user-select: none;*/
/*    -webkit-user-select: none;*/
/*}*/

.drag-layer {
    /*user-select: none;*/
    /*-webkit-user-select: none;*/
    overflow: hidden;
    cursor: grab;
    border: 2px solid #41b681;
}

/*.space-content {*/
/*    user-select: none;*/
/*    -webkit-user-select: none;*/
/*    overflow: hidden;*/
/*    transform-origin: 0 0;*/
/*    background-color: #4e4848;*/
/*    display: flex;*/
/*    flex-grow: 1;*/
/*    flex-shrink: 0;*/
/*    height: 100%;*/
/*    width: 100%;*/
/*    transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);*/
/*}*/

/*.space-content.dragging {*/
/*    cursor: grabbing; !* 拖拽时的鼠标样式 *!*/
/*    transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);*/
/*}*/
`

document.head.appendChild(styleElement);
