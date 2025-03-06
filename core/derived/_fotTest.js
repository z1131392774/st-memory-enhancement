// _fotTest.js
import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../manager.js';

/**
 * @description 测试模块 - 用于测试功能
 */
const enableTest = false;

let testInstanceEnabled = false;
export async function openTestPopup(){
    if (enableTest === false || testInstanceEnabled === true) return;

    const manager = await SYSTEM.getComponent('test');
    const testPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true });
    const $dlg = $(testPopup.dlg);
    const $testContent = $dlg.find('#testSpace'); // 获取 test.html 中的 <div id="draggableSpace" class="space-content"> 组件

    // 在$testContent中添加一个按钮
    const $btn = $('<button>弹出测试菜单</button>');
    $testContent.append($btn);



    // 按钮点击事件处理函数
    $btn.on('click', function(event) {
        let menu = new EDITOR.PopupMenu();
        menu.add('<span>选项一</span>', () => console.log('点击了选项一'));
        menu.add('<span><b>选项二</b></span>', () => {console.log('点击了选项二'); alert('选项二被点击了！')});
        menu.add('<span>选项三</span>', (event) => console.log('点击了选项三', event));
        $testContent.append(menu.render());
        menu.show(event.clientX, event.clientY);
    });


    testInstanceEnabled = true;
    await testPopup.show();
    testInstanceEnabled = false;
}


/**
 * 生成测试表格, 用于拖动和缩放测试
 * @returns {HTMLTableElement}
 */
function generateTestTable() {
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    for (let i = 20; i < 40; i++) {
        const row = table.insertRow();
        for (let j = 0; j < 10; j++) {
            const cell = row.insertCell();
            // cell.style.border = '1px solid #ccc';
            cell.style.padding = '8px';
            cell.textContent = `Cell ${i}-${j}`;
        }
    }
    return table;
}
