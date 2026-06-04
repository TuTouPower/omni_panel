用户发现的 demo 和 前端的差异
用量的条不一样
概览的显示不一样。
厂商只有一个账号的时候的卡片显示样式不一样。
demo没有所有的几个窗口
单个账号的卡片样式不一样
设置窗口还有 electron 默认的上面的条 file edit view Window 等等。

---

## 逐一差异分析

### 1. 用量的条不一样

**Demo 做法：**

- demo 中存在两种风格的用量条：
    - **UsageBoard 原版风格**（`usageboard.jsx` UsageRow + `usageboard.css`）：`.ub-row` 使用 `grid-template-columns: 100px 1fr auto`，标签列 100px。`.ub-bar` 高度 **26px**，圆角 8px，fill 是纵向渐变（`linear-gradient(180deg, #5a6eea, #4c63e6)`）。百分比文字 `.ub-bar-text` 用 `position: absolute; inset: 0` **居中叠在条内部**，字号 13.5px，加粗 700。当 fill 超过 52% 时文字变白（`data-invert="true"`）。右侧时间列 `.ub-row-time` 60px 宽，显示重置时间。
    - **OmniUsage 风格**（`components.jsx` BarRow + `omniusage.css`）：`.bar-row` 使用 `grid-template-columns: 42px 1fr 40px 76px`，标签列仅 42px。`.track` 高度 **6px**，圆角 99px（胶囊形）。百分比 `.bar-pct` 是独立元素，**显示在条的右侧**，字号 12.5px。没有文字叠在条内部的设计。有独立的 `.bar-reset` 列（76px）显示重置时间。

**实现做法：**

- 实现使用 `ub-row` 系列 CSS（已从 demo 的 usageboard 风格搬到 globals.css），结构为 `grid-template-columns: 100px 1fr auto`。`.ub-bar` 高度 26px，fill 是纵向渐变。百分比文字 `.ub-bar-text` 绝对定位居中叠在条内部（与 demo 的 UsageBoard 风格一致）。
- 单账号 tab 模式下的 `ProviderAccountRow` 同样使用 `ub-row` 风格。

**差异描述：**

- 实现已对齐 demo 的 UsageBoard 风格（26px 高条 + 文字居中叠在条内），而非 OmniUsage 设计稿中的 6px 胶囊条。
- demo 的 OmniUsage 风格（`components.jsx` BarRow）在实现中**未使用**。设计稿中同时保留了两种风格（UsageBoard 原版和 OmniUsage 新版），实现选择了 UsageBoard 原版的粗条 + 居中文字方案。
- OmniUsage 设计稿中 `.bar-row` 有 4 列 grid（42px / 1fr / 40px / 76px），标签极短（"5小时"/"一周"），百分比和重置时间分两列；实现的 `ub-row` 是 3 列（100px / 1fr / auto），标签更长（显示完整窗口名如 "5小时用量"），百分比叠在条内，重置时间在右侧。

### 2. 概览的显示不一样

**Demo 做法：**

- demo 的 UsageBoard 原版（`usageboard.jsx`）有两种概览模式：
    - **PopupTabbed**：顶部有厂商 tab 栏，点击某个 tab 切换到该厂商的详情（ProviderCard mode="tab"），展示完整 rows + token grid + chart。单 tab 占满窗口。
    - **PopupList**：没有 tab 栏，所有厂商竖向堆叠（ProviderCard mode="list"），每个厂商是独立卡片（`.is-listcard` 有圆角边框和阴影）。卡片可展开显示 token 统计和图表。
- demo 的 OmniUsage 设计（`components.jsx` UsageCard）：所有厂商以 `.card` 竖向排列，每张卡片包含 grip 拖拽柄、厂商图标、名称、时间、刷新/菜单/折叠按钮，下方是 `.bars`（两行 BarRow）。多账号时有 `.l2seg` 切换平均/明细。

**实现做法：**

- `ProviderOverview` 组件：循环 `visibleProviders`，为每个厂商渲染 `ProviderCard`。卡片结构采用 OmniUsage 风格（grip 柄 + 厂商图标 + 名称 + l2seg + 刷新/菜单/折叠）。禁用的厂商不显示（`filter` 掉 `disabledProviders`）。
- 多账号时用 `CollapsibleCard` 包裹，展开后可切换概览/账号明细。
- 没有 demo 中 UsageBoard 的 tab 模式（PopupTabbed），但有 `ProviderNav` tab 栏（点击切到单厂商 tab 视图，由 `ProviderAccountList` 渲染）。

