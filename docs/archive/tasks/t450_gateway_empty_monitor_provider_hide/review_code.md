# Task review t450（reviewer_focus: 代码）

- task：`t450_gateway_empty_monitor_provider_hide`
- spec：`docs/tasks/t450_gateway_empty_monitor_provider_hide/spec.md`
- diff_anchor：`a44fdace91422e81e7532b72f002f996e7901c5d`
- target：`git -C '/home/karon/karson_ubuntu/omni_panel_t450' diff a44fdace91422e81e7532b72f002f996e7901c5d`
- round：1
- reviewed_at：2026-09-04 21:30 UTC+8

## Findings

### t450_code_f001 - 失败态携带上次成功 items 时，空 monitor provider 被过滤隐藏、失败 banner 无处可挂

- 严重度：important
- 锚点：spec 范围「snapshot failed / loading / idle（无 items）时 gateway 保留全部 activeProviders（失败态需挂 banner）」被违反；AC-003 只覆盖 failed 无 items 形态，未覆盖真实失败形态。reviewer 已确认该非项属 spec 范围（非「有意不测」）。
- 位置：`src/renderer/lib/provider-usage.ts:438-448`（过滤条件在 :447）
- 问题：实现把「gateway 仅并入 items 实际出现的 provider」的过滤条件绑在 `has_items`（`items.length > 0`），而非快照状态 `status === "ready"`。但运行时失败态快照**携带上次成功 items**：refresh-service 全轮失败后 `updateState({ status: "failed", error, lastSuccess: prior })`（`src/main/core/scheduler/refresh-service.ts:575-579`），DTO 序列化把 `lastSuccess.items` 一并带出（`src/main/ipc/helpers.ts:105-119`），且 CPA 为 auto-refresh、失败态由 snapshot-cache 持久化（`snapshot-cache.ts:71-86`），是常态而非边角。
  失败场景：CPA activeProviders=[claude,kimi]、claude 有数据、kimi 配置 monitor_kimi=true 但网关零 kimi 数据（p217 场景）→ CPA ready 态 kimi 已按本修复正确隐藏。此后某轮整连接器刷新失败（manager 宕机/网络断）→ 快照变 failed 且携带 stale items（仅 claude）。此时 `has_items=true`，kimi 仍被过滤出 `visible_providers`；而 `providerErrors` 会为 kimi 生成失败 banner（`use_popup_derived.ts:87-107`），但 ProviderOverview 只渲染 `visibleProviders` 内的卡（`ProviderOverview.tsx:83,90-127`）——kimi 卡整体消失，banner 与重试入口无处展示，tab 亦不出现。用户侧观感：刚配置好 kimi 监控即遇采集失败时，kimi 既无卡也无错误提示，与范围「失败态需挂 banner」相悖。
  现有 AC-003 测试（`tests/unit/renderer/provider-usage.test.ts:501-511`）只覆盖 failed 且无 items（首采即失败），全部 activeProviders 保留通过；未覆盖 failed+lastSuccess items 的真实失败路径。
- 建议：以快照状态而非 `has_items` 作过滤门：仅当 `connector.source === "gateway" && snapshot.status === "ready"` 时按 items 出现的 provider 收窄可见集；failed/loading/idle（含携带 lastSuccess items 的形态）一律保留全部 activeProviders，失败 banner 才可锚定。同步补一条「failed + items（含 stale items）保留全部 activeProviders」单测锚定真实失败形态。

### t450_code_f002 - snapshot items 提取逻辑在相邻两函数间复制，守卫条件不同存在漂移风险

- 严重度：minor
- 锚点：代码质量（DRY / 状态一致性）——非 blocking。
- 位置：`src/renderer/lib/provider-usage.ts:437-445`（新增）vs `:219-221`（既有 `build_provider_usage_groups`）
- 问题：`build_provider_usage_groups`（:219-227）与 `visible_providers_from_groups`（:437-448）各自从 `connector.snapshot` 提取 `items` 并判 `has_items`，但守卫不同：前者用 `has_items && "updatedAt" in snapshot`（`ready`/携带 `updatedAt` 的 failed/loading 才建 group），后者新逻辑只用 `Array.isArray(snapshot.items)` + `has_items`。二者当前对同一 DTO 输入语义一致，但「可见 provider 集合」与「实际渲染出 group 的 provider」是同一渲染面（ProviderOverview 卡 = `visibleProviders ∩ 卡序`；组数据 = `groups`），两套守卫若后续各自演进（例如 group 侧调整 failed 语义），会出现「有 group 无可见卡」或「卡内无 group」的静默不一致，且无共享代码提示。
- 建议：抽出共享 helper（如 `snapshot_items(snapshot)`）并在两处复用，或在两函数互相引用注释该不变量；本轮不必重构，属防漂移提示。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 本轮新发现：2 条（1 important + 1 minor）。
- 未进表的提示：
  - 文件过大：`src/renderer/lib/provider-usage.ts` 661 行（≥400 minor 阈值）、`tests/unit/renderer/provider-usage.test.ts` 1326 行（≥600 minor 阈值），但两者在 diff 前已分别 649/1280 行，本 task 净增 ≤46 行，非本 task 堆大所致，故不进 finding 表。
  - 圈复杂度：本 task 新增分支为单层 `if` + `continue`（`visible_providers_from_groups` 内），未触碰复杂度阈值。
  - 范围外观察：无。
