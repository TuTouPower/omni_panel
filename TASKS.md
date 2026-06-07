# OmniUsage 任务清单

> 已完成的 Phase 1–28、30、32–33、35 移入 `docs/archive/tasks_history.md`。

---

## 待修：主面板 Provider 菜单编辑 / 关闭 / 删除反馈无效

### 背景

用户在打包产物主面板点击 provider 卡片右上角菜单里的「编辑 / 关闭 / 删除」后，界面看起来无效。之前已有相关提交：

- `68c537e feat: 主面板账号级操作（隐藏/删除/编辑菜单）`
- `24b9dbd fix: complete account disable actions`

但这两个提交主要覆盖**账号级菜单**和部分账号操作，当前问题还存在于**主面板 provider 级菜单**与配置变更后的前端刷新链路。

### 已观察事实

本机日志 `C:\Users\TestUser\AppData\Roaming\OmniUsage\logs\app-2026-06-07.log` 显示，点击后不是完全没有触发：

```text
[2026-06-07T02:31:10.305Z] [DEBUG] [ipc:config] config:get called
[2026-06-07T02:31:10.308Z] [DEBUG] [ipc:config] config:save called
[2026-06-07T02:31:10.310Z] [DEBUG] [config-store] Config saved ... (7 plugins)
[2026-06-07T02:31:10.310Z] [INFO] [main] Config saved — rebuilding scheduler and secret keys
[2026-06-07T02:31:10.311Z] [INFO] [orchestrator] startAll: 4 plugins
[2026-06-07T02:31:10.311Z] [INFO] [ipc:config] Config saved: 7 plugins
```

这说明「关闭 / 删除」至少已经进入保存配置路径，并触发 scheduler rebuild。用户感知的"无效"更可能是**当前 popup 前端没有同步刷新插件列表 / 配置状态**，而不是点击事件完全没执行。

### 当前代码线索

- `src/renderer/components/ProviderCard.tsx` provider 级菜单：
    - 「编辑」只调用 `window.usageboard.settings.open()`，没有传 `instanceId/provider/accountId`，所以只能打开设置，不能定位到具体账号。
    - 「关闭」调用 `onToggleDisable(provider)`。
    - 「删除」调用 `onDelete(provider)`。
- `src/renderer/views/PopupView.tsx`：
    - `toggle_disable_provider()` / `delete_provider()` 保存配置后，没有主动重拉 `plugin.list()`。
    - `use_plugins()` 只在 mount 时加载插件列表；之后只监听 `onStateChange` 更新 snapshot，不监听 config/plugin list 变化。
    - 结果：配置已保存、scheduler 已 rebuild，但当前主面板仍拿旧 `plugins` state 渲染，看起来像没反应。
- `src/main/index.ts` settings open：
    - `SETTINGS_OPEN` 里如果带 context，会立即 `settingsWin.webContents.send(SETTINGS_NAVIGATE, context)`。
    - 新建 settings 窗口时 renderer 可能尚未注册 `onSettingsNavigate`，事件有丢失风险。
- `src/renderer/views/SettingsView.tsx`：
    - `onSettingsNavigate` 收到 context 后只按 `instanceId` 打开编辑弹窗。
    - provider 级编辑目前没传 context，因此不会定位。

### 待修范围

- [ ] 主面板 provider 级「关闭」保存后，当前 popup 立即反映禁用状态 / provider 消失或灰化（按目标行为确定）。
- [ ] 主面板 provider 级「删除」保存后，当前 popup 立即移除对应 provider / 账号。
- [ ] 主面板 provider 级「编辑」应传入足够 context：
    - 单账号 provider：定位到该账号编辑弹窗。
    - 多账号 provider：定位到设置账号页对应 provider 分组，或明确进入账号列表让用户选择。
    - CPA provider：定位到 CPA 数据源详情 / provider scope，而不是无上下文打开设置。
- [ ] 新建 settings 窗口时，`SETTINGS_NAVIGATE` 不应在 renderer 未 ready 时丢失。
- [ ] 配置保存后需要有统一通知链路：main 广播 config/plugin-list changed，popup 收到后重拉或更新本地状态。

### 建议修复方向

