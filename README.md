# SillyTavern 酒馆记忆增强插件 - 开发者文档 (dev 分支)

**欢迎开发者朋友！**  这份文档旨在帮助您了解 SillyTavern 记忆增强插件的内部结构、开发流程以及如何参与插件的开发和贡献。 本文档主要针对 `dev` 分支，其中可能包含最新的开发功能、实验性特性以及尚未完全稳定的代码。

**请注意：** `dev` 分支的代码可能不稳定，仅供开发和测试使用。  如果您是普通用户，请参考主分支的用户文档。

## 分支说明

* **`main` 分支 (用户文档对应分支):**  稳定版本分支，对应用户安装和使用的版本。 文档也主要面向用户。
* **`dev` 分支 (开发者文档对应分支):**  开发分支，包含最新的开发代码，可能包含实验性功能和未完成的特性。  此分支的代码可能不稳定，不建议普通用户使用。  本开发者文档主要针对此分支。

## 代码结构概览

插件的代码主要组织在以下目录和文件中：

* **`index.js`:** 插件的主入口文件。
    * 负责插件的初始化加载。
    * 监听 SillyTavern 的事件 (如 `MESSAGE_RECEIVED`, `CHAT_COMPLETION_PROMPT_READY`, `MESSAGE_EDITED`, `MESSAGE_SWIPED`)。
    * 调用核心模块处理表格数据注入、编辑指令解析和执行等核心逻辑。
    * 负责 UI 交互，例如打开表格查看弹窗、设置弹窗等。
* **`manager.js`:**  核心数据管理和系统控制中心。
    * 定义和管理插件的各种数据模块，例如 `USER`, `BASE`, `EDITOR`, `DERIVED`, `SYSTEM`。
    * 提供对用户设置、上下文数据、插件内部状态的访问和管理接口。
    * 封装系统级别的功能，例如组件加载、文件读写、代码路径记录等。
* **`core/` 目录:**  插件的核心逻辑模块。
    * **`source/` 目录:**  数据源和基础数据结构定义。
        * `table.js`:  `Table` 类定义，负责表格数据的存储、操作和格式化输出。
        * `tableActions.js`:  `TableEditAction` 类定义，负责表格编辑指令的解析和执行。
        * `tableBase.js`:  `Sheet` 类定义，可能用于更底层的表格数据管理 (如果插件使用了数据库或更复杂的数据结构)。
        * `pluginSetting.js`:  插件默认设置和用户设置相关定义。
    * **`derived/` 目录:**  派生功能和 UI 组件。
        * `tablePushToChat.js`:  将表格数据推送到聊天上下文相关的逻辑和 UI 组件。
        * `tableHistory.js`:  表格历史记录查看和管理功能 (如果插件有此功能)。
        * `userExtensionSetting.js`:  用户扩展设置加载和管理。
        * `tableStructureSetting.js`:  表格结构设置弹窗和相关逻辑。
        * `tableDataView.js`:  表格数据查看弹窗和表格渲染组件。
        * `devConsole.js`:  开发者控制台和日志输出功能。
        * `separateTableUpdate.js`:  两步总结更新表格的逻辑 (如果插件有此功能)。
        * `appHeaderTableDrawer.js`:  应用头部表格抽屉 UI 组件和相关逻辑。
        * `initRefreshTypeSelector.js`:  刷新类型选择器初始化 (UI 组件或逻辑)。
    * **`methods/` 目录:**  插件的辅助方法和工具函数。
        * `_fotTest.js`:  测试相关代码 (可能用于单元测试或集成测试)。
        * `dragManager.js`:  拖拽功能管理 (如果插件有拖拽交互)。
        * `popupMenu.js`:  弹出菜单功能管理 (如果插件使用了自定义弹出菜单)。
    * **`utils/` 目录:**  通用工具函数和库。
        * `json5.min.mjs`:  JSON5 解析库。
        * `utility.js`:  通用工具函数，例如字符串哈希、随机数生成、懒加载等。
        * `codePathProcessing.js`:  代码路径处理相关工具函数 (用于日志输出等)。
        * `codeProxy.js`:  代码代理相关工具函数 (可能用于数据代理或权限控制)。
    * **`services/` 目录:**  服务层代码，例如路由管理、数据持久化等。
        * `router.js`:  路由管理 (如果插件有复杂的内部路由)。