- 总体判断：修复方向与 ready 态 AC（隐藏空 monitor provider）成立且单测有效，但「失败态保留全部 activeProviders」在真实失败形态（failed 携带 lastSuccess items）下未达成，存在未解决 important finding，本轮 FAIL。
- AC 复验方式：
  - AC-001：`re_verified`——运行 `npx vitest run tests/unit/renderer/provider-usage.test.ts`（60 通过），新用例「t450 AC-001」（:467-482）构造 gateway ready items=[claude]、activeProviders=[claude,kimi]，断言 visible=[claude] 且不含 kimi；与实现 `:447` 过滤逻辑核对一致。
  - AC-002：`re_verified`——新用例「t450 AC-002」（:484-499）构造 gateway ready items=[kimi]，断言 visible=[kimi] 且不含 claude，直接验证「有数据 monitor provider 保留」。
  - AC-003：`re_verified`（仅无 items 形态）——新用例「t450 AC-003」（:501-511）构造 failed 无 items，断言 activeProviders 全保留、与 `:439/:447` 的 `!has_items` 分支一致。**注意**：真实 CPA 失败态为 failed 携带 lastSuccess items（refresh-service + snapshot-cache 路径），该形态不在 AC-003 测试与实现保护内，即 f001 所指缺口；reviewer 未能复验「失败态挂 banner」完整语义。
  - coverage = 3 / 3（其中 AC-003 仅覆盖无 items 子形态，真实失败形态缺口见 f001）。
- 系统性 follow-up：无既有 tid；如采纳 f001 建议方向，可考虑跟进 task（标题建议「gateway failed 态携带 stale items 时可见性收窄致 banner 丢失」，slug `gateway_failed_stale_visibility_banner`）。

reviewed_scope: 8d2bd8ab92a8a3c2

verdict: FAIL

## Round 2 (2026-09-04 21:37 UTC+8)

### 前轮 finding 复核

- t450_code_f001（important）：**已消除**。修复后过滤门改为 `snapshot.status === "ready"`（`src/renderer/lib/provider-usage.ts:448,453`），failed/loading/idle 不再按 items 收窄、activeProviders 全保留；新增用例「t450 f001: CPA failed snapshot with stale lastSuccess items still keeps all monitor providers」（`tests/unit/renderer/provider-usage.test.ts:513-533`）构造 failed+error+updatedAt+stale items=[claude]，断言可见集 [claude,kimi]。端到端语义成立：failed 保留全部 → ProviderOverview 有 kimi 卡可挂失败 banner（`use_popup_derived.ts:87-107` 对每个 failed connector 的 activeProviders 生成 providerErrors）。测试绿。
- t450_code_f002（minor）：**已消除**。`snapshot_items_of`（`provider-usage.ts:205-208`）统一 items 提取与 `Array.isArray` 判定，`build_provider_usage_groups:225` 与 `visible_providers_from_groups:450` 复用同一 helper；group 侧「has_items && updatedAt」与可见侧「status==='ready'」守卫差异保留为有注释的有意语义差异（数据组 vs 可见性），items 提取漂移源已消除。

### Findings（Round 2）

#### t450_code_f003 - 修复引入回归：ready 快照空 items 时全部 gateway monitor providers 被剔除，违反「ready 空 items 视为无 items 走保留分支」