1. 在 config save 成功后广播配置变更事件，例如 `config:changed`。
2. preload 暴露 `event.onConfigChange`。
3. `use_plugins()` 或 `PopupView` 监听 config change 后重拉 `window.usageboard.plugin.list()`，同步 `enabled/activeProviders/plugins`。
4. `SETTINGS_OPEN` 带 context 时，等 settings window `did-finish-load` 后再发送 navigate；已有窗口则直接发送。
5. provider 级编辑补上下文策略，并加测试覆盖单账号、多账号、CPA 三类。

### 回归测试要求

- [ ] 单元测试：provider 级关闭调用 config.save 后，popup 重拉 plugin list 或 UI 状态更新。
- [ ] 单元测试：provider 级删除调用 config.save 后，popup 不再渲染目标 provider。
- [ ] 单元测试：provider 级编辑传入正确 settings context。
- [ ] 单元测试：settings navigate 在新窗口 ready 后仍能定位。
- [ ] E2E：打包产物主面板中点击编辑 / 关闭 / 删除，真实 UI 有可见结果。
- [ ] 完成前按 `docs/test.md` 跑 `pnpm typecheck`、`pnpm lint`、`pnpm test`；涉及 UI 需手工点击；涉及打包需 packaged smoke。

---

## 待修：主面板拖动按钮无法拖动

### 背景

用户在打包产物主面板点击 / 拖动卡片左侧拖动按钮，无法完成排序。

### 当前代码线索

- `src/renderer/components/ProviderCard.tsx`：拖动按钮 `.card-grip` 只在 `onMouseDown` 时调用 `onDragStart(provider)`。
- 同文件真正的 HTML5 拖拽属性 `draggable: true` 和 `onDragStart` 挂在外层 `.card` 上。
- `src/renderer/components/ProviderAccountRow.tsx` 账号拖动也有同类结构：按钮 `onMouseDown`，外层 card 才是 draggable。
- 这会导致拖动按钮本身看起来可拖，但浏览器实际 dragstart 不一定从父级 draggable card 开始，结果只设置了内部 dragging 状态，没有可靠触发重排。

### 待修范围

- [ ] provider 卡片拖动按钮拖拽必须真实触发排序。
- [ ] 账号卡片拖动按钮拖拽必须真实触发排序。
- [ ] 拖动行为不应误触发卡片折叠 / 菜单 / 刷新。
- [ ] 拖动排序后配置持久化，重启仍保持顺序。
- [ ] 打包产物中手工验证拖动按钮可用。

### 建议修复方向

1. 把 `draggable` / `onDragStart` 挂到 `.card-grip` 按钮本身，或改成 pointer events 手写拖拽，不要只靠父级 card。
2. provider 和 account 两套拖动实现保持一致。
3. 加单元测试覆盖 drag start / drag enter / drag end 后顺序保存。
4. 加 E2E 覆盖真实用户拖动按钮重排。

---

## 待修：失败 / 无数据 provider 缺少统一折叠按钮

### 背景

用户指出 MiniMax 这种刷新失败或暂时拿不到数据的 provider，右侧也应该显示折叠按钮，样式要和正常 provider 保持统一。

### 当前问题

- 当前失败 / 无数据状态主要走 `ProviderCard.render_state()`，只显示错误或空状态。
- 失败但仍属于主面板 provider 卡片时，右侧交互按钮和正常有数据卡片不完全一致。
- 视觉结果是 MiniMax 这类失败卡片缺少统一的折叠 / 展开入口，和 Claude / Codex / Gemini / GLM 等正常卡片不一致。

### 待修范围

- [ ] 失败 provider 也显示统一的右侧折叠 / 展开按钮。
- [ ] 无数据 provider 也显示统一的右侧折叠 / 展开按钮（如果卡片结构允许展开）。
- [ ] 折叠后错误 / 空状态内容隐藏或按统一规则收起。
- [ ] 展开后错误信息、重试入口、更新时间 / 状态显示不丢失。
- [ ] MiniMax 失败场景加入 UI 回归测试。
- [ ] 打包产物中手工验证 MiniMax 失败卡片样式与正常卡片一致。

### 建议修复方向

1. 统一 `ProviderCard` header/tools 渲染，不按是否有 usage 数据拆出完全不同的按钮结构。
2. 让失败 / 空状态也走同一套 collapsible shell。
3. 对 MiniMax `MISSING_PARAM` 或刷新失败 fixture 加单元测试 / E2E 断言。

---

## 待重构：主面板卡片交互重复代码抽取

### 背景

