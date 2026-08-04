# Task review t196（reviewer_focus: 代码）

- task：`t196_refresh_semantics_popup_render_trim`
- spec：`docs/tasks/t196_refresh_semantics_popup_render_trim/spec.md`
- diff_anchor：`9d32603c0c4e4d09d681e8068567157781a5362e`
- target：`git diff 9d32603c0c4e4d09d681e8068567157781a5362e`
- round：1
- reviewed_at：2026-08-04 00:36 UTC+8

## Findings

### t196_code_f001 - plugin_list_equal 的 metadata 引用比较使 t153「reload 值相等不重渲染」优化失效

- 严重度：minor
- 锚点：AC4 相关；t153 既有优化被本 task 改写的 `plugin_list_equal` 破坏（性能回归，非显示错误）
- 位置：`src/renderer/hooks/use-plugins.ts:59`（`pa.metadata !== pb.metadata`）
- 问题：`handleConnectorList` 每次调用都经 `metadata_from_definition`（`src/main/ipc/connector-ipc.ts:121`）新建 `metadata` 对象，引用恒不等。`plugin_list_equal` 对非空列表因此恒返回 false，`reload()` 的 `setPlugins((prev) => plugin_list_equal(prev, list) ? prev : list)` 每次都替换 `plugins` 触发重渲染，使 `src/renderer/hooks/use-plugins.ts:92-94` 注释声明的「value-equal 时保留 prev 引用」失效。测试 fixture 用 `metadata: null`（`tests/unit/renderer/hooks/use_plugins.test.ts:64`），该回归未被 t153 reload identity 测试（`use_plugins.test.ts:516-534`）捕获。仅结构型配置广播触发 reload（`PopupView.tsx:217` 依赖 `plugins_structure_signature` 变化），影响面窄，仅多一次 React 重渲染，无显示错误。
- 建议：metadata 改按内容比较（对 `metadata` 单独做字段级或序列化比较），或明确将 metadata 从相等性判断中排除并在注释说明。

### t196_code_f002 - plugin_list_equal 未比较 supportedProviders / activeProviders

- 严重度：minor
- 锚点：AC4 相关；相等性判断不完整，属潜在漏判
- 位置：`src/renderer/hooks/use-plugins.ts:44-63`
- 问题：`ConnectorInfo` 含 `supportedProviders` / `activeProviders`（`src/shared/types/ipc.ts:184-185`），`plugin_list_equal` 未纳入比较。当前被 f001（metadata 引用恒不等）掩盖——定义类 connector 恒走更新分支，未暴露漏判；一旦 f001 改为内容比较，若 `activeProviders` 变更（如 CPA connector 的 `monitor_*` 参数开关，见 `connector-ipc.ts:93-99`）而其余字段相等，会漏更新导致 UI 持有过期 `activeProviders`（渲染层依赖它，如 `PopupView.tsx:398,453`）。definition-less connector 的 `activeProviders` 恒空（`connector-ipc.ts:41-43`），无实际路径触发，故为潜在缺陷。
- 建议：补上两字段比较（数组浅比较或引用比较），或在结构签名中显式覆盖后移除它们。

### t196_code_f003 - 立即 ack 后 spinner 不再绑定真实 pending，与上下文区决策不符

- 严重度：minor
- 锚点：上下文区已批准决策「spinner 绑定真实 pending」未落实；AC1 本身满足（立即 loading + 推送驱动）
- 位置：`src/renderer/views/PopupView.tsx:378-430`（`handleRefreshAll` / `refreshProvider`）
- 问题：`connector.refresh` 改为立即 resolve 后，`refreshProvider` 的 `Promise.all` 即刻落 `.finally`，`refreshing_providers` 在 `MIN_SPINNER_MS`（500ms）定时后移除；`handleRefreshAll` 的 `refreshing` 在 `.finally` 中立即复位。ProviderCard 的「刷新中…」/ spinning 图标（`ProviderCard.tsx:189,203`）只绑定 `is_refreshing`，不绑定快照 loading 状态，因此慢采集（>500ms）期间 spinner 提前结束，用户无进行中指示，直到数据经推送更新。旧实现（await 完整采集）spinner 持续至采集完成。spec 上下文区「未知契约清单」已核销为「spinner 绑定真实 pending」，实现未达成。失败仍经 failed 态推送可见，故不构成 AC1 违约。
- 建议：将 `refreshing_providers` / `refreshing` 的移除时机改为绑定快照 `loading` 推送（采集结束置 false），保留 500ms 下限；或修订上下文区决策声明以匹配实现。