- 严重度：important
- 锚点：spec 契约区范围首句将过滤触发限定为「snapshot ready **且 items 非空**」；spec 上下文区「依赖与约束」明确「snapshot ready 空 items 视为无 items 走保留分支」（已批准决策，非可商榷提案）。Round1 版实现以 `has_items`（`items.length>0`）作门，ready+空 items 走保留分支、符合 spec；本轮修复采纳 f001 建议改为 status 门后 `is_ready` 不再要求 items 非空，空 items 也进入过滤分支——该合法边界语义被翻转，属修复引入的回归。
- 位置：`src/renderer/lib/provider-usage.ts:448-455`（触发点 `:453` 的 `is_ready && !present_providers.has(provider)`）
- 问题：可复现输入——`connectorInfo({ source:"gateway", activeProviders:["claude","kimi"], snapshot:{status:"ready", updatedAt:"...", items:[]} })` → `visible_providers_from_groups` 返回 `[]`（`present_providers` 为空集，两个 activeProvider 均命中 `!present.has` 的 `continue`）；spec 决策要求该形态返回 `["claude","kimi"]`。坏结果：CPA 下全部 monitor provider 卡与 tab 从 popup 消失（空面板），而非按保留分支显示占位并待后续恢复。生产主路径该形态不常见——refresh-service t039 禁止写 ready+空 items（零观测有 prior 时保留 `prior.items`、无 prior 标 failed，`src/main/core/scheduler/refresh-service.ts:375-403`）——触发面主要是 snapshot-cache 遗留条目或绕过 t039 的注入/未来 connector 路径；spec 作者正因采集路径无法保证该边界才显式声明保留分支，实现偏离该已批准决策即回归，且与 Round1 行为相反。当前亦无用例锚定「ready+空 items 保留」边界。
- 建议：过滤条件补 items 非空限定，例如 `const has_items = snapshot_items_of(snapshot).length > 0;` 后将条件改为 `connector.source === "gateway" && is_ready && has_items && !present_providers.has(provider)`；并补一条「gateway ready + 空 items 保留全部 activeProviders」单测。

### 结论（Round 2）

- 前轮 finding 复核：t450_code_f001 已消除；t450_code_f002 已消除（见上，以 diff/代码核实，非采信处置表）。
- 本轮新发现：1 条 important（t450_code_f003）；popup_view_config fixture 迁移复核无问题（见「未进表的提示」）。
- 未进表的提示：
  - 文件过大：`src/renderer/lib/provider-usage.ts` 667 行、`tests/unit/renderer/provider-usage.test.ts` 1343 行、`tests/unit/renderer/views/popup_view_config.test.tsx` 767 行均达 minor 阈值，但非本 task 堆大（provider-usage.ts 自 anchor 净增 ~18 行，测试净增为 AC/fixture 用例），不进 finding 表。
  - 圈复杂度：新增分支为单层 `if` + `continue`，未触阈值。
  - popup_view_config fixture 迁移复核：「saves providerOrder to config when user reorders provider tabs」用例（`popup_view_config.test.tsx:672-`）输入由 gateway ready 空 items 改为含 claude+deepseek 两条 MetricRecord 的 items，使 t450 新语义下两 provider 仍可见、拖拽排序原意图与断言保留（改输入不改断言，非把旧预期改成新实现输出）；items 字段与 `MetricRecord` 形状一致，测试跑通。无新问题。
  - 范围外观察：无。
- 总体判断：f001 修复方向正确、真实失败形态（failed 携带 stale items）已覆盖且有测试锚定，但修复把 spec 明确定义的「ready 空 items → 保留分支」翻转成「剔除全部」，存在未解决 important，本轮 FAIL。
- AC 复验方式：
  - AC-001：`re_verified`——「t450 AC-001」用例（`provider-usage.test.ts:467-482`）ready items=[claude]、active=[claude,kimi]，断言 visible=[claude] 不含 kimi，与 `:453` 过滤逻辑一致。
  - AC-002：`re_verified`——「t450 AC-002」（`:484-499`）ready items=[kimi]，断言 visible=[kimi] 不含 claude。
  - AC-003：`re_verified`——「t450 AC-003」（`:501-511`，failed 无 items）与「t450 f001」（`:513-533`，failed 携带 stale lastSuccess items）两用例共同锚定失败态全保留，覆盖真实 CPA 失败路径。
  - 复验命令：`npx vitest run tests/unit/renderer/provider-usage.test.ts tests/unit/renderer/views/popup_view_config.test.tsx`（75 passed）；再全量 `tests/unit/renderer`（121 files / 1349 passed）确认无渲染回归。
  - coverage = 3 / 3
- 系统性 follow-up：无既有 tid；无独立 follow-up 建议（f003 属本 task 范围内修复回归，应在本 task 内处置）。

reviewed_scope: d87ad8acc8eab714

verdict: FAIL

## Round 3 (2026-09-04 21:40 UTC+8)

### 前轮 finding 复核（以 `git -C '/home/karon/karson_ubuntu/omni_panel_t450' diff a44fdace91422e81e7532b72f002f996e7901c5d` 当前工作树核实，非采信处置表）

