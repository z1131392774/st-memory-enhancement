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
        this.zoomValue = 0.8;
        this.zoomRange = [-2, 5];
        this.elements = new Map();

        // 新增阈值变量
        this.dragThreshold = 5; // 移动超过5px视为拖拽
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

        // 创建可拖动内容层 (默认层级，在 dragLayer 下面)
        this.dragSpace = document.createElement('div');
        this.dragSpace.style.transformOrigin = '0 0';
        this.dragSpace.style.position = 'absolute';
        this.dragSpace.style.top = '0';
        this.dragSpace.style.left = '0';
        this.dragSpace.style.bottom = '0';
        this.dragSpace.style.willChange = 'transform'; // 优化：提示浏览器 transform 可能会变化
        this.dragContainer.appendChild(this.dragSpace);

        // 创建拖动事件层 (在中间层级，用于拖拽和事件捕获)
        this.dragLayer = document.createElement('div');
        this.dragLayer.style.position = 'absolute';
        this.dragLayer.style.top = '0';
        this.dragLayer.style.left = '0';
        this.dragLayer.style.bottom = '0';
        this.dragLayer.style.width = '100%';
        this.dragLayer.style.height = '100%';
        this.dragLayer.style.cursor = 'grab';
        this.dragLayer.style.userSelect = 'none';
        this.dragLayer.style.backgroundColor = 'transparent'; // 确保 dragLayer 不遮挡下方元素的 hover 效果
        this.dragContainer.appendChild(this.dragLayer);

        // 创建可拖动内容层 (置顶层级，在 dragLayer 上面)
        this.dragTopSpace = document.createElement('div');
        this.dragTopSpace.style.transformOrigin = '0 0';
        this.dragTopSpace.style.position = 'absolute';
        this.dragTopSpace.style.top = '0';
        this.dragTopSpace.style.left = '0';
        this.dragTopSpace.style.bottom = '0';
        this.dragTopSpace.style.willChange = 'transform'; // 优化：提示浏览器 transform 可能会变化
        this.dragContainer.appendChild(this.dragTopSpace);


        // 分离手机和电脑事件
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
            this.dragSpace.style.transition = 'transform 0.02s ease-out';
            this.dragTopSpace.style.transition = 'transform 0.02s ease-out';
            this.dragLayer.addEventListener('touchstart', this.handleMouseDown);
        } else {
            this.dragSpace.style.transition = 'transform 0.12s cubic-bezier(0.22, 1, 0.36, 1)';
            this.dragTopSpace.style.transition = 'transform 0.12s cubic-bezier(0.22, 1, 0.36, 1)';
            this.dragLayer.addEventListener('mousedown', this.handleMouseDown);
            this.dragLayer.addEventListener('wheel', this.handleWheel, { passive: false });
        }
    }

    /**
     * 获取渲染元素，用于挂载到页面上
     * @returns {HTMLDivElement}
     */
    get render() {
        return this.dragContainer;
    }

    /**
     * 添加元素，添加到默认层级 (dragLayer下面) ，支持设置初始位置，默认为[0, 0]
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
     * 添加元素到顶层级 (dragLayer上面)，支持设置初始位置，默认为[0, 0]
     * @example addToTop('name', element, [100, 100])
     * @param name
     * @param element
     * @param position
     */
    addToTop(name, element, position = [0, 0]) {
        element.style.position = 'absolute';
        element.style.left = `${position[0]}px`;
        element.style.top = `${position[1]}px`;
        this.dragTopSpace.appendChild(element);
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
            const element = this.elements.get(name);
            element.style.left = `${position[0]}px`;
            element.style.top = `${position[1]}px`;
        }
    }

    /**
     * 删除元素，同时会从页面上移除
     * @example delete('name')
     * @param name
     */
    delete(name) {
        if (this.elements.has(name)) {
            const element = this.elements.get(name);
            if (this.dragSpace.contains(element)) {
                this.dragSpace.removeChild(element);
            } else if (this.dragTopSpace.contains(element)) {
                this.dragTopSpace.removeChild(element);
            }
            this.elements.delete(name);
        }
    }


    /** ------------------ 以下为拖拽功能实现，为事件处理函数，不需要手动调用 ------------------ */
        // 鼠标按下事件
    handleMouseDown = (e) => {
        if (e.button === 0 || e.type === 'touchstart') {
            let clientX, clientY, touches;
            if (e.type === 'touchstart') {
                touches = e.touches;
                if (touches.length > 0) { // 确保 touches 数组不为空
                    clientX = touches[0].clientX;
                    clientY = touches[0].clientY;
                } else {
                    return; // 如果 touches 为空，则直接返回，不处理
                }
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            this.initialPosition.x = clientX;
            this.initialPosition.y = clientY;

            this.dragLayer.style.pointerEvents = 'none';
            const elementUnderMouse = document.elementFromPoint(clientX, clientY);
            this.dragLayer.style.pointerEvents = 'auto';

            if (elementUnderMouse?.closest('button, [onclick], a')) {
                elementUnderMouse.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                return;
            }

            this.isDragging = false;
            this.shouldDrag = false;
            this.startX = clientX;
            this.startY = clientY;

            // 分离手机和电脑事件
            if (e.type === 'touchstart') {
                document.addEventListener('touchmove', this.handleFirstMove, { passive: false }); // 优化：passive: false 显式声明可能preventDefault
                document.addEventListener('touchend', this.handleMouseUp, { passive: true }); // 优化：passive: true 声明不会preventDefault
            } else {
                document.addEventListener('mousemove', this.handleFirstMove, { passive: false }); // 优化：passive: false 显式声明可能preventDefault
                document.addEventListener('mouseup', this.handleMouseUp, { passive: true }); // 优化：passive: true 声明不会preventDefault
            }
        }
    };

    handleFirstMove = (e) => {
        let clientX, clientY, touches;
        if (e.type === 'touchmove') {
            touches = e.touches;
            if (touches.length > 0) {
                clientX = touches[0].clientX;
                clientY = touches[0].clientY;
            } else {
                return;
            }
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const dx = clientX - this.initialPosition.x;
        const dy = clientY - this.initialPosition.y;

        if (Math.sqrt(dx * dx + dy * dy) > this.dragThreshold) {
            this.isDragging = true;
            this.shouldDrag = true;
            this.dragLayer.style.cursor = 'grabbing';

            this.canvasStartX = (this.startX - this.translateX) / this.scale;
            this.canvasStartY = (this.startY - this.translateY) / this.scale;

            if (e.type === 'touchmove') {
                document.removeEventListener('touchmove', this.handleFirstMove);
                document.addEventListener('touchmove', this.handleMouseMove, { passive: false }); // 优化：passive: false 显式声明可能preventDefault
            } else {
                document.removeEventListener('mousemove', this.handleFirstMove);
                document.addEventListener('mousemove', this.handleMouseMove, { passive: false }); // 优化：passive: false 显式声明可能preventDefault
            }

            this.handleMouseMove(e);
        }
    };

    handleMouseMove = (e) => {
        if (!this.isDragging) return;

        let clientX, clientY, touches;
        if (e.type === 'touchmove') {
            touches = e.touches;
            if (touches.length > 0) {
                clientX = touches[0].clientX;
                clientY = touches[0].clientY;
            } else {
                return;
            }
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const deltaX = (clientX - this.translateX) / this.scale - this.canvasStartX;
        const deltaY = (clientY - this.translateY) / this.scale - this.canvasStartY;

        this.mergeOffset(deltaX * this.scale, deltaY * this.scale);
    };


    // 鼠标释放事件
    handleMouseUp = (e) => {
        // 分离手机和电脑事件
        if (e.type === 'touchend') {
            document.removeEventListener('touchmove', this.handleFirstMove);
            document.removeEventListener('touchmove', this.handleMouseMove);
            document.removeEventListener('touchend', this.handleMouseUp);
        } else {
            document.removeEventListener('mousemove', this.handleFirstMove);
            document.removeEventListener('mousemove', this.handleMouseMove);
            document.removeEventListener('mouseup', this.handleMouseUp);
        }

        // 如果没有触发拖拽则执行点击
        if (!this.shouldDrag) {
            this.dragLayer.style.pointerEvents = 'none';
            let clientX, clientY;

            if (e.type === 'touchend' && e.changedTouches && e.changedTouches.length > 0) { // 检查 e.changedTouches 是否存在且不为空
                const touch = e.changedTouches[0]; // 获取第一个 touch 对象
                if (touch) { // 确保 touch 对象存在
                    clientX = touch.clientX;
                    clientY = touch.clientY;
                } else {
                    clientX = NaN; // 如果 touch 不存在，则设置为 NaN，表示无效坐标
                    clientY = NaN;
                }
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            // 检查 clientX 和 clientY 是否是有效的数字
            if (typeof clientX === 'number' && isFinite(clientX) && typeof clientY === 'number' && isFinite(clientY)) {
                const elementUnderMouse = document.elementFromPoint(clientX, clientY);
                if (elementUnderMouse) {
                    elementUnderMouse.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
            } else {
                console.warn("Invalid coordinates for elementFromPoint:", clientX, clientY, e); // 打印警告信息，方便调试
            }
        }

        // 重置状态
        this.isDragging = false;
        this.shouldDrag = false;
        this.dragLayer.style.cursor = 'grab';
        this.dragLayer.style.pointerEvents = 'auto';
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

    updateTransform() {
        requestAnimationFrame(() => {
            this.dragSpace.style.transform =
                `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
            this.dragTopSpace.style.transform =
                `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
        });
    }
}
