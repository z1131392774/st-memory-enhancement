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
        // 初始化菜单项
        this.menuItems = [];
        // 是否持久化，默认 false
        this.lasting = options.lasting === true;

        // 创建外层容器
        this.popupContainer = document.createElement('div');
        this.popupContainer.style.position = 'absolute'; // 外层容器使用绝对定位，方便 show 方法定位
        this.popupContainer.style.display = 'none'; // 初始隐藏
        this.popupContainer.style.zIndex = '1000';

        // 创建菜单内容容器 (之前叫做 menuContainer，现在继续沿用)
        this.menuContainer = document.createElement('div');
        this.menuContainer.style.position = 'relative'; // 菜单内容容器使用相对定位
        this.menuContainer.style.backgroundColor = '#0002';
        this.menuContainer.style.border = '1px solid rgba(0,0,0,0.1)';
        this.menuContainer.style.padding = '5px';
        this.menuContainer.style.boxShadow = '2px 2px 5px rgba(0,0,0,0.3)';

        this.popupContainer.appendChild(this.menuContainer); // 将菜单内容容器添加到外层容器中

        // 事件委托处理菜单项点击事件，监听在外层容器上
        this.popupContainer.addEventListener('click', this.handleMenuItemClick.bind(this));
    }

    /**
     * 添加菜单项
     * @param {string} html - 菜单项的 HTML 内容
     * @param {function} event - 点击菜单项时执行的函数
     */
    add(html, event) {
        this.menuItems.push({ html, event });
    }

    /**
     * 渲染菜单 HTML 结构并返回外层容器元素 (popupContainer)
     * @returns {HTMLDivElement} - 外层容器元素
     */
    render() {
        // 清空之前的菜单内容
        this.menuContainer.innerHTML = '';

        // 遍历菜单项，创建菜单项元素
        this.menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.innerHTML = item.html;
            menuItem.style.padding = '5px 10px';
            menuItem.style.cursor = 'pointer';
            menuItem.style.userSelect = 'none';
            menuItem.classList.add('popup-menu-item'); // 添加类名方便事件委托和样式控制
            this.menuContainer.appendChild(menuItem); // 将菜单项添加到 menuContainer 中
        });

        document.body.appendChild(this.popupContainer); // 将外层容器添加到 body 中，保证渲染后能显示出来
        return this.popupContainer; // 返回外层容器
    }

    /**
     * 显示菜单
     * @param {number} x - 菜单显示的横坐标
     * @param {number} y - 菜单显示的纵坐标
     */
    show(x = 0, y = 0) {
        this.popupContainer.style.left = `${x}px`;
        this.popupContainer.style.top = `${y}px`;
        this.popupContainer.style.display = 'block';
        // 添加全局点击事件监听，点击菜单外部时关闭菜单
        setTimeout(() => { // 延迟绑定，避免立即触发 document 的 click 事件
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
     * 处理菜单项点击事件 (事件委托)
     * @param {MouseEvent} event
     */
    handleMenuItemClick(event) {
        // 修改点: 使用 closest 向上查找 .popup-menu-item 元素
        const menuItemElement = event.target.closest('.popup-menu-item');
        if (menuItemElement) {
            // 找到菜单项元素后，再获取索引
            const index = Array.from(this.menuContainer.children).indexOf(menuItemElement);
            if (index !== -1 && this.menuItems[index].event) {
                this.menuItems[index].event(event); // 执行菜单项绑定的事件
                if (this.lasting) {
                    this.hide(); // 持久化模式下点击菜单项后隐藏菜单
                } else {
                    this.destroy(); // 非持久化模式下点击菜单项后销毁菜单
                }
            }
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