- t450_code_f001（important）：**已消除且保持**。过滤门现为 `connector.source === "gateway" && is_ready && items.length > 0`（`src/renderer/lib/provider-usage.ts:451`）；failed/loading（含携带 lastSuccess items 的失败态）`is_ready` 为 false，不走收窄、activeProviders 全量并入（`:460-462`）。锚定用例「t450 f001: CPA failed snapshot with stale lastSuccess items...」（`tests/unit/renderer/provider-usage.test.ts:513-528`）仍绿，真实 CPA 失败形态（failed+error+updatedAt+stale items）保留 [claude,kimi]。banner 锚点闭环未回退。
- t450_code_f002（minor）：**已消除**。`snapshot_items_of`（`provider-usage.ts:206-208`）为 items 提取唯一入口，`build_provider_usage_groups:225` 与 `visible_providers_from_groups:450` 复用，两处守卫差异（group 侧 `has_items && "updatedAt" in snapshot` vs 可见侧 `status==="ready"`）为有注释的有意语义差异，提取漂移源已消除。
- t450_code_f003（important）：**已消除**。`:451` 收窄条件在 `is_ready` 基础上补 `items.length > 0`：ready 空 items 不再进入过滤分支，落 `:460` 保留分支、全部 activeProviders 可见。锚定用例「t450 f003: CPA ready snapshot with empty items keeps all monitor providers（保留分支）」（`provider-usage.test.ts:530-544`）断言 [claude,kimi] 全保留。与 Round 1 该边界的原始行为（has_items 门）一致，回归已复位；与 f001（failed 分支）正交，互不破坏。

### Findings（Round 3）

#### t450_code_f004 - 注释把 loading 全保留行为表述为「防跳动」，与 spec 授权的实际语义相悖

- 严重度：minor
- 锚点：代码质量（注释准确性）——非 blocking。
- 位置：`src/renderer/lib/provider-usage.ts:446-447`
- 问题：注释写「loading 保留上次可见集防跳动」，但 `:451` 过滤分支对 loading 态不触发，`activeProviders` **全部**并入可见集，并非「上次可见集」。t450 ready 收窄后两者已分叉：CPA ready items=[claude]、activeProviders=[claude,kimi] 时可见集为 [claude]（kimi 隐藏，p217 语义）；下一轮采集进入 loading 快照则 kimi 卡闪回出现。即保留「全部 activeProviders」恰恰是空 provider 卡闪跳的来源（虽为 spec 明确批准的 loading 语义），与「防跳动」字面相反；注释作为未来维护依据会误导后续调整 loading 语义（如误以为可收窄至上次可见集）。
- 建议：注释改为如实表述，如「loading/failed 保留全部 activeProviders：失败态供 banner 锚定、loading 与空 items 态维持卡片/入口不消失（闪跳为该 spec 已批准语义）」；或将「防跳动」改为「防面板整体消失」。

### 结论（Round 3）

- 前轮 finding 复核：t450_code_f001 已消除且保持；t450_code_f002 已消除；t450_code_f003 已消除（以 diff/代码核实，非采信处置表）。
- 本轮新发现：1 条 minor（t450_code_f004）。
- 未进表的提示：
  - 文件过大：`src/renderer/lib/provider-usage.ts` 672 行、`tests/unit/renderer/provider-usage.test.ts` 1359 行、`tests/unit/renderer/views/popup_view_config.test.tsx` 767 行均达 minor 阈值，但自 anchor 分别净增 ~23/79/40 行且为本 task AC/fixture 用例与 f003 修复所必需，非 task 堆大失控，不进 finding 表。
  - 圈复杂度：新增分支为单层 `if`+`continue`（`:451-459`），未触阈值。
  - 范围外观察：无。
- 总体判断：三个前轮 finding（2 important + 1 minor）均以代码核实真修，f003 修复未引入新 blocker；唯一遗留为注释措辞 minor。无未解决 critical/important，本轮 PASS。
- AC 复验方式：
  - AC-001：`re_verified`——「t450 AC-001」（`provider-usage.test.ts:467-482`）gateway ready items=[claude]、active=[claude,kimi]，断言 visible=[claude] 不含 kimi；与 `:451-458` 收窄逻辑一致。
  - AC-002：`re_verified`——「t450 AC-002」（`:484-499`）ready items=[kimi] 断言 visible=[kimi] 不含 claude。
  - AC-003：`re_verified`——「t450 AC-003」（`:501-511`，failed 无 items）与「t450 f001」（`:513-528`，failed 携带 stale lastSuccess items）共同锚定失败态全保留；「t450 f003」（`:530-544`）锚定 ready 空 items 保留分支（spec 约束的边界，f003）。
  - 复验命令：`npx vitest run tests/unit/renderer`（121 files / 1350 tests passed，其中 provider-usage 62、popup_view_config 14）；`npx tsc --noEmit` 0 error。
  - coverage = 3 / 3