* **`assets/` 目录:**  插件的静态资源文件。
    * `templates/` 目录:  HTML 模板文件，用于动态生成 UI 组件。
    * `css/` 目录:  CSS 样式文件。
    * `images/` 目录:  图片资源文件。

## 核心模块说明

* **`USER` 模块 (`manager.js`):**  用户数据管理模块。
    * 提供对用户设置 (`power_user`) 和 SillyTavern 上下文 (`getContext()`) 的访问。
    * 封装了用户设置的读取和保存操作 (`getSettings()`, `saveSettings()`).
    * 提供了便捷的方法获取当前聊天消息 (`getChatPiece()`).
    * 使用 `createProxyWithUserSetting` 创建用户设置的代理对象，方便访问和修改用户配置。
* **`BASE` 模块 (`manager.js`):**  数据库基础数据管理模块 (虽然插件可能不直接使用传统数据库，但这里 `BASE` 模块管理插件的核心数据)。
    * 提供了 `Sheet` 类 (`Sheet: Sheet`)，用于操作表格数据 (可能代表一个表格或一个数据表)。
    * 封装了模板数据和上下文数据的加载和销毁方法 (`loadUserAllTemplates()`, `loadContextAllSheets()`, `destroyAllTemplates()`, `destroyAllContextSheets()`).
    * 提供了获取最近表格数据的方法 (`getLastSheets()`).
* **`EDITOR` 模块 (`manager.js`):**  编辑器控制器。
    * 管理 UI 编辑器相关的状态和功能，例如拖拽 (`Drag`), 弹出菜单 (`PopupMenu`), 弹窗 (`Popup`, `callGenericPopup`, `POPUP_TYPE`).
    * 封装了消息提示功能 (`info()`, `success()`, `warning()`, `error()`, `clear()`).
    * 提供了日志输出功能 (`logAll()`).
* **`DERIVED` 模块 (`manager.js`):**  派生数据管理模块。
    * 使用 `createProxy` 创建派生数据的代理对象 (`any`)，用于存储和访问运行时数据。
    * 暴露 `Table` 类 (`Table: Table`) 和 `TableEditAction` 类 (`TableEditAction: TableEditAction`)。
* **`SYSTEM` 模块 (`manager.js`):**  系统控制器。
    * 封装了系统级别的功能。
    * 组件加载 (`getComponent()`, `htmlToDom()`).
    * 代码路径日志 (`codePathLog()`).
    * 工具函数 (`lazy()`, `generateRandomString()`, `generateRandomNumber()`, `calculateStringHash()`).
    * 文件读写 (`readFile()`, `writeFile()`).
    * 任务队列 (`f()`).

## 开发流程

1. **Fork 仓库（建议）:**  Fork 此仓库到您自己的 GitHub 账号。

2. **请确保该仓库被放在 SillyTavern 插件目录下:**  例如： `...\SillyTavern\public\scripts\extensions\third-party\` 或 `...\SillyTavern\data\<your_user_name>\extensions\`。
```bash
cd ...\SillyTavern\public\scripts\extensions\third-party\
```

3. **Clone:**  Clone `dev` 分支或者您自己的 Fork 仓库到本地。
```bash
git clone -b dev https://github.com/muyoou/st-memory-enhancement
```

4. **进入插件目录:**  进入插件目录。
```bash
cd st-memory-enhancement
```

5. **安装依赖:**  您可能需要在插件目录下运行 `npm install` 安装依赖。
```bash
npm install
```

6. **现在您可以在 `st-memory-enhancement` 目录下进行开发。**


## 再次感谢您的支持！

如果您有任何问题或建议，请随时联系我们。
