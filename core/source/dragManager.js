// dragManager.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';

/**
 * @description 拖拽管理器 - 用于管理拖拽操作，支持鼠标拖拽、触摸拖拽和双指缩放
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

        // 拖拽阈值
        this.dragThreshold = 10;
        this.initialPosition = { x: 0, y: 0 };
        this.shouldDrag = false;

        // 双指缩放相关状态
        this.isPinching = false; // 新增：是否正在进行双指缩放
        this.initialPinchDistance = null; // 新增：初始双指距离
        this.initialPinchCenter = null; // 新增：初始双指中心点

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

        // 移动端事件绑定
        this.dragLayer.addEventListener('touchstart', this.handleTouchStart);
        this.dragLayer.addEventListener('wheel', this.handleWheel, { passive: false }); // wheel 事件保持不变，移动端也可能支持滚轮缩放
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
        // 统一获取坐标的函数
    getPointFromEvent = (e) => {
        if (e.touches && e.touches.length > 0) { // 触摸事件
            return {
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            };
        } else { // 鼠标事件
            return {
                clientX: e.clientX,
                clientY: e.clientY
            };
        }
    }

    // 鼠标按下事件
    handleMouseDown = (e) => {
        if (e.button !== 0) return; // 鼠标事件只处理左键

        const point = this.getPointFromEvent(e); // 获取统一的坐标

        // 保存初始位置
        this.initialPosition.x = point.clientX;
        this.initialPosition.y = point.clientY;

        // 临时禁用指针事件，检测下方元素是否可交互
        this.dragLayer.style.pointerEvents = 'none';
        const elementUnderMouse = document.elementFromPoint(point.clientX, point.clientY);
        this.dragLayer.style.pointerEvents = 'auto';

        // 如果点击的是可交互元素则直接返回，不进行拖拽
        if (elementUnderMouse?.closest('button, [onclick], a')) {
            elementUnderMouse.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            return;
        }

        // 初始化拖拽状态
        this.isDragging = false;
        this.shouldDrag = false;
        this.startX = point.clientX;
        this.startY = point.clientY;

        // 添加事件监听
        document.addEventListener('mousemove', this.handleFirstMove);
        document.addEventListener('mouseup', this.handleMouseUp);

        e.preventDefault(); // 阻止默认的鼠标事件行为，例如文本选中
    };

    // 触摸开始事件
    handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            // 双指操作，进入双指缩放逻辑
            this.handlePinchStart(e);
        } else if (e.touches.length === 1) {
            // 单指操作，进入单指拖拽逻辑
            this.handleDragStart(e);
        }

        e.preventDefault(); // 阻止默认的触摸事件行为，例如页面滚动
    };

    // 处理单指拖拽开始
    handleDragStart = (e) => {
        const point = this.getPointFromEvent(e); // 获取统一的坐标

        // 保存初始位置
        this.initialPosition.x = point.clientX;
        this.initialPosition.y = point.clientY;

        // 初始化拖拽状态
        this.isDragging = false;
        this.shouldDrag = false;
        this.startX = point.clientX;
        this.startY = point.clientY;

        // 添加事件监听
        document.addEventListener('touchmove', this.handleTouchMove);
        document.addEventListener('touchend', this.handleTouchEnd);
        document.addEventListener('touchcancel', this.handleTouchEnd);
    };

    // 处理双指缩放开始
    handlePinchStart = (e) => {
        this.isPinching = true; // 标记为正在进行双指缩放

        // 计算初始双指距离
        this.initialPinchDistance = Math.hypot(
            e.touches[1].clientX - e.touches[0].clientX,
            e.touches[1].clientY - e.touches[0].clientY
        );

        // 计算初始双指中心点
        this.initialPinchCenter = {
            x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
            y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };

        // 添加事件监听
        document.addEventListener('touchmove', this.handleTouchMove);
        document.addEventListener('touchend', this.handleTouchEnd);
        document.addEventListener('touchcancel', this.handleTouchEnd);
    };


    // 添加拖拽状态标记 (鼠标和触摸共用)
    handleFirstMove = (e) => {
        const point = this.getPointFromEvent(e); // 获取统一的坐标
        const dx = point.clientX - this.initialPosition.x;
        const dy = point.clientY - this.initialPosition.y;

        if (Math.sqrt(dx * dx + dy * dy) > this.dragThreshold) {
            this.isDragging = true;
            this.shouldDrag = true;
            this.dragLayer.style.cursor = 'grabbing';

            // 初始化画布坐标
            this.canvasStartX = (this.startX - this.translateX) / this.scale;
            this.canvasStartY = (this.startY - this.translateY) / this.scale;

            document.removeEventListener('mousemove', this.handleFirstMove); // 移除 mousemove firstMove 监听
            document.removeEventListener('touchmove', this.handleFirstMove); // 移除 touchmove firstMove 监听 (避免重复添加)

            if (e.type === 'mousemove') {
                document.addEventListener('mousemove', this.handleMouseMove); // 添加 mousemove 监听
                this.handleMouseMove(e); // 立即执行 mouse move
            } else if (e.type === 'touchmove') {
                document.addEventListener('touchmove', this.handleDragMove); // 添加 touchmove 监听 (注意这里是 handleDragMove)
                this.handleDragMove(e); // 立即执行 touch move
            }
        }
    };

    // 支持触摸和鼠标移动
    handleTouchMove = (e) => {
        if (this.isPinching && e.touches.length === 2) {
            // 双指缩放
            this.handlePinchMove(e);
        } else if (!this.isPinching && e.touches.length === 1) {
            // 单指拖拽
            if (!this.isDragging) {
                // 首次 move 判断是否触发拖拽
                this.handleFirstMove({ ...e, type: 'touchmove' });
                if (!this.isDragging) return; // 未触发拖拽则直接返回
            }
            this.handleDragMove(e);
        }
        e.preventDefault(); // 阻止默认的触摸事件行为，例如页面滚动
    };

    // 处理单指拖拽移动
    handleDragMove = (e) => {
        if (!this.isDragging) return;

        const point = this.getPointFromEvent(e); // 获取统一的坐标
        const mouseX = point.clientX;
        const mouseY = point.clientY;

        // 修正坐标计算逻辑
        const deltaX = (mouseX - this.translateX) / this.scale - this.canvasStartX;
        const deltaY = (mouseY - this.translateY) / this.scale - this.canvasStartY;

        this.mergeOffset(deltaX * this.scale, deltaY * this.scale);
    };

    // 处理双指缩放移动
    handlePinchMove = (e) => {
        if (!this.isPinching) return;

        // 获取两个触摸点
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        // 计算当前双指距离
        const currentPinchDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );

        // 计算当前双指中心点
        const currentPinchCenterX = (touch1.clientX + touch2.clientX) / 2;
        const currentPinchCenterY = (touch1.clientY + touch2.clientY) / 2;

        if (!this.initialPinchDistance) { // 首次双指移动, ...
            this.initialPinchDistance = currentPinchDistance;
            this.initialPinchCenter = { x: currentPinchCenterX, y: currentPinchCenterY };
            return;
        }

        // 计算缩放比例
        const scaleFactor = currentPinchDistance / this.initialPinchDistance;
        let newScale = this.scale * scaleFactor;

        // 限制缩放范围
        newScale = Math.min(
            Math.max(newScale, Math.pow(this.zoomValue, this.zoomRange[1])),
            Math.pow(this.zoomValue, this.zoomRange[0])
        );
        newScale = Math.round(newScale * 100) / 100;

        // 计算缩放中心的世界坐标 - 使用 *当前* 中心点
        const worldX = (currentPinchCenterX - this.translateX) / this.scale; // 修改为 currentPinchCenterX
        const worldY = (currentPinchCenterY - this.translateY) / this.scale; // 修改为 currentPinchCenterY

        // 计算新的位移值，保持缩放中心在屏幕上的位置不变
        const targetTranslateX = currentPinchCenterX - worldX * newScale;
        const targetTranslateY = currentPinchCenterY - worldY * newScale;

        this.scale = newScale;
        this.mergeOffset(targetTranslateX - this.translateX, targetTranslateY - this.translateY);
        this.updateTransform();

        this.initialPinchDistance = currentPinchDistance; // 更新初始距离，用于下次计算
        this.initialPinchCenter = { x: currentPinchCenterX, y: currentPinchCenterY }; // 更新中心点
    };


    // 鼠标移动事件
    handleMouseMove = (e) => {
        if (!this.isDragging) return;

        const point = this.getPointFromEvent(e); // 获取统一的坐标
        const mouseX = point.clientX;
        const mouseY = point.clientY;

        // 修正坐标计算逻辑
        const deltaX = (mouseX - this.translateX) / this.scale - this.canvasStartX;
        const deltaY = (mouseY - this.translateY) / this.scale - this.canvasStartY;

        this.mergeOffset(deltaX * this.scale, deltaY * this.scale);
    };

    // 鼠标释放事件
    handleMouseUp = (e) => {
        // 清理鼠标事件监听
        document.removeEventListener('mousemove', this.handleFirstMove);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);

        if (!this.shouldDrag) {
            // 如果没有触发拖拽，则模拟点击
            this.dragLayer.style.pointerEvents = 'none';
            const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY);
            this.dragLayer.style.pointerEvents = 'auto';
            if (elementUnderMouse) {
                elementUnderMouse.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
        }

        // 重置拖拽状态
        this.isDragging = false;
        this.shouldDrag = false;
        this.dragLayer.style.cursor = 'grab';
    };

    // 触摸结束事件
    handleTouchEnd = (e) => {
        // 清理触摸事件监听
        document.removeEventListener('touchmove', this.handleTouchMove);
        document.removeEventListener('touchend', this.handleTouchEnd);
        document.removeEventListener('touchcancel', this.handleTouchEnd);

        // 重置拖拽和缩放状态
        this.isDragging = false;
        this.shouldDrag = false;
        this.isPinching = false; // 重置双指缩放状态
        this.initialPinchDistance = null;
        this.initialPinchCenter = null;
        this.dragLayer.style.cursor = 'grab';
    };

    // 触摸取消事件 (例如触摸点超出屏幕)
    handleTouchCancel = (e) => {
        // 触摸取消时，也需要重置状态，与 touchEnd 类似
        this.handleTouchEnd(e);
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
        requestAnimationFrame(() => {
            this.dragSpace.style.transform =
                `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
        });
    }
}