### t196_code_f004 - 手动刷新 fire-and-forget 吞掉采集前错误，renderer 无反馈

- 严重度：minor
- 锚点：AC1 相关；swallowed errors 窄路径
- 位置：`src/main/ipc/connector-ipc.ts:199-202`、`213-216`
- 问题：`void refreshService.refresh(...).catch(log.error)` 后立即 `return ok(undefined)`。若 `refresh` 在进入采集前抛错（如 `refresh-service.ts:233` 的 `configStore.load()` 失败，或实例/定义在校验后消失，`refresh-service.ts:237-247` 静默 return），renderer 的 invoke 仍 resolve ok，且无 failed 状态推送——旧实现 invoke 会 reject，renderer 侧 `refreshProvider` 的 `.catch` 记录「刷新失败」日志。采集失败（最常见路径）仍由 failed 态推送覆盖，仅采集前错误静默，且主进程已 `log.error`。
- 建议：对进入采集前失败保留一个 IPC 层 fail 结果，或在该路径下补一次 failed 态推送，避免无任何用户可见反馈。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：4 条（均 minor）
- 未进表的提示：
    - 文件过大（≥400 minor 阈值且本 task 净增，未达 800 important）：`src/renderer/views/PopupView.tsx`（742 行，净 +16）、`src/preload/index.ts`（501 行，净 +6）、`src/shared/types/ipc.ts`（498 行，净 +29）。未给不可拆硬约束，建议后续拆分。
    - 复杂度：`snapshot_equal`（`use-plugins.ts:10-42`）为新增函数，switch 4 臂 + 各臂多字段 `&&` 比较，近似 McCabe 偏高；`plugin_list_equal` 近似 14。两者均为扁平字段比较、无嵌套业务逻辑，未产出可观测缺陷（分支漏处理/状态不一致），按「复杂度不 blocking」只作提示，不进 finding 表。
    - 范围外观察：无。改动文件全部落在 spec 范围（刷新语义 / 测高 / 相等性 / trend 批量），未触碰调度、重试、vault/config 缓存（t195）、图表视觉。
- 总体判断：AC1–AC5 实现与测试齐备（AC6 需部署人工验证），仅 4 条 minor（性能回归与 UX 语义偏差），无未解决 critical / important，可 PASS。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-04 01:20 UTC+8)

### 前轮 finding 复核（以 diff/代码/测试为准）

- **f001（metadata 引用比较破坏 t153 reload 优化）— 已消除**：`src/renderer/hooks/use-plugins.ts:48-51` 新增 `metadata_equal`，对 `PluginMetadata` 小对象做 `JSON.stringify` 内容比较（f001 建议方向），`plugin_list_equal` 第 80 行改用它。reload 路径 `connector-ipc.ts:121` 每次由同一 definition 重建 metadata，字段全部为纯 JSON 序列化类型且键序稳定，内容比较恒等 → `plugin_list_equal` 返回 true → `setPlugins` 保留 prev 引用，t153「值相等不重渲染」恢复。`state_to_snapshot_dto`（`helpers.ts:97-104`）复用 runtime-store 的 `state.items` 引用，reload 时 `a.items === b.items` 成立，`snapshot_equal` 亦返回 true。t153 reload identity 测试（`use_plugins.test.ts:516-534`）通过。修复正确，无新问题。
- **f002（未比较 supportedProviders/activeProviders）— 已消除**：`use-plugins.ts:53-61` 新增 `string_array_equal`（引用短路 + 长度 + 逐元素），第 78-79 行纳入两数组比较。两数组均由 `connector-ipc.ts` 确定性生成（`supported_providers` 固定、`activeProvidersForConnector` 按 manifest 参数序过滤），顺序敏感比较安全。CPA `monitor_*` 参数开关变更 `activeProviders` 时 `plugin_list_equal` 返回 false → 更新，f002 所述漏判关闭。
- **f003（spinner 绑定快照 loading）— 已实现，含一处理论兜底缺口（见 f005）**：`PopupView.tsx:375-500` 用 `refresh_actions_ref`（instances + pre_loading）/ `refresh_fired_at_ref` 记录动作，effect 内 `action_done` 按「刷新后新出现的 loading（排除点击前已 loading 实例）」判定清除，保留 500ms 下限。逐场景推演均正确：
    - 快速完成：500ms 下限后一次性定时器清除；
    - 慢采集（loading 持续）：`any_new_loading` 保持 true，spinner 持续至 ready/failed 推送；
    - 点击前已 loading（定时采集占位）：pre_loading 排除，500ms 后清除，不钉死全局 spinner；
    - 完成结果与刷新前同值（零观测保留 prior，`refresh-service.ts:377-381`）：ready 推送被 `snapshot_equal` 去重、无 effect 重跑，但定时器在 +500ms 判定清除；
    - 立即 ack 不提前结束：`refreshing` / `refreshing_providers` 不再于 `.finally` 清除。
    - 测试覆盖：`popup_view_height.test.tsx:427-508` 两条 f003 测试（进行中保持 + pre-existing loading 排除）通过；`connector-ipc.test.ts` 立即 ack 测试通过。