**差异描述：**

- 实现的概览模式大致对应 demo 的 OmniUsage 风格（列表模式），所有厂商卡片竖向堆叠。
- demo UsageBoard 的 `PopupList` 模式中，listcard 有独立的圆角卡片样式（`.ub-pcard.is-listcard`），卡片内无 grip 柄、无折叠按钮。实现的卡片带 grip 柄和折叠功能，信息更丰富。
- demo 的 tab 模式（PopupTabbed）在实现中由 `ProviderNav` + `ProviderAccountList` 承载，但 demo 是直接切换整个窗口内容，实现是在同一个 popup 窗口内切换 scroll body 的内容。
- 概览模式下禁用的厂商：demo 仍显示卡片（带 disabled 样式），实现直接隐藏。

### 3. 厂商只有一个账号的时候的卡片显示样式不一样

**Demo 做法：**

- UsageBoard 原版（`usageboard.jsx` ProviderCard mode="tab"）：单账号时卡片内直接显示 `.ub-phead`（厂商图标 + 名称 + plan badge + 倒计时 + 刷新按钮），然后是 `.ub-rows`（UsageRow 列表），再是可选的 TokenGrid + AreaChart。没有折叠/展开概念。
- OmniUsage 设计（`components.jsx` UsageCard）：单账号时卡片 head 有 grip 柄 + 厂商图标 + 名称 + 更新时间 + 刷新/菜单/折叠按钮。下方是 `.bars`（两行 BarRow）。不显示 count-badge 和 l2seg。

**实现做法：**

- `ProviderCard` 中，当 `accountCount <= 1` 且有 `onToggleExpand === undefined`（即概览模式之外）时，渲染简单 `.card`（无 CollapsibleCard 包裹），包含 head + 内容。
- 单账号卡片 head 显示：grip 柄 + VendorMark + 名称 + （无 count-badge） + 更新时间 + 刷新/菜单按钮。
- 内容直接渲染 `ProviderAccountRow`（展示该账号的各窗口用量条）。

**差异描述：**

- demo 的 UsageBoard 原版单账号卡片没有 grip 柄、折叠按钮和 context menu，head 只有厂商图标 + 名称 + 倒计时 + 小刷新按钮。实现额外加了 grip 柄、菜单按钮、折叠按钮。
- demo UsageBoard 的单账号卡片在 tab 模式下还显示 token 统计和面积图，实现的概览模式不显示这些（token panel 功能未启用）。
- demo OmniUsage 风格的单账号卡片有 grip 柄和菜单按钮，实现更接近这个风格。

### 4. demo 没有所有的几个窗口

**Demo 做法：**

- demo 定义了以下窗口/视图：
    - **Tray Popup**（`.window`，460px 宽）：主面板，包含 titlebar + tab 栏 + scroll body + statusbar。在 `omniusage.css` 和 `usageboard.jsx` 中实现。
    - **Tray Menu**（`.tray-menu`，234px 宽）：右键托盘菜单，包含用量标签/列表/刷新/重启/退出等项。在 `multi-account.jsx` TrayMenu 中实现。
    - **Settings — 内嵌版**（`settings.jsx` Settings 组件）：在 popup 窗口内渲染，带返回按钮和左侧 nav。宽度受 popup 限制。
    - **Settings — 独立面板**（`settings-panel.jsx` SettingsPanel）：820px 宽的独立设置窗口，带左侧 nav 栏 + 右侧内容区。支持账号管理、数据源、CPA 详情等。
    - **UsageBoard 原版 Settings**（`settings.jsx` + `usageboard.css`）：3 列布局的插件管理器（sidebar + plugin list + detail form），风格完全不同。

**实现做法：**

- **Popup 窗口**（460px）：`PopupView.tsx`，对应 demo 的 tray popup，frame: false（无边框）。
- **Settings 窗口**（820px x 660px）：`SettingsView.tsx`，对应 demo 的 SettingsPanel，frame: true（**有系统标题栏**）。
- **Tray Menu**：通过 Electron 原生 Menu 构建（`src/main/index.ts` 中 `buildTrayMenu`），非 HTML 渲染。
- 没有实现 demo 中 UsageBoard 原版的 3 列插件管理器风格。