用户要求检查主面板相关代码是否重复。当前 Provider 卡片、账号卡片、拖动、用量条列表存在重复实现；其中拖动重复还和"拖动按钮无法拖动"问题相关。

### 重复点 1：菜单行为重复

位置：

- `src/renderer/components/ProviderCard.tsx`
    - `menu_open` / `menu_ref` / 外部点击关闭 / Escape 关闭
    - provider 级 `.card-menu` / `.cm-item`
- `src/renderer/components/ProviderAccountRow.tsx`
    - 同样的 `menu_open` / `menu_ref` / 外部点击关闭 / Escape 关闭
    - account 级 `.card-menu` / `.cm-item`

问题：

- 两套菜单行为几乎一样，只是菜单项不同。
- 后续修键盘访问、focus、外部点击、overlay、样式时容易只改一边。
- provider 菜单与 account 菜单已经出现行为差异，增加 bug 面。

建议：

- [ ] 抽 `CardActionMenu`。
- [ ] 菜单项用数据描述：`label/icon/danger/onSelect`。
- [ ] provider/account 两处只传菜单项，不再各自维护 open/ref/effect。
- [ ] 补单元测试覆盖：打开、点击项、外部点击关闭、Escape 关闭。

### 重复点 2：拖动按钮与拖拽事件重复，且可能导致拖动 bug

位置：

- `src/renderer/components/ProviderCard.tsx`
    - `.card-grip` 按钮
    - `drag_events` 对象
- `src/renderer/components/ProviderAccountRow.tsx`
    - `.card-grip` 按钮
    - `drag_events` 对象
- `src/renderer/views/PopupView.tsx`
    - provider reorder handlers
    - account reorder handlers

问题：

- `.card-grip` 只在 `onMouseDown` 设置拖动状态。
- 真正的 `draggable/onDragStart/onDragEnter/onDragEnd` 挂在外层 card。
- `CollapsibleCard` 当前不转发任意 root props；`ProviderAccountRow` 传入 `{...drag_events}` 但可能被忽略，`ProviderCard` collapsible 分支也没有稳定传入 drag props。
- 结果是按钮看起来可拖，但实际 HTML5 drag 事件不可靠。

建议：

- [ ] 抽 `DragGrip`。
- [ ] 让 `CollapsibleCard` 支持 `rootProps` 或继承 `React.HTMLAttributes<HTMLDivElement>` 并转发到根 `.card`。
- [ ] provider/account 两套拖动统一使用同一套 root props / grip 行为。
- [ ] 若继续使用 HTML5 DnD，确保拖动从 grip 开始也能触发有效 dragstart。
- [ ] 补 provider 和 account 拖动排序单元测试 / E2E。

### 重复点 3：卡片 shell 分支重复

位置：

- `src/renderer/components/ProviderCard.tsx`
    - 普通 `.card` 分支
    - `CollapsibleCard` 分支
- `src/renderer/components/ProviderAccountRow.tsx`
    - 普通 `.card` 分支
    - `CollapsibleCard` 分支

问题：

- 两个组件都在重复决定"普通 card vs collapsible card"。
- className、header、tools、children、drag props 分散，导致 collapsible 与非 collapsible 行为不一致。

建议：

- [ ] 优先让 `CollapsibleCard` 成为统一 card shell：没有 `collapsed/onToggle` 时也可当普通 card 使用；或抽底层 `CardShell`。
- [ ] 所有 root props、drag props、className 只走一个入口。
- [ ] 修复时避免一次性大改视觉结构，先保行为一致。

### 重复点 4：用量条列表 mapping 重复

位置：

- `src/renderer/components/ProviderCard.tsx`
    - overview periods → `UsageBarRow`
    - single-account periods → `UsageBarRow`
- `src/renderer/components/ProviderAccountRow.tsx`
    - account periods → `UsageBarRow`
- `src/renderer/components/UsageRows.tsx`
    - `AccountUsageRow` 内部也 map periods → `UsageBarRow`

问题：

- 重复传 `period/index/colorScheme/barStyle/labelMap`。
- 之前单账号粗胶囊型缺少 `.bars` 容器，就是这种重复导致的漏改。

建议：

- [ ] 抽 `UsageBarList`，统一负责 `.bars` / `.ai-bars` 容器和 `UsageBarRow` mapping。
- [ ] ProviderCard、ProviderAccountRow、AccountUsageRow 复用它。
- [ ] 补测试：概览、单账号、多账号、粗胶囊型都使用一致容器和间距。

