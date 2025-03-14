import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../manager.js';
import { deleteRow, insertRow, updateRow } from "../tableActions.js";
import JSON5 from '../../utils/json5.min.mjs'

/**
 * 验证函数字符串格式是否正确
 * @param {string} funcStr 函数字符串
 * @returns {boolean} true 如果格式正确，false 否则
 */
function validateFunctionFormat(funcStr) {
    const trimmedFuncStr = funcStr.trim();
    if (!(trimmedFuncStr.startsWith('insertRow') || trimmedFuncStr.startsWith('updateRow') || trimmedFuncStr.startsWith('deleteRow'))) {
        return false;
    }

    const functionName = trimmedFuncStr.split('(')[0];
    const paramsStr = trimmedFuncStr.substring(trimmedFuncStr.indexOf('(') + 1, trimmedFuncStr.lastIndexOf(')'));
    const params = parseFunctionDetails(trimmedFuncStr).params; // Reuse parseFunctionDetails to get params array

    if (functionName === 'insertRow') {
        if (params.length !== 2) return false;
        if (typeof params[0] !== 'number') return false;
        if (typeof params[1] !== 'object' || params[1] === null) return false;
        for (const key in params[1]) {
            if (params[1].hasOwnProperty(key) && isNaN(Number(key))) return false;
        }
    } else if (functionName === 'updateRow') {
        if (params.length !== 3) return false;
        if (typeof params[0] !== 'number') return false;
        if (typeof params[1] !== 'number') return false;
        if (typeof params[2] !== 'object' || params[2] === null) return false;
        for (const key in params[2]) {
            if (params[2].hasOwnProperty(key) && isNaN(Number(key))) return false;
        }
    } else if (functionName === 'deleteRow') {
        if (params.length !== 2) return false;
        if (typeof params[0] !== 'number') return false;
        if (typeof params[1] !== 'number') return false;
    }
    return true;
}


/**
 * 解析函数调用字符串，提取函数名和参数 (JSON 感知)
 * @param {string} funcStr 函数调用字符串
 * @returns {object} 包含函数名和参数的对象，参数为数组
 */
