# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

需求定稿 `docs/tasks/t211_session_history_window/requirements.md`（决策 7），另加面板间互通入口需求。会话历史窗口需要在多处可打开：代理面板「会话明细」行（单击 / 多选批量）、系统托盘 popup、用量面板、代理面板 header 的「到会话历史」按钮。各面板之间可经按钮互相跳转。本 task 实现全部「打开会话历史」的入口与面板间导航按钮。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 会话明细表（`SessionTable.tsx`）行首加 checkbox 列；工具栏加「打开历史」按钮，勾选 ≥1 行可用，点击批量打开勾选会话；单击行 = 打开该会话（不改 checkbox 选中态）。checkbox 选中态仅当前页有效，翻页清空。
- 托盘 popup / 用量面板（`PopupView` 的 `TitleBar`）加「会话历史」按钮，点击经 `SESSION_HISTORY_OPEN` 打开 / 聚焦历史窗口。
- 代理面板（`TokenStatsView` header）加「到会话历史」按钮，同样打开 / 聚焦历史窗口。
- 会话历史窗口内加返回入口（跳回用量面板 / 代理面板），与既有「用量面板」「设置」导航按钮同级，构成面板间互通。
- 所有入口调用 t210 的 `SESSION_HISTORY_OPEN` / 订阅通道，传会话定位（source, env, session_id）；纯跳转按钮（无具体会话）只 OPEN / 聚焦窗口。
- 沿用现有「一窗一 channel + preload 方法」窗口打开模式（参照 `TOKEN_STATS_OPEN` / `settings.open()`）。

### 非范围

- 会话历史窗口本身与主进程通道实现（t210 / t211）。
- 明细表排序 / 分页 / 既有展示逻辑不变。
- 超 6 弹窗逻辑（t211 窗口侧负责；本 task 只把会话送过去）。
- 用量面板 / 代理面板 / 托盘的既有业务功能。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 明细表每行行首出现 checkbox，可勾选 / 取消；勾选 ≥1 行「打开历史」可用，点击后历史窗口打开全部勾选会话；单击行（非 checkbox 区）打开该会话且不改选中态；翻页清空选中。
- [ ] 托盘 popup / 用量面板 TitleBar 出现「会话历史」按钮，点击打开 / 聚焦历史窗口。
- [ ] 代理面板 header 出现「到会话历史」按钮，点击打开 / 聚焦历史窗口。
- [ ] 会话历史窗口内有返回用量面板 / 代理面板的入口，点击跳转对应窗口。
- [ ] 各入口 OPEN 幂等：历史窗口未开则创建、已开则聚焦，不重复开多窗。
- [ ] 明细表排序、分页、既有列展示不因新增列与单击行为回归；各面板既有按钮功能不回归。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 明细表交互、各按钮渲染与点击调用参数：组件级测试（mock `SESSION_HISTORY_*` / 窗口 OPEN preload API）可自动测。
- 跨窗口真实聚焦 / 跳转：需真实窗口环境，[deploy] 由 t213 手动验收。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 真实跨窗口聚焦与跳转：人工验收（t213）。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- mock 边界：mock `SESSION_HISTORY_OPEN` / 订阅 / 各窗口 OPEN preload API，断言调用参数。
- 断言目标：checkbox 状态机、按钮可用态、单击行行为、翻页清空、按钮渲染与点击、不回归。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 托盘 popup 的 `TitleBar` 在不同模式（popup / floating / web）下「会话历史」按钮的展示约束：已核实，结论如下。验证方式：读 `src/web/usageboard-web.ts` 与 `src/preload/index.ts` 的 API 分权实现。
    - `src/web/usageboard-web.ts` 的 `sessionHistory.open` 是 no-op stub（`() => Promise.resolve()`），web 版无真实 IPC 通道；`src/preload/index.ts` 的 `session_history_disabled_methods.open` 同样 no-op，`select_session_history_api` 仅在 history / agent route 返回 full 方法（history route 注释确认会话历史窗口是真实 IPC）。
    - 结论：桌面模式（popup / floating）`sessionHistory.open` 是真实 IPC，按钮显示；web 模式是死按钮，按钮隐藏。守卫用 `!is_web()`，与现有「代理面板」按钮（`is_web()`，web 下经 tokenStats.open 进代理面板）相反。历史窗口打开为只读，不依赖 `is_live`。

### 风险与回退

- 风险：单击行与既有行内可点元素（排序头、分页器）事件冲突；面板导航按钮与既有按钮布局冲突。
- 回退：行单击只在行体区域生效，排除表头与分页器；导航按钮沿用现有 `ts-nav-btn` / `tb-actions` 样式与布局位置。

### 依赖与约束

- 依赖 t210 的 `SESSION_HISTORY_OPEN` 通道与 t211 的窗口可开。
- 硬约束：全程只读，本 task 不触文件。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：面板间导航入口与窗口打开通道条目（随 t211 一并累积）。
