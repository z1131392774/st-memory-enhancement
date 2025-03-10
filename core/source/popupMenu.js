// popupMenu.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';

/**
 * @description 弹出菜单类 - 用于创建和管理弹出菜单
 */
export class PopupMenu {
    /**
     * 构造函数
     * @param {object} [options] - 可选配置项
     * @param {boolean} [options.lasting=false] - 是否持久化，为 true 时点击外部或菜单项点击后不销毁实例，只隐藏
     */
    constructor(options = {}) {
        this.menuItems = [];
        this.lasting = options.lasting === true;

        this.popupContainer = document.createElement('div');
        this.popupContainer.style.position = 'absolute';
        this.popupContainer.style.display = 'none';
        this.popupContainer.style.zIndex = '1000';

        this.menuContainer = $('<div class="options-content"></div>')[0];
        this.menuContainer.style.position = 'relative';
        this.menuContainer.style.backgroundColor = 'var(--SmartThemeBlurTintColor)';
        this.menuContainer.style.backdropFilter = 'blur(var(--SmartThemeBlurStrength))';
        this.menuContainer.style.webkitBackdropFilter = 'blur(var(--SmartThemeBlurStrength))';

        this.popupContainer.appendChild(this.menuContainer);

        this.handleMenuItemClick = this.handleMenuItemClick.bind(this);
        this.handleClickOutside = this.handleClickOutside.bind(this);

        this.popupContainer.addEventListener('click', this.handleMenuItemClick);
        this.popupContainer.classList.add('blur_strength');

        // 使用 Map 存储菜单项与其索引的映射关系
        this.menuItemIndexMap = new Map();
    }

    add(html, event) {
        const index = this.menuItems.length;
        this.menuItems.push({ html, event });
        this.menuItemIndexMap.set(html, index); // 存储 HTML 内容与索引的映射
    }

    render() {
        this.menuContainer.innerHTML = '';

        this.menuItems.forEach((item, index) => {
            const menuItem = document.createElement('div');
            menuItem.innerHTML = item.html;
            menuItem.style.padding = '5px 10px';
            menuItem.style.cursor = 'pointer';
            menuItem.style.userSelect = 'none';
            menuItem.classList.add('popup-menu-item', 'list-group-item', 'flex-container', 'flexGap5', 'interactable');
            this.menuContainer.appendChild(menuItem);

            // 存储菜单项元素与索引的映射
            this.menuItemIndexMap.set(menuItem, index);
        });

        return this.popupContainer;
    }

    handleMenuItemClick(event) {
        const menuItemElement = event.target.closest('.popup-menu-item');
        if (menuItemElement) {
            // 直接从 Map 中获取索引
            const index = this.menuItemIndexMap.get(menuItemElement);
            if (index !== undefined && this.menuItems[index].event) {
                this.menuItems[index].event(event);
                if (this.lasting) {
                    this.hide();
                } else {
                    this.destroy();
                }
            }
        }
    }

    /**
     * 显示菜单
     * @param {number} x - 菜单显示的横坐标 (相对于父元素)
     * @param {number} y - 菜单显示的纵坐标 (相对于父元素)
     */
    show(x = 0, y = 0) {
        this.popupContainer.style.left = `${x}px`;
        this.popupContainer.style.top = `${y}px`;
        this.popupContainer.style.display = 'block';

        // --- DEBUGGING STYLES ---
        // this.popupContainer.style.backgroundColor = 'rgba(255, 0, 0, 0.0)'; // Red background, semi-transparent
        this.popupContainer.style.width = '200px';  // Fixed width
        this.popupContainer.style.height = 'auto'; // Fixed height
        this.popupContainer.style.border = '1px solid rgba(0,0,0,0.1)';

        setTimeout(() => {
            document.addEventListener('click', this.handleClickOutside.bind(this));
        }, 0);
    }

    /**
     * 隐藏菜单
     */
    hide() {
        this.popupContainer.style.display = 'none';
        document.removeEventListener('click', this.handleClickOutside.bind(this));
    }

    /**
     * 销毁菜单实例，从 DOM 中移除
     */
    destroy() {
        document.removeEventListener('click', this.handleClickOutside.bind(this));
        if (this.popupContainer.parentNode) { // 检查 popupContainer 是否有父节点
            this.popupContainer.parentNode.removeChild(this.popupContainer); // 从 DOM 中移除外层容器，彻底销毁
        }
    }

    /**
     * 处理点击菜单外部区域，用于关闭菜单
     * @param {MouseEvent} event
     */
    handleClickOutside(event) {
        if (!this.popupContainer.contains(event.target)) {
            if (this.lasting) {
                this.hide();
            } else {
                this.destroy();
            }
        }
    }
}