- **f004（fire-and-forget 吞采集前错误）— 已修，含两处残余说明**：`connector-ipc.ts:199-205` 单实例刷新 `.catch` 内补 `runtimeStore.updateState(parsed.data, { status: "failed", error: msg })`，采集前抛错（如 configStore.load 失败）renderer 经 EVENT_STATE_CHANGE 收到 failed，AC1「失败最终落 failed 态」闭合。测试：`connector-ipc.test.ts` mockRejectedValue + 断言 update_state 收到 `{status:"failed", error:"config load failed"}`，通过。两处残余（不阻断）：(a) `refreshAll` 系统性失败（`refresh-service.ts:530` configStore.load 抛错）仍只 log 无 failed 推送——无单一实例可归属，renderer 侧 spinner 500ms 后清除，可接受；(b) 该 failed 推送未带 `lastSuccess`（正常失败路径 `refresh-service.ts:501-505` 保留），采集前失败时卡片丢失 stale 数据显示直至下次成功——罕见路径的显示级降级，不构成数据丢失。

### 本轮新发现

- **t196_code_f005 - SPINNER_SAFETY_MS 兜底是事件驱动而非时间驱动，loading 挂起时 60s 兜底永不求值**
    - 严重度：minor
    - 锚点：f003 修复引入的代码级缺口（当前运行时不可达，无 AC 违约）
    - 位置：`src/renderer/views/PopupView.tsx:438-500`（`action_done` 439-451、一次性定时器 474-495）
    - 问题：`action_done` 仅在两类时机求值——effect 重跑（依赖 `refreshing` / `refreshing_providers` / `plugins` 变化，即状态推送）与 effect 内一次性 `setTimeout`。若某 connector 进入 loading 后不再有状态推送（采集真正挂起且无超时），定时器在最后一次 effect 后 +500ms 触发一次：`elapsed >= MIN_SPINNER_MS` 但 `any_new_loading` 仍为 true → 返回 false，既不清除也不重排定时器；此后无任何事件触发 effect，`SPINNER_SAFETY_MS`（60s）分支永远不被求值，spinner 无限期卡死。注释「超时安全兜底防卡死」未达成。当前运行时因 connector 执行均有界（`net-client.ts:228` 默认 15s AbortController 超时；`runtime.ts:114-118` `race_with_timeout`），终态推送必然到达，故实际不可达——属潜在缺陷，非当前可观测 bug。
    - 建议：改用 `setInterval` 周期性求值 `action_done`，或定时器回调内未完成时重新排程，使 60s 兜底真正时间驱动；或修订注释避免误导。

### 结论