- 系统性 follow-up：无既有 tid；无独立 follow-up 建议。

reviewed_scope: 8deafcc4c425d006

verdict: PASS

## Round 4 (2026-09-04 21:44 UTC+8)

### 前轮 finding 复核（以 `git -C '/home/karon/karson_ubuntu/omni_panel_t450' diff a44fdace91422e81e7532b72f002f996e7901c5d` 当前工作树核实，非采信处置表）

- t450_code_f001（important）：**仍消除**。过滤门保持 `connector.source === "gateway" && is_ready && items.length > 0`（`src/renderer/lib/provider-usage.ts:451`）；failed/loading（含携带 stale lastSuccess items 的失败态）`is_ready=false` 不走收窄，全部 activeProviders 并入（`:460-462`）。锚定用例「t450 f001」（`provider-usage.test.ts:513-528`）仍绿，断言 `toEqual(["claude","kimi"])` 未被弱化。
- t450_code_f002（minor）：**仍消除**。`snapshot_items_of`（`provider-usage.ts:206-208`）仍为 items 提取唯一入口，`:225` 与 `:450` 复用；守卫差异为有注释的有意语义差异，无回归。
- t450_code_f003（important）：**仍消除**。`:451` 的 `items.length > 0` 限定保持：ready 空 items 落 `:460` 保留分支、全量可见。锚定用例「t450 f003」（`provider-usage.test.ts:530-544`）断言 `toEqual(["claude","kimi"])` 原样保留。
- t450_code_f004（minor）：**本轮已修复**。注释（`provider-usage.ts:443-448`）重写为如实表述：「ready 空 items、failed/loading（含带 lastSuccess items）都无当前真相，保留全部 activeProviders：失败态供 banner 锚定、loading 与空 items 态维持卡片/入口不整体消失（空 provider 卡短暂闪跳为 spec 已批准的 loading 语义）」——原「防跳动」表述已删除，明确空 provider 卡闪跳为 spec 批准语义，与 `:449-462` 实际控制流一致，不再误导后续维护。本轮行为代码与测试零改动（仅注释措辞），与上轮 f001/f002/f003 复核基线一致。

### Findings（Round 4）

本轮新发现：无。

### 结论（Round 4）

- 前轮 finding 复核：t450_code_f001 仍消除；t450_code_f002 仍消除；t450_code_f003 仍消除；t450_code_f004 本轮已修复（以 diff/代码核实，非采信处置表）。
- 本轮新发现：0 条。
- 未进表的提示：
  - 文件过大：`src/renderer/lib/provider-usage.ts` 672 行、`tests/unit/renderer/provider-usage.test.ts` 1359 行、`tests/unit/renderer/views/popup_view_config.test.tsx` 767 行与上轮一致（本轮零代码改动），不进 finding 表。
  - 圈复杂度：无新增分支（仅注释改动）。
  - 范围外观察：无。
- 总体判断：上轮 3 条已消除 finding（f001/f002/f003）保持、本轮仅 f004 注释措辞修复且表述准确；无未解决 critical/important，亦无遗留 minor，本轮 PASS。
- AC 复验方式：
  - AC-001：`re_verified`——「t450 AC-001」（`provider-usage.test.ts:467-482`）gateway ready items=[claude]、active=[claude,kimi]，断言 `toEqual(["claude"])` 且不含 kimi；与 `:451-458` 收窄逻辑一致。
  - AC-002：`re_verified`——「t450 AC-002」（`:484-499`）ready items=[kimi] 断言 `toEqual(["kimi"])` 不含 claude。
  - AC-003：`re_verified`——「t450 AC-003」（`:501-511`，failed 无 items）与「t450 f001」（`:513-528`，failed 携带 stale lastSuccess items）共同锚定失败态全保留（真实 CPA 失败路径）；「t450 f003」（`:530-544`）锚定 ready 空 items 保留分支。
  - 复验命令：`npx vitest run tests/unit/renderer`（121 files / 1350 tests passed，其中 provider-usage 62、popup_view_config 14）；`npx tsc --noEmit` 0 error。
  - coverage = 3 / 3
- 系统性 follow-up：无既有 tid；无独立 follow-up 建议。

reviewed_scope: eea23940edd8f0df

verdict: PASS