function parseFunctionDetails(funcStr) {
    const nameMatch = funcStr.match(/^(insertRow|updateRow|deleteRow)\(/);
    const name = nameMatch ? nameMatch[1] : funcStr.split('(')[0];
    let paramsStr = funcStr.substring(funcStr.indexOf('(') + 1, funcStr.lastIndexOf(')'));
    let params = [];

    if (paramsStr) {
        let currentParam = '';
        let bracketLevel = 0;
        let quoteLevel = 0;

        for (let i = 0; i < paramsStr.length; i++) {
            const char = paramsStr[i];

            if (quoteLevel === 0 && char === '{') {
                bracketLevel++;
                currentParam += char;
            } else if (quoteLevel === 0 && char === '}') {
                bracketLevel--;
                currentParam += char;
            } else if (quoteLevel === 0 && char === ',' && bracketLevel === 0) {
                params.push(parseParamValue(currentParam.trim()));
                currentParam = '';
            } else if (quoteLevel === 0 && (char === '"' || char === "'")) {
                quoteLevel = (char === '"' ? 2 : 1);
                currentParam += char;
            } else if (quoteLevel !== 0 && char === (quoteLevel === 2 ? '"' : "'") && paramsStr[i-1] !== '\\') {
                quoteLevel = 0;
                currentParam += char;
            }
            else {
                currentParam += char;
            }
        }
        if (currentParam.trim()) {
            params.push(parseParamValue(currentParam.trim()));
        }
    }
    return { name, params };
}

/**
 * 解析参数值，尝试解析为数字或 JSON，否则作为字符串返回
 * @param {string} paramStr 参数字符串
 * @returns {any} 解析后的参数值
 */
function parseParamValue(paramStr) {
    const trimmedParam = paramStr.trim();
    const num = Number(trimmedParam);
    if (!isNaN(num)) {
        return num;
    }
    if (trimmedParam.startsWith('{') && trimmedParam.endsWith('}')) {
        try {
            return JSON5.parse(trimmedParam);
        } catch (e) {
            // JSON 解析失败，返回原始字符串 (可能不是有效的 JSON 字符串)
        }
    }
    if (trimmedParam.startsWith('"') && trimmedParam.endsWith('"') || trimmedParam.startsWith("'") && trimmedParam.endsWith("'")) {
        return trimmedParam.slice(1, -1);
    }
    return trimmedParam;
}

/**
 * 渲染参数表格，根据函数类型进行优化显示
 * @param {string} functionName 函数名 (insertRow, updateRow, deleteRow)
 * @param {array} params 参数数组
 * @returns {object} 包含参数表格和 index 数据的对象
 */
function renderParamsTable(functionName, params) {
    const $table = $('<table>').addClass('params-table');
    const $tbody = $('<tbody>');
    let indexData = {}; // 用于存储 index 数据的对象

    // 提取公共的 Table Index 和 Row Index 添加逻辑
    const addIndexRows = (tableIndex, rowIndex) => {
        if (typeof tableIndex === 'number') {
            $tbody.append($('<tr>').append($('<th style="color: #82e8ff; font-weight: bold;">').text('#')).append($('<td>').text(tableIndex, ))); // 加粗
            indexData.tableIndex = tableIndex; // 存储 tableIndex
        }
        if (typeof rowIndex === 'number') {
            $tbody.append($('<tr>').append($('<th style="color: #82e8ff; font-weight: bold;">').text('^')).append($('<td>').text(rowIndex))); // 加粗
            indexData.rowIndex = rowIndex; // 存储 rowIndex
        }
    };

    if (functionName === 'insertRow') {
        // insertRow(tableIndex:number, data:{[colIndex:number]:string|number})
        const tableIndex = params[0];
        const data = params[1];

        if (typeof tableIndex === 'number' && data && typeof data === 'object') {
            addIndexRows(tableIndex, tableIndex); // 仅添加 Table Index
            for (const colIndex in data) {
                if (data.hasOwnProperty(colIndex)) {
                    const value = data[colIndex];
                    $tbody.append($('<tr>').append($('<th>').text(`${colIndex}`)).append($('<td>').text(value)));
                }
            }
        } else {
            $tbody.append(createRawParamsRow(params));
        }
    } else if (functionName === 'updateRow') {
        // updateRow(tableIndex:number, rowIndex:number, data:{[colIndex:number]:string|number})
        const tableIndex = params[0];
        const rowIndex = params[1];
        const data = params[2];

        if (typeof tableIndex === 'number' && typeof rowIndex === 'number' && data && typeof data === 'object') {
            addIndexRows(tableIndex, rowIndex); // 添加 Table Index 和 Row Index
            for (const colIndex in data) {
                if (data.hasOwnProperty(colIndex)) {
                    const value = data[colIndex];
                    $tbody.append($('<tr>').append($('<th>').text(`${colIndex}`)).append($('<td>').text(value)));
                }
            }
        } else {
            $tbody.append(createRawParamsRow(params));
        }
    } else if (functionName === 'deleteRow') {
        // deleteRow(tableIndex:number, rowIndex:number)
        const tableIndex = params[0];
        const rowIndex = params[1];

        if (typeof tableIndex === 'number' && typeof rowIndex === 'number') {
            addIndexRows(tableIndex, rowIndex); // 添加 Table Index 和 Row Index
        } else {
            $tbody.append(createRawParamsRow(params));
        }
    } else {
        $tbody.append(createRawParamsRow(params));
    }

    $table.append($tbody);
    return { $table, indexData }; // 返回包含 $table 和 indexData 的对象
}

/**
 * 创建显示原始参数的表格行
 * @param {object} params 参数对象
 * @returns {JQuery<HTMLElement>} 包含原始参数的表格行
 */
function createRawParamsRow(params) {
    const $tr = $('<tr>');
    $tr.append($('<th>').text('Raw Parameters'));
    $tr.append($('<td>').text(JSON.stringify(params)));
    return $tr;
}

/**
 * 打开表格编辑历史记录弹窗
 * */
export async function openTableHistoryPopup(){
    const manager = await SYSTEM.getTemplate('history');
    const tableHistoryPopup = new EDITOR.Popup(manager, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: true });
    const tableEditHistory = USER.getContext().chat;
    const $dlg = $(tableHistoryPopup.dlg);
    const $tableHistory = $dlg.find('#tableHistory');
    $tableHistory.empty();
    console.log(tableEditHistory);

    if (tableEditHistory && tableEditHistory.length > 0) {
        // 倒序遍历聊天记录，从最新的消息开始处理
        for (let i = tableEditHistory.length - 1; i >= 0; i--) {
            const item = tableEditHistory[i];
            // 过滤掉用户消息
            if (!item.is_user) {
                const mesContent = item.mes;
                // 解析消息内容，提取表格编辑信息
                if (mesContent) {
                    const tableEditMatch = mesContent.match(/<tableEdit>(.*?)<\/tableEdit>/s);
                    // 如果匹配到表格编辑信息
                    if (tableEditMatch) {
                        const tableEditBlock = tableEditMatch[1].trim();
                        const commentMatch = tableEditBlock.match(/<!--(.*?)-->/s);
                        // 如果匹配到注释信息
                        if (commentMatch) {
                            const commentContent = commentMatch[1].trim();
                            const functions = commentContent.split('\n')
                                .map(line => line.trim())
                                .filter(line => line.startsWith('insertRow') || line.startsWith('updateRow') || line.startsWith('deleteRow'));
                            // 处理函数列表
                            if (functions.length > 0) {
                                const $historyGroup = $('<div>').addClass('history-group');
                                // 如果不是最后一条消息，添加可折叠 class
                                if (i < tableEditHistory.length - 1) {
                                    $historyGroup.addClass('collapsible-history-group');
                                }
                                // 在 history-group 级别创建原始消息按钮 和 折叠按钮
                                const $buttonGroup = $('<div>').addClass('history-button-group'); // 创建按钮组容器
                                const $originalButton = $('<button><i class="fa-solid fa-quote-left"></i>')
                                    .addClass('original-message-button')
                                    .on('click', function(e) {
                                        e.stopPropagation(); // 阻止事件冒泡
                                        const $currentHistoryGroup = $(this).closest('.history-group');
                                        const $originalMessageDisplay = $currentHistoryGroup.find('.original-message-display');

                                        if ($originalMessageDisplay.is(':visible')) {
                                            // 如果原始消息当前是显示的，切换回表格视图
                                            $originalMessageDisplay.hide();
                                            $currentHistoryGroup.find('.history-item').show();
                                            $currentHistoryGroup.find('.params-table').show(); // 确保参数表格也显示出来
                                        } else {
                                            // 如果原始消息当前是隐藏的，显示原始消息
                                            $currentHistoryGroup.find('.history-item').hide();
                                            $currentHistoryGroup.find('.params-table').hide();
                                            if ($originalMessageDisplay.length === 0) { // 避免重复添加
                                                const $newMessageDisplay = $('<div>').addClass('original-message-display').text(`原始消息内容:\n\n${mesContent}`);
                                                $currentHistoryGroup.append($newMessageDisplay); // 添加原始消息展示
                                            } else {
                                                $originalMessageDisplay.show(); // 如果已存在则显示
                                            }
                                        }
                                    });
                                const $collapseButton = $('<button><i class="fa-solid fa-square-caret-down"></i></button>')
                                    .addClass('collapse-button')
                                    .on('click', function(e) {
                                        e.stopPropagation(); // 阻止事件冒泡
                                        const $currentHistoryGroup = $(this).closest('.history-group');
                                        const $paramsTable = $currentHistoryGroup.find('.params-table');
                                        const $indexPreview = $currentHistoryGroup.find('.index-preview'); // 获取预览元素
                                        const $icon = $(this).find('i');

                                        $paramsTable.slideToggle();
                                        $indexPreview.slideToggle(); // 同时切换预览元素的显示

                                        if ($paramsTable.is(':visible')) {
                                            $icon.removeClass('fa-square-caret-down').addClass('fa-square-caret-up');
                                        } else {
                                            $icon.removeClass('fa-square-caret-up').addClass('fa-square-caret-down');
                                        }
                                    });
                                $buttonGroup.append($collapseButton); // 将折叠按钮添加到按钮组
                                $buttonGroup.append($originalButton); // 将原始消息按钮添加到按钮组
                                $historyGroup.append($buttonGroup); // 将按钮组添加到 history-group

                                functions.forEach((func, funcIndex) => { // functions.forEach 添加 index
                                    const isValidFormat = validateFunctionFormat(func);
                                    const $funcItem = $('<div>').addClass('history-item');
                                    const $leftRectangle = $('<div>').addClass('left-rectangle');
                                    if (isValidFormat) {
                                        const funcDetails = parseFunctionDetails(func);
                                        const $itemIndex = $('<div>').addClass('item-index').text(`${funcIndex}`);
                                        const renderResult = renderParamsTable(funcDetails.name, funcDetails.params); // 获取 renderParamsTable 的返回结果
                                        const $paramsTable = renderResult.$table; // 从返回结果中获取 $table
                                        const indexData = renderResult.indexData; // 从返回结果中获取 indexData
                                        const funcIcon = renderWithType();

                                        // 根据函数类型添加不同的背景色和图标
                                        function renderWithType() {
                                            if (func.startsWith('insertRow')) {
                                                $leftRectangle.addClass('insert-item');
                                                return `<i class="fa-solid fa-plus"></i>`;
                                            } else if (func.startsWith('updateRow')) {
                                                $leftRectangle.addClass('update-item');
                                                return `<i class="fa-solid fa-pen"></i>`;
                                            } else if (func.startsWith('deleteRow')) {
                                                $leftRectangle.addClass('delete-item');
                                                return `<i class="fa-solid fa-trash"></i>`;
                                            }
                                            return '';
                                        }
                                        $funcItem.append($leftRectangle);
                                        $funcItem.append($itemIndex); // 将序号添加到 history-item 的最前面
                                        $funcItem.append($paramsTable);

                                        if (i < tableEditHistory.length - 1) $paramsTable.hide();   // 如果是可折叠的 history-group，初始隐藏参数表格
                                    } else {
                                        // 添加序号 div，即使是错误格式也添加序号
                                        const $itemIndex = $('<div>').addClass('item-index').addClass('error-index').text(`${funcIndex}`); // 错误格式序号添加 error-index class
                                        $funcItem.addClass('error-item');
                                        $funcItem.append($itemIndex);
                                        $funcItem.append($('<div>').addClass('function-name error-function').text('Error Format: ' + func));
                                    }
                                    $historyGroup.append($funcItem);
                                });
                                $tableHistory.prepend($historyGroup);
                            } else {
                                $tableHistory.append($('<p>').text('注释信息中没有匹配到有效的表格编辑函数。'));
                            }
                        } else {
                            $tableHistory.append($('<p>').text('表格编辑标签中没有匹配到注释信息。'));
                        }
                    } else {
                        $tableHistory.append($('<p>').text('本轮对话消息中没有发现表格编辑标签。'));
                    }
                } else {
                    $tableHistory.append($('<p>').text('没有找到可解析的消息内容。'));
                }
            }
        }
        if ($tableHistory.is(':empty')) {
            $tableHistory.append($('<p>').text('没有找到数据表编辑历史。'));
        }
    } else {
        $tableHistory.append($('<p>').text('聊天记录为空，无法查看数据表编辑历史。'));
    }
    setTimeout(() => {
        // 确保在 DOM 更新后执行滚动到底部
        $tableHistory.scrollTop($tableHistory[0].scrollHeight);
    }, 0);

    await tableHistoryPopup.show();
}