### 不建议优先大抽：失败 / 空状态

观察：

- `ProviderCard.render_state()` 内失败 / auth / 无数据状态相对集中。
- `PopupView` 也有 active tab 空状态，但语义不同。

建议：

- [ ] 不做大状态机抽象。
- [ ] 如需统一样式，只抽很小的展示组件 `CardState`：`variant/icon/message/actionLabel/onAction`。
- [ ] 优先级低于菜单、拖动、用量条列表。

### 优先级

1. `CardActionMenu`：减少 provider/account 菜单分叉。
2. `DragGrip` + `CollapsibleCard rootProps`：同时解决重复和拖动按钮 bug。
3. `UsageBarList`：防止用量条容器/间距再次漏改。
4. 可选 `CardState`：只做轻量展示统一。

---

## Phase 36: Demo Handoff chat30-39 对齐

### 背景

`docs/design/omni_usage-handoff.tar.gz` 解压后包含 chat30-39 共 10 轮设计迭代。与当前实现对比，以下设计要素需要补齐或修正。详细变更记录见 `docs/archive/changelog_design.md`。

### 核心原则

1. 以 demo 代码（`docs/design/omni-usage/project/`）为准。
2. 不修改 `docs/design/omni-usage/**`。
3. 每项完成前跑 `pnpm test`。
4. 涉及 UI 的项必须手工点击验收。
5. 涉及打包的项必须 packaged smoke。

### 36.1 用量条五列行结构（P0）

**Demo 规则**：统一 5 列 `4ic minmax(0,1fr) 5ch 5ch 5ch`，gap 6px。label/value/date/clock 固定宽度，progress 是唯一弹性列。

- [x] 用量条行结构改为 5 列：`label(4ic) | progress(1fr) | value(5ch) | date(5ch) | clock(5ch)`
- [x] 时间列拆分为 date + clock 独立对齐（如 `今天 13:10` → date:`今天` clock:`13:10`）
- [x] 数字日期格式化为 `MM.DD`（如 `5/18 → 05.18`）
- [x] label 列固定 4ic，全局不按厂商变化，超长走 CSS ellipsis + hover tooltip
- [x] value/date/clock 右对齐，tabular-nums
- [x] column-gap: 6px
- [x] 窗口变宽时只拉伸 progress 列

### 36.2 用量条颜色方案（P0）

**Demo 规则**：三套颜色方案，通过 `BarSchemeContext` 传递。九色循环从 8 色改为 9 色。

- [x] 新增 `risk-current`（默认）：≥95 红、>85 橙、>60 黄、其他绿
- [x] 新增 `risk-projected`：按 elapsed 预测，无 elapsed 回退 risk-current
- [x] 九色循环从 8 色升级为 9 色（新增 `#A7D8D8` 淡青灰）
- [x] 亮暗主题各一套 `--risk-green/yellow/orange/red` CSS 变量
- [x] 轨道底色 `--bar-track` 亮色 `#E9EDF5` / 暗色 `#2B313C`
- [x] 设置 > 外观 > 用量条颜色方案：三选一，默认 risk-current

### 36.3 粗胶囊型用量条（P1）

**Demo 规则**：与颜色方案独立的新设置，4 列 `4ic 1fr 5ch 5ch`，数值在胶囊内。

- [x] 新增 `BarStyleContext`：`thin`（默认）/ `capsule`
- [x] 胶囊型 4 列：`label | capsule+value | date | clock`（无独立 value 列）
- [x] 胶囊 22px 高，999px 圆角，行距 7px
- [x] 数值固定在轨道中心，不跟随填充移动
- [x] 轨道 = 填充色 16% 透明度（`color-mix`）
- [x] 文字对比：深色底层 + 白色 clip-path 二层方案
- [x] `isolation: isolate` 防止 z-index 泄漏
- [x] 三套颜色方案兼容胶囊型
- [x] 设置 > 外观 > 用量条样式：细线型 / 粗胶囊型

### 36.4 面板宽度与 resize（P1）

- [x] 面板默认宽 482px，最小 472px，最大 780px
- [x] 右边缘可拖拽调整宽度（demo `.win-resize`）
- [x] 高度由 ResizeObserver 驱动，clamp `[160px, 75% vh]`
- [x] 变宽时只拉伸 progress/capsule 列

### 36.5 长标签映射（P2）