- 前轮 finding 复核：f001-f004 均按 diff/代码核实已消除或已实现（f004 两处残余属可接受显示级差异）；f003 存在一处当前运行时不可达的兜底缺口（f005）。
- 本轮新发现：1 条（f005，minor）
- 未进表的提示：
    - 测试层观察（不属代码缺陷）：`use_plugins.test.ts` fixture 仍用 `metadata: null`、`activeProviders: ["deepseek"]`，f001/f002 的新比较分支（metadata 内容比较、数组变化触发更新）无直接单测守卫，建议 test reviewer 评估补 fixture（非 null metadata / 变更 activeProviders 的 reload 用例）。
    - 复杂度：`plugin_list_equal`（约 14 分支 + 嵌套 `snapshot_equal` / `metadata_equal`）与 f003 effect 的 `action_done`（6 分支）未超阈值，且均已产出正确行为，不进 finding 表。
    - 范围外观察：无。Round 2 修复只落在 `use-plugins.ts` / `PopupView.tsx` / `connector-ipc.ts` 三文件，未触碰调度、t195 缓存层、图表视觉。
- 总体判断：f001-f004 按代码核实全部落实，受影响测试（38 + 16 用例）通过；仅 f005 一条理论兜底缺口（minor），无未解决 critical / important，可 PASS。
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-04 01:42 UTC+8)

### 前轮 finding 复核（以 diff/代码为准）

- **f005（SPINNER_SAFETY_MS 兜底事件驱动非时间驱动，loading 挂起时 60s 永不求值）— 已消除**：`PopupView.tsx:473-507` effect 内定时器改为自排程周期求值。核验要点：
    1. **loading 挂起（无状态推送）时仍每 500ms 求值**：effect 首次运行设 `timer = setTimeout(check, 500)`；`check()` 末尾 `if (refreshing_providers.size > 0 || refreshing)` 重排。挂起时闭包快照 `refreshing_providers.size > 0`（provider 刷新）或 `refreshing === true`（ALL 刷新）恒成立 → 持续每 500ms 重判。
    2. **60s 分支最终可达**：`action_done`（439-451）读 `refresh_actions_ref.current` / `refresh_fired_at_ref.current` / `plugins_ref.current` 三个 ref（最新值），`elapsed > SPINNER_SAFETY_MS` 返回 true → `clear_action` + 复位 spinner。兜底由「事件驱动」转为「时间驱动」，f005 所述缺口关闭。
    3. **闭包快照不影响正确性**：`check()` 读的 `refreshing_providers.size` / `refreshing` 为 effect 闭包捕获值，但**仅用于「是否继续排」判断，不参与清除决策**。清除决策全走 refs（最新）。React state 变化必触发 effect 重跑更新闭包；同值 bail out（`setRefreshing(prev => prev)` / `set_refreshing_providers(prev => prev)`）时闭包快照等于最新状态。状态归零后 effect 重跑 → 新闭包 `size === 0 && refreshing === false` → 不重排，定时器链终止。
    4. **无 cleanup 泄漏**：`let timer` 为 effect 内单一闭包变量，`check()` 自排程更新它、cleanup（504-506）读同变量 `clearTimeout(timer)`，能清链尾。effect 重跑时旧闭包已排但未 fire 的 timer 被 cleanup 清除，不会泄漏。
    5. **无无限定时器 / 竞态**：状态归零后不会误排（见上）；`clear_action` 幂等（`delete` 不存在键 no-op），`action_done` 对已清 action 返回 true（`action === undefined → true`），check 与 effect top 部分重复执行清除逻辑结果一致，无状态分叉。
    - 测试：`popup_view_height.test.tsx:445-494`（进行中保持）用真实定时器验证 loading 期间超过 500ms 仍 spinning，与自排程兼容；60s 兜底无 fake-timer 直接测试，但 f005 原为理论缺口（当前运行时 connector 有界超时，终态必达），不构成新 finding。

### 本轮新发现

无。

### 结论

- 前轮 finding 复核：f005 按 diff 核实已真实修复——自排程周期求值使 60s 兜底时间驱动可达，闭包快照仅影响重排判断、清除决策走最新 refs，无 cleanup 泄漏 / 无限定时器 / effect 竞态新问题。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：f005 修复正确，无未解决 critical / important，可 PASS。
- 系统性 follow-up：无

verdict: PASS