**差异描述：**

- demo 的 tray popup 和独立设置面板都实现了。
- demo 的 tray context menu 是 HTML 渲染的（有自定义样式、子菜单、backdrop blur），实现使用 Electron 原生 Menu（系统原生样式）。
- demo 展示了两种设置风格（内嵌版和独立面板），实现只有独立面板。
- demo 有 UsageBoard 原版 3 列设置页面的设计，实现未采用。

### 5. 单个账号的卡片样式不一样

**Demo 做法：**

- 在 tab 模式下（`multi-account.jsx` PopupTab → `AcctHeader` + UsageRow）：切换到某个厂商的 tab 后，如果该厂商有多个账号，通过 Pager（左右箭头 + 圆点指示器）逐个切换。单个账号展示为 `.ub-pane`：头部是 `.ub-ahead`（厂商图标 + 账号名 + plan badge + email + 倒计时 + 小刷新按钮），下方是 `.ub-rows`（UsageRow 列表）。没有折叠功能。
- 在列表模式下（`multi-account.jsx` ListProvider）：第一个账号直接显示，多账号时可展开。账号区域 `.ub-lacct` 包含 `.ub-lacct-id`（账号名 + plan + email + 倒计时）+ `.ub-rows`。

**实现做法：**

- 单个厂商 tab 视图（`ProviderAccountList`）：遍历 `group.accounts`，每个账号渲染为 `ProviderAccountRow`。账号卡片使用 `.card.acct` 样式，head 包含 grip 柄 + VendorMark + 账号名 + 更新时间 + 刷新/菜单/折叠按钮。
- 没有 Pager（左右箭头 + 圆点指示器）的设计，而是所有账号竖向排列，每个账号可独立折叠。

**差异描述：**

- demo 的 tab 模式用 Pager 一次只展示一个账号（滑动翻页），实现是所有账号竖向堆叠（可折叠）。
- demo 单账号卡片 head 有厂商图标 + 账号名 + plan badge + email + 倒计时，实现有 VendorMark + 账号名 + 更新时间 + 操作按钮，没有 plan badge 和 email 显示。
- demo 单账号卡片没有 grip 柄和 context menu，实现都有。
- demo 的账号用 UsageBoard 风格的 ub-row 展示用量，实现也用 ub-row 风格（这一点一致）。

### 6. 设置窗口还有 electron 默认的上面的条 file edit view Window 等等

**Demo 做法：**

- demo 的 Settings 组件（`settings.jsx`）：设计为在 popup 窗口内渲染，有自己的 `.settings-head`（返回按钮 + "设置" 标题），没有系统标题栏概念。整个窗口是 frameless 的。
- demo 的 SettingsPanel（`settings-panel.jsx`）：820px 宽独立面板，`.sp-window` 是自定义窗口容器，有自己的 `.sp-nav` 左侧导航。设计上假设窗口本身没有系统标题栏，所有导航都在自定义 UI 内。

**实现做法：**

- 设置窗口创建时使用 `frame: true`（`src/main/index.ts` 第 111 行：`settings: { route: "settings", width: 820, height: 660, frame: true, show: true }`）。
- 这意味着设置窗口保留了 Electron/操作系统默认的标题栏（Windows 上会显示 "OmniUsage" + 最小化/最大化/关闭按钮，以及可能出现的系统菜单栏如 File/Edit/View）。
- 设置页面的顶部有自己的 `settings-head`（返回按钮 + "设置" 标题），但它在系统标题栏下方。

**差异描述：**

- demo 设计的设置窗口没有系统标题栏（frameless），所有 UI 元素都是自定义的。实现使用了 `frame: true`，导致系统标题栏出现在自定义 UI 上方。
- 系统标题栏占据额外空间，且视觉风格与 demo 的无边框设计不一致。
- 要消除这个差异，需要将设置窗口改为 `frame: false` 或 `titleBarStyle: "hidden"`，然后自行实现窗口控制按钮（最小化/最大化/关闭），或者实现拖拽区域。