- [x] 内置 `LABEL_MAP` 映射缩短长模型名（如 `gemini-3.1-flash-lite-preview → 3.1 Flash-Lite·Pv`）
- [x] 用户可自定义映射覆盖内置映射
- [x] 超长标签 CSS ellipsis + title tooltip

### 36.6 设置页更新（P1）

- [x] 常规页新增「窗口」分组：主面板打开方式、窗口置顶、浮动高度
- [x] 移除「点击托盘图标」设置（左键永远开主面板）
- [x] 账号页去掉密钥列显示
- [x] CPA 已发现账号不显示密钥

### 36.7 骨架屏优化（P2）

- [x] 无刷新时间的余额行（如 DeepSeek），时间列置空而非显示 `--`

### 36.8 死代码清理（P2）

- [x] 移除 disabled-card 相关死代码（"已关闭" badge、`.card.disabled` 等），确认 demo 不渲染 disabled 卡片
- [x] 移除 `status` / `footerUpdated` 死状态

### 36.9 测试

- [x] 五列行结构测试：列宽、对齐、gap、弹性列
- [x] 时间拆分测试：`splitTime()` 各格式
- [x] 颜色方案测试：三套方案、九色循环、风险色阈值
- [x] 胶囊型测试：结构、文字对比、z-isolation
- [x] 长标签映射测试：内置映射、用户覆盖、ellipisis
- [x] `pnpm test` 全部通过

### 验收标准

1. 用量条 5 列行结构全局对齐，gap 6px。
2. 三套颜色方案可选，默认 risk-current。
3. 胶囊型可选，默认细线型。
4. 时间列 date + clock 独立对齐。
5. 面板宽度 472-780px 可调。
6. 设置页窗口分组、无密钥列。
7. `pnpm test` 通过。

---

## Phase 29: 文档纠偏与交互边界

### 背景

用户指出两类误导性实现来源：

1. 托盘右键菜单不应固定窗口高度制造滚动条。
2. 产品不存在"周期数量"设定；demo 中 `5小时` / `一周` 只是示例数据，不是要求 UI 增加"几个周期"的前端元素。

### 29.1 托盘右键菜单尺寸规则

- [ ] 托盘右键菜单是菜单窗口，不是主面板 Popup / Floating Window。
- [ ] 菜单窗口宽度由菜单内容决定。
- [ ] 菜单窗口高度由菜单内容决定。
- [ ] 菜单项变多或变少时，窗口尺寸跟随内容变化。
- [ ] 不额外设置固定高度来承载正常菜单内容。
- [ ] 不因为固定高度不足而显示滚动条。
- [ ] 不复用主面板的固定高度、75% 高度上限、内部滚动策略。
- [ ] 只有屏幕可用区域放不下完整菜单时，才允许做边界修正。

### 29.2 用量周期数量规则

- [ ] 不存在"两个周期""三个周期""八个周期"这种产品设定。
- [ ] 不新增任何专门显示"有几个周期"的前端元素。
- [ ] `docs/design/omni-usage/**` 或 demo 差异文档里的 `5小时` / `一周` 只能当示例数据理解。
- [ ] 用量条数量完全来自插件返回的真实 `UsageItem` / periods 数据。
- [ ] UI 只渲染真实返回的用量项，不按 demo 示例补齐、裁剪或伪造周期。
- [ ] 多账号概览可以按周期标签聚合真实数据，但不能把聚合结果解释为固定周期数量。
- [ ] 文案、测试名、文档不得再写"固定两个周期"这类误导表述。

### 29.3 文档同步

- [x] 修正 `docs/archive/demo_vs_implementation_diff.md`，明确 demo 的 `5小时` / `一周` 只是示例，不是周期数量设定。
- [x] 更新 `docs/window_design.md`，记录托盘右键菜单按内容决定尺寸。
- [x] 更新 `docs/spec.md`，记录 TrayMenu 不使用主面板高度策略。
- [x] 更新 `docs/archive/superpowers/specs/2026_06_01_demo_ui_alignment_design.md`，记录自绘托盘菜单窗口边界。

### 验收标准

1. 右键托盘菜单正常内容下没有滚动条。
2. 右键托盘菜单宽高跟随内容变化。
3. 主面板和账号明细不显示"几个周期"这类专门前端元素。
4. 用量条数量只由真实插件返回数据决定。
5. 文档中不再把 demo 示例误写成固定周期数量规则。

---

