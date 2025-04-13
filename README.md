# SillyTavern 酒馆记忆增强插件 - 开发者文档 (dev 分支)

**欢迎来到 SillyTavern 记忆增强插件的开发者页面！**  这份文档专为希望深入了解插件内部结构、参与开发和贡献代码的开发者朋友们准备。  **请注意，您正在阅读的是 `dev` 分支的文档。**

> \[!IMPORTANT]
> **重要提示： `dev` 分支包含最新的开发进展和大量实验性功能，代码可能不稳定。** 
> 
> 本分支仅供开发与测试，并不适合普通用户体验前沿功能。
> 如果您是玩家，请来 [主分支 (master)](https://github.com/muyoou/st-memory-enhancement) 安装相对稳定的版本。

## 分支说明

*   **`main` 分支 (稳定版本):**  此分支的代码库对应用户实际安装和使用的稳定版本。文档也主要面向普通用户，提供安装、配置和使用指南。
*   **`release` 分支 (发布版本):**  此分支是插件的发布版本，包含最新的稳定发布代码。
*   **`dev` 分支 (开发中分支):**  此分支是该插件的主要开发分支，包含最新的功能开发、实验性特性以及可能正在进行中的代码重构。**本开发者文档即针对此分支。**

## 开发准备与流程

1.  **Fork 仓库 (强烈建议):**  为了方便您进行代码修改和提交 Pull Request，请先将 [主仓库](https://github.com/muyoou/st-memory-enhancement) Fork 到您自己的 GitHub 账号下。

2.  **选择插件目录:**  请确保在本地的 SillyTavern 环境中，插件仓库被放置在正确的插件目录下。 通常是以下路径之一：
    *   全局插件目录:  `...\SillyTavern\public\scripts\extensions\third-party\`
    *   用户插件目录:  `...\SillyTavern\data\<your_user_name>\extensions\`

3.  **Clone `dev` 分支:**  将 `dev` 分支 (或您 Fork 的仓库) 克隆到本地插件目录。
    ```bash
    # 以克隆 dev 分支为例：
    git clone -b dev https://github.com/muyoou/st-memory-enhancement
    ```
    如果您 Fork 了仓库，请将上述命令中的 URL 替换为您 Fork 的仓库地址。

4.  **安装依赖:**  进入插件根目录 `st-memory-enhancement`，使用 npm 安装开发和运行所需的依赖包。
    ```bash
    cd st-memory-enhancement
    npm install
    ```

5.  **配置:**  为了方便开发调试，建议您开启插件中的调试模式。然后您就可以在 `st-memory-enhancement` 目录下自由的进行代码修改和功能开发了。

## 代码结构概览

插件代码按照模块化原则组织，主要目录和文件结构如下：

*   **`index.js` (插件主入口):**
*   **`manager.js` (核心管理器):**
*   **`core/` (核心逻辑模块):**  插件的核心功能实现代码，进一步细分为以下子目录：
    *   `table.js（即将弃用）`:  `Table` 类定义。 负责表格数据的结构化存储、各种操作 (增删改查、格式化)、以及数据输出。
    *   `tableActions.js（即将弃用）`
    *   `tableBase.js`
    *   `pluginSetting.js`:  插件默认设置和用户设置相关的定义和管理。

    *   **`editor/` (编辑器模块):**  编辑器 UI 交互和表格的各种编辑相关的状态管理模块。
    *   **`renderer/` (渲染器模块):**  渲染器模块，用于将数据渲染为 UI 组件。
    *   **`runtime/` (运行时模块):**  运行时数据管理模块，用于存储和管理插件运行时的各种动态数据。

*   **`utils/` (通用工具库):**  通用的、与插件业务逻辑无关的工具函数和第三方库。
*   **`services/` (服务层):**  更高层次的服务抽象，例如路由管理、数据持久化等。
*   **`assets/` (静态资源):**  插件使用的静态资源文件。
    *   `templates/` (HTML 模板):  HTML 模板文件，用于动态生成 UI 组件，实现前后端分离。
    *   `css/` (样式表):  CSS 样式文件，定义插件的 UI 样式。
    *   `images/` (图片资源):  图片资源文件，例如插件图标、UI 组件用到的图片等。

## 核心模块说明 (重要)

> \[!NOTE]
> **请注意：**  由于 `dev` 分支正处于活跃开发阶段，代码变动较为频繁。  以下模块说明可能与最新的代码存在差异。  **最准确的变量和函数信息，请务必查阅源代码注释和 IDE 的代码提示。**

*   **`USER` 模块 (`manager.js`):**  用户数据管理模块。
    *   **用户设置访问:**  提供对用户个性化设置 (`power_user` 等) 的访问接口。
    *   **SillyTavern 上下文:**  封装了对 SillyTavern 上下文 (`getContext()`) 等数据的访问，方便获取当前聊天环境信息。
    *   **设置持久化:**  封装了用户设置的读取 (`getSettings()`) 和保存 (`saveSettings()`) 操作，实现用户设置的持久化存储。
    *   **聊天消息快捷访问:**  提供便捷的方法 (`getChatPiece()`) 获取当前聊天消息片段。
    *   **用户设置代理:**  使用 `createProxyWithUserSetting` 创建用户设置的代理对象，实现更方便、更安全的配置访问和修改。

*   **`BASE` 模块 (`manager.js`):**  基础数据管理模块 (核心数据中心)。
    *   **`Sheet` 类:**  核心数据结构 `Sheet` 类 (`Sheet: Sheet`)，用于操作表格数据。  可以将其理解为插件的“数据表”，负责数据的组织和管理。
    *   **模板与上下文数据管理:**  封装了模板数据和上下文数据的加载 (`loadUserAllTemplates()`, `loadContextAllSheets()`) 和销毁 (`destroyAllTemplates()`, `destroyAllContextSheets()`) 方法，管理插件的数据生命周期。
    *   **最近表格数据访问:**  提供 `getLastSheetsPiece()` 方法，用于获取最近使用的表格数据，可能用于缓存或快速访问。

*   **`EDITOR` 模块 (`manager.js`):**  编辑器控制器 (UI 交互和状态管理)。
    *   **UI 状态管理:**  集中管理 UI 编辑器相关的状态和功能模块，例如：
        *   `Drag`:  拖拽功能 (`Drag`)
        *   `PopupMenu`:  弹出菜单 (`PopupMenu`)
        *   `Popup`:  弹窗 (`Popup`, `callGenericPopup`, `POPUP_TYPE`)
    *   **消息提示:**  封装了各种类型的消息提示功能 (`info()`, `success()`, `warning()`, `error()`, `clear()`)，方便在 UI 上展示操作反馈或错误信息。
    *   **日志输出:**  提供统一的日志输出接口 (`logAll()`)，方便开发者进行调试和问题排查。

*   **`DERIVED` 模块 (`manager.js`):**  派生数据管理模块 (运行时数据)。
    *   **运行时数据代理:**  使用 `createProxy` 创建派生数据的代理对象 (`any`)，用于存储和访问插件运行时的各种动态数据，例如中间计算结果、UI 状态等。
    *   **核心类暴露:**  对外暴露 `Table` 类 (`Table: Table`) 和 `TableEditAction` 类 (`TableEditAction: TableEditAction`)，方便其他模块使用。

*   **`SYSTEM` 模块 (`manager.js`):**  系统级功能模块 (底层工具集)。
    *   **组件加载:**  提供 `getTemplate()` 和 `htmlToDom()` 方法，用于动态加载 HTML 模板和将其转换为 DOM 元素。
    *   **代码路径日志:**  `codePathLog()` 方法，用于记录代码执行路径，方便调试和跟踪代码流程。
    *   **通用工具函数:**  包含各种通用的工具函数，例如：`lazy()` (懒加载)、`generateRandomString()` (随机字符串生成)、`generateRandomNumber()` (随机数生成)、`calculateStringHash()` (字符串哈希计算) 等。
    *   **文件读写:**  封装了文件读取 (`readFile()`) 和写入 (`writeFile()`) 操作，方便插件进行本地数据存储或配置管理。
    *   **任务队列:**  `f()` 方法可能用于实现任务队列，用于异步执行任务或控制任务执行顺序。

## 👥 贡献者名单

感谢所有为该项目做出贡献的伙伴们！

<a href="https://github.com/muyoou/st-memory-enhancement/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=muyoou/st-memory-enhancement" />
</a>

**##Master 分支代码统计**

![Alt](https://repobeats.axiom.co/api/embed/ece4e039de7cf89ed5ccc9fba2e9b432e44dfaaa.svg "Repobeats analytics image")

**##Dev 分支代码统计**

![Alt](https://repobeats.axiom.co/api/embed/eb3c2af1bcdb84704bb9ff8f61379fe38d634884.svg "Repobeats analytics image")

## 再次感谢您的参与和支持！

如果您在开发过程中遇到任何问题，或者有任何建议和想法，欢迎随时通过 GitHub Issues 或其他渠道与我们联系。
