import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../manager.js';

const histories = `
<style>
.cell-history {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 10px;
}
.cell-history-content {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
}
.history-sheets-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
}
.history-sheet-container {
    display: none;
    border-radius: 5px;
    height: 100%;
}
.history-sheet-container.active {
    display: flex;
    flex: 1;
    border: 1px solid rgba(255, 255, 255, 0.2);
}
.history-cell-list {
    overflow-y: auto;
    width: 100%;
    /* 防止内容跳动 */
    will-change: transform;
    transform: translateZ(0);
}
.history-cell-item {
    display: flex;
    flex: 1;
    width: 100%;
    justify-content: space-between;
    margin-bottom: 5px;
    padding: 5px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}
</style>

<div class="cell-history">
    <h3>表格单元格历史记录</h3>
<!--    <div class="history-tabs">-->
<!--        &lt;!&ndash; 动态生成tabs &ndash;&gt;-->
<!--    </div>-->
    <div class="cell-history-content">
        <div class="history-sheets-content">
            <!-- 动态生成的单元格历史记录内容 -->
        </div>
    </div>
</div>
`

function scrollToBottom(container) {
    // 在弹窗显示后滚动到底部
    const contentContainer = $(container).find('.cell-history-content');
    contentContainer.scrollTop(contentContainer[0].scrollHeight);
}

function updateCellHistoryData(container) {

}

/**
 * 打开表格编辑历史记录弹窗
 * */
export async function openCellHistoryPopup(){
    const manager = histories;
    const cellHistoryPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: false });
    const historyContainer = $(cellHistoryPopup.dlg)[0];

    updateCellHistoryData(historyContainer);

    await cellHistoryPopup.show();

    scrollToBottom(historyContainer);
}