## Phase 31: 账号操作按钮失效 + 测试 mock 路由不一致

> 发现时间：2026-06-06 | 优先级：P0 | 状态：已修复

### BUG：主面板账号菜单按钮点击无效

主面板（popup 窗口）账号卡片"更多"菜单里的三个按钮：

| 按钮         | 调用的 API        | popup 窗口有？ | 现象     |
| ------------ | ----------------- | -------------- | -------- |
| 编辑         | `settings.open()` | 有 ✓           | 正常     |
| 隐藏（CPA）  | `config.save()`   | **没有** ✗     | 静默失效 |
| 删除（直接） | `config.save()`   | **没有** ✗     | 静默失效 |

**根因：** `src/preload/index.ts:222-234` — popup 窗口走 `default` 分支，`config: config_readonly` 只有 `get`，没有 `save` / `saveSecrets` / `duplicate`。

```ts
// src/preload/index.ts:56-59
const config_readonly = {
    get: () => invoke<...>(IPC_CHANNELS.CONFIG_GET),
};

// src/preload/index.ts:62-73
const config_full = {
    ...config_readonly,
    save: (config: unknown) => invoke<...>(IPC_CHANNELS.CONFIG_SAVE, config),
    saveSecrets: (payload: unknown) => invoke<...>(IPC_CHANNELS.CONFIG_SAVE_SECRETS, payload),
    duplicate: ...,
};

// src/preload/index.ts:222-234 — popup 只能用 readonly
default: // popup
    return {
        config: config_readonly, // ← 没有 save
        ...
    };
```

### 为什么全部测试没发现

| 测试文件                         | 真实路由         | mock 的 config  | 问题                                             |
| -------------------------------- | ---------------- | --------------- | ------------------------------------------------ |
| `popup_view.test.tsx:135`        | popup            | `save: vi.fn()` | 给了没权限的方法                                 |
| `popup_view_height.test.tsx:142` | popup            | `save: vi.fn()` | 同上                                             |
| `popup_view_mirror.test.tsx:75`  | popup            | `save: vi.fn()` | 同上                                             |
| `tray_menu.test.tsx:21,40`       | tray             | `save: vi.fn()` | 同上                                             |
| `provider_card.test.tsx:114`     | （popup 视图内） | `save: vi.fn()` | 同上                                             |
| `smoke/setup.ts:134`             | 全局             | `save: vi.fn()` | 同上                                             |
| E2E `account_operations.spec.ts` | 真实 Electron    | 真实 preload    | 只测了"编辑"（`settings.open`），没测"隐藏/删除" |

**结论：**

- 单元测试 mock 不区分窗口路由，所有窗口 mock 给了全套 API
- E2E 避开了需要 `config.save` 的路径
- 没有 preload 路由逻辑的专门测试

### 类似风险

如果 popup/tray 视图有其他地方调 `config.save` / `saveSecrets` / `duplicate`，同样会静默失效。

### 待修项

- [x] **31.1 修复 preload 路由**：popup `default` 分支 `config_readonly` → `config_full`，现在有 `save`/`saveSecrets`/`duplicate`
- [x] **31.2 mock 路由对齐**：tray 测试 mock 只留 `get`，对应 `config_readonly`；移除无用 `useTheme` mock
- [x] **31.3 preload 路由 E2E 测试**：`preload_routes.spec.ts` 验证 popup 窗口暴露 `config.save` 等方法
- [x] **31.4 E2E 补齐删除路径**：`account_operations.spec.ts` 增加"删除"菜单项可见性测试
- [x] **31.5 全局排查**：`PopupView.tsx` 有 6 处 `config.save` 调用，`TrayMenu.tsx` 无调用 — 仅 popup 受影响
- [ ] **31.6 打包验收**：`pnpm package` 后真实点击隐藏/删除确认生效

---

## Phase 34: 历史弱验收 / 假完成审计

> 发现时间：2026-06-06 | 优先级：P1 | 状态：部分整改，历史 Phase22/24 全量复核待补

### 问题

历史多个 Phase 存在"任务文档已勾选完成，但测试或提交只能证明表层 UI 存在"的风险。当前已确认 Phase 30/31 是同型问题，Phase 22/24 有明显弱验收线索。

### 已确认假验收

#### Phase 30/31：账号级操作

