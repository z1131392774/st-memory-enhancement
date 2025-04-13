// mcpServer.js

const mcpServerEndpoint = 'http://localhost:7999/mcp'; // MCP 服务器端点

let sheetInstance = null; // 保存表格实例的引用

async function sendMCPRequest(action, parameters = {}, context = {}) {
    const requestData = {
        action: action,
        parameters: parameters,
        context: context, // 可以包含表格的描述信息，例如表格名称，当前状态等
        tableData: getTableDataForLLM(sheetInstance), // 获取表格数据，方便 LLM 理解
    };

    try {
        const response = await fetch(mcpServerEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();
        return responseData; // 假设服务器返回 JSON 格式的响应，包含操作指令
    } catch (error) {
        console.error('MCP Request failed:', error);
        return null; // 或抛出错误，根据你的错误处理策略
    }
}

function getTableDataForLLM(sheet) {
    // 将 Sheet 实例的数据转换为 LLM 可以理解的格式
    // 例如，转换为 CSV 字符串或 JSON 对象
    let csvData = "rowIndex,";
    csvData += sheet.getCellsByRowIndex(0).map((cell, index) => index + ':' + cell.data.value).join(',') + '\n'; // 标题行
    csvData += sheet.getSheetCSV(); // 数据行
    return csvData; // 返回 CSV 格式的表格数据
}

function executeMCPResponse(response) {
    if (!response || !response.instruction) {
        console.warn('Invalid MCP response or no instruction found.');
        return;
    }

    const instruction = response.instruction;
    const action = instruction.action;
    const params = instruction.params;

    console.log('Executing MCP instruction:', instruction);

    switch (action) {
        // case 'editCell':
        //     // 示例：假设 params 包含 cellUid 和 newValue
        //     const cellToEdit = sheetInstance.cells.get(params.cellUid);
        //     if (cellToEdit) {
        //         cellToEdit.data.value = params.newValue;
        //         sheetInstance.renderSheet(); // 重新渲染表格
        //     } else {
        //         console.warn(`Cell with UID ${params.cellUid} not found.`);
        //     }
        //     break;
        // case 'insertRow':
        //     // 示例：假设 params 包含 rowIndex
        //     sheetInstance.updateSheetStructure(sheetInstance.colCount.get(), sheetInstance.rowCount.get() + 1); // 增加行数
        //     sheetInstance.renderSheet();
        //     break;
        // case 'deleteRow':
        //     // 示例：假设 params 包含 rowIndex
        //     if (params.rowIndex > 0 && sheetInstance.rowCount.get() > 1) { // 避免删除标题行和空表格
        //         const rowIndexToDelete = parseInt(params.rowIndex);
        //         sheetInstance.hashSheet.splice(rowIndexToDelete, 1); // 删除行
        //         sheetInstance.renderSheet();
        //     }
        //     break;
        // case 'insertColumn':
        //     // ... 实现插入列的逻辑，类似 insertRow
        //     break;
        // case 'deleteColumn':
        //     // ... 实现删除列的逻辑，类似 deleteRow
        //     break;
        // case 'clearSheet':
        //     sheetInstance.init(); // 清空表格
        //     sheetInstance.renderSheet();
        //     break;
        // case 'getResponse': // LLM 只是返回信息，不修改表格
        //     alert(params.message); // 例如，显示 LLM 的总结或分析结果
        //     break;
        default:
            console.warn(`Unknown MCP action: ${action}`);
    }
    sheetInstance.save(); // 操作后保存表格
}

// 示例用法：请求 LLM 总结第一列
async function requestColumnSummary(columnIndex) {
    const contextInfo = {
        tableName: sheetInstance.name,
        tableType: sheetInstance.type,
        // ... 其他上下文信息
    };
    const parameters = {
        columnIndex: columnIndex,
    };
    const response = await sendMCPRequest('summarizeColumn', parameters, contextInfo);
    if (response) {
        executeMCPResponse(response); // 处理 MCP 服务器的响应
    }
}

// 示例用法：用户点击按钮后，请求 LLM 编辑单元格 (假设 cellUid 和 newValue 已知)
async function requestEditCell(cellUid, newValue) {
    const parameters = {
        cellUid: cellUid,
        newValue: newValue,
    };
    const response = await sendMCPRequest('editCell', parameters);
    if (response) {
        executeMCPResponse(response);
    }
}