- `68c537e feat: 主面板账号级操作（隐藏/删除/编辑菜单）`
    - 实际做了账号菜单、CPA hidden、直接账号 delete、settings open。
    - 没有完成真正账号级 disabled 闭环。
    - 测试集中在菜单文案和 handler 调用。
- `ef4be5b feat: Phase 30 完善 — settings navigate IPC + disabled 过滤 + 确认弹窗`
    - 补了 disabled 过滤和 settings navigate。
    - 设置页 CPA toggle 仍可能关闭整个 connector，不是目标账号。
- `8f2a353 feat: Phase 30 收尾 — 隐藏账号恢复 + accounts E2E + 文档同步`
    - E2E 只测账号菜单出现、编辑打开 settings window。
    - 没有测隐藏/关闭/删除后的 config 变化和 UI 结果。
- `4ce6ee6 fix: Phase 31 — preload 路由修复 + 测试对齐`
    - 修了 popup preload 权限。
    - 新增 E2E 仍只测"删除"菜单项可见和 `config.save` API key 存在。
    - 不能证明真实保存、隐藏、删除、关闭生效。

结论：Phase 30/31 的"账号行编辑、删除、开关全部接线到真实能力""关闭后可重新启用""E2E 验证编辑、关闭、隐藏/删除"等勾选过度。

### 疑似弱验收

#### Phase 24：CPA 详情页 / 设置页账号管理

- `10eae89 docs: 标记 Phase 24 全部完成`
    - 文档把"CPA 详情页字段完整""测试连接""保存并同步""UI 手工点击验收"标记完成。
- `7d7f7d9 test: Phase 24 测试更新`
    - 删除了"立即同步调用 refresh"的测试。
    - 删除了"同步失败显示错误"的测试。
    - 改为只测"移除数据源"按钮存在。

风险：测试覆盖从行为验证退化成存在性验证，但 TASKS 仍写成功能完整。

#### Phase 22：ProviderCard / demo 对齐

- `a51e3ed feat: add ProviderCard tests and mark all Phase 22 items complete`
    - 提交主要新增 `ProviderCard` 单元测试。
    - TASKS 同时勾选拖拽排序、设置持久化、托盘 E2E、packaged smoke 等较大验收项。
    - 测试多为文案、class、菜单项、按钮存在，不足以证明持久化、真实拖拽排序、打包产物手工验收。

风险：把组件层单测当成跨窗口/持久化/打包验收。

### 需要统一整改的验收规则

以后不能把以下检查当作功能完成：

- 按钮存在。
- 菜单项可见。
- handler 被调用。
- window 打开。
- preload API key 存在。
- CSS class 存在。
- `count >= 0` 这类永真断言。
- `test.skip` 掩盖刷新或数据未出现。

必须按业务结果验收：

- 点击后 config / cache / state 真实变化。
- UI 刷新后目标对象变化，且非目标对象不受影响。
- 失败路径有可见错误。
- reload / restart 后持久化仍生效。
- 对 Electron 权限问题，测试必须按真实窗口 route 暴露 API。
- 涉及打包的功能必须跑 packaged smoke 或明确写"未验证"。

### 待办

- [x] 记录 Phase 30/31 已确认假验收。
- [x] 记录 Phase 24 测试覆盖倒退线索。
- [x] 记录 Phase 22 组件测试替代真实验收风险。
- [x] 清理本轮发现的弱 E2E：账号操作、卡片状态、拖拽、设置账号、刷新状态、折叠高度、resize debounce 不再用永真断言或动态 skip。
- [ ] 逐项复核 Phase 22 的拖拽排序、设置持久化、托盘 E2E、packaged smoke 是否有真实测试或手工记录。
- [ ] 逐项复核 Phase 24 的测试连接、立即同步、同步失败错误展示是否仍可用。
- [ ] 清理或改写 TASKS 中所有"已完成但只有弱测试证明"的勾选。
- [x] 给账号操作、刷新状态补真实业务测试；CPA 设置仍需补测试连接 / 立即同步 / 失败展示复核。

---

1. 不实现本轮范围外的功能
2. 不重构无关文件
3. 不修改插件协议来适配实现
4. 每个新模块必须有测试
5. 运行测试并报告结果
6. secret 不进日志/错误消息/测试快照
7. renderer 不直接访问 Node API
8. 每轮输出修改文件列表
9. 每轮输出下一轮建议但不提前实现

## 每轮完成验证

1. 本轮改了哪些文件？
2. 哪些测试证明它工作？
