# Task review t450（reviewer_focus: 测试）

- task：`t450_gateway_empty_monitor_provider_hide`
- spec：`docs/tasks/t450_gateway_empty_monitor_provider_hide/spec.md`
- diff_anchor：`a44fdace91422e81e7532b72f002f996e7901c5d`
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t450' diff a44fdace91422e81e7532b72f002f996e7901c5d`
- round：1
- reviewed_at：2026-09-04 21:30 UTC+8

reviewed_scope: 8d2bd8ab92a8a3c2

## Findings

无。

三条 AC 均有对应单测，直接触达生产逻辑 `visible_providers_from_groups`（经 `get_visible_providers`），无 mock、无危险模式命中。逐条核验见结论段。

## 结论

- 前轮 finding 复核：Round 1 无前轮。
- 改测方向复核：无。diff 仅新增 3 个 `it` 块（`provider-usage.test.ts:467-511`），未修改任何既有测试断言，无「迁就实现」的改测。
- 本轮新发现：0 条。
- 未进表的提示（范围外观察与可选覆盖扩展）：
  - spec「范围」与「约束」提到 ready 空 items / loading / idle（无 items）走保留分支，均非 AC 条目，无独立测试。可选扩展：为 gateway ready 空 items 保留全部 activeProviders、loading / idle 快照保留分支各补一条回归 case。不阻断。
  - failed 快照携带上次成功 items（stale 保留路径）时，生产逻辑 `has_items=true` 同样走交集过滤（`provider-usage.ts:447`），该组合未被 AC 覆盖也未声明「有意不测」，建议在 task 处置表备注，可后续评估是否补测或对齐 spec。不阻断。
  - 直连（poll/session）connector 因 `connector.source === "gateway"` 门槛不受新过滤影响，但无显式回归测试锁定该不变量。可选扩展，不阻断。
- 总体判断：三条 AC（AC-001/002/003）测试齐全、断言用户可观察（可见 provider 集合直接驱动 popup 渲染，见 `use_popup_derived.ts:62-82`）、真实触达生产实现、复跑 60 tests 全绿；无恒真/弱化断言、无 skip/only、无删 expect、无 mock 被测逻辑。唯一注意点：AC-003 测试在旧实现下同样通过（属保留分支回归护栏而非新逻辑证据），但其断言与 AC 语义一致，属正当测试。clean review，PASS。
- 系统性 follow-up：无。

### AC 复验披露

- AC-001：`re_verified`。重跑 `pnpm vitest run tests/unit/renderer/provider-usage.test.ts`（60 passed）；测试 `t450 AC-001`（`:467-482`）构造 ready + items 仅含 claude、activeProviders [claude, kimi]，断言 `toEqual(["claude"])` 且 `not.toContain("kimi")`，与生产过滤分支 `provider-usage.ts:447` 语义一致；旧实现会返回 [claude, kimi]，故该测试能区分新旧行为。
- AC-002：`re_verified`。测试 `t450 AC-002`（`:484-499`）items 含 kimi，断言 `toEqual(["kimi"])` 且 `not.toContain("claude")`——同时验证有数据 provider 保留、无数据 provider 剔除。
- AC-003：`re_verified`。测试 `t450 AC-003`（`:501-511`）failed 无 items，断言 `toEqual(["claude", "kimi"])`；生产 `has_items=false` 走保留分支，断言与 AC 一致（作为保留分支回归护栏成立）。

coverage = 3 / 3

verdict: PASS

## Round 2 (2026-09-04 22:00 UTC+8)

reviewed_scope: d87ad8acc8eab714

### 本轮背景

Round 1（test）为 clean PASS（0 finding），随后实现侧响应 `t450_code_f001`（failed 携带 lastSuccess items 时按 has_items 过滤误删 monitor provider）做了三处改动：生产过滤门由 `has_items` 改为 `snapshot.status === "ready"`（`provider-usage.ts:448-457`）、新增「failed + stale items 保留全部」单测（`:513-528`）、迁移 popup 拖拽排序测试 fixture（`popup_view_config.test.tsx:679-723`，`items: []` → claude+deepseek 两条记录）。工作树未提交，HEAD 仍为 anchor `a44f`；本 round 复核的就是这轮新增。

### Findings（本轮新发现）

无。

### 复核结论（前轮 finding / 本轮新增项）

- 前轮 test finding：Round 1 无 finding，无历史 blocker 需消除复核。
- `t450 f001` failed-with-items 用例（`provider-usage.test.ts:513-528`）：非假绿，且是真回归护栏。
  - 判别力：fixture = gateway failed + items=[claude] + activeProviders=[claude,kimi]，断言 `toEqual(["claude","kimi"])`。若回退到 Round 1 的 `has_items` 过滤门（failed 也算 has_items），kimi 会被剔除、返回 `["claude"]`，断言失败——该测试能区分新旧生产逻辑。
  - 测 AC/行为：直接经 `get_visible_providers`（`build_provider_usage_groups` + `visible_providers_from_groups` 真实组合）触达生产实现，无 mock、无恒真/弱化/条件跳过断言。fixture 形态（failed + items + updatedAt）对应 f001 所述 refresh-service 失败携带 lastSuccess 的 DTO 形态，与生产 `snapshot_items_of` 的 `"items" in snapshot` 守卫语义一致。
  - 与 AC-003 分工合理：AC-003 锁「failed 无 items 保留全部」（无判别力但守 spec 范围），f001 锁「failed + stale items 保留全部」（对 ready-only 门有判别力），二者合成对 failed 两种子形态的覆盖。
- popup fixture 迁移（`popup_view_config.test.tsx:672-766`）：「saves providerOrder to config when user reorders provider tabs」测试意图是拖拽排序 → 写盘 providerOrder，与 t450 可见性语义无关。旧 fixture `items: []` 依赖「gateway ready 空 items 仍显示全部 activeProviders」的旧可见性语义（t450 已推翻），空 items 下新代码 tabs 不再渲染，测试将 findByRole 超时。迁移为 items 覆盖 claude+deepseek 使两 tab 在新语义下成立，属把失效场景修正为新语义下的等价前置条件，**不是**把断言预期改成实现输出——断言（`:759-765` 的 `providerOrder: ["deepseek","claude"]`）与意图全程未动，无弱化、无删 expect。该测试同时升级为「数据驱动 provider 在 popup 渲染层可见」的集成护栏，真实度反而提升。
- 生产逻辑抽查（`provider-usage.ts:205-208, 435-460`）：`snapshot_items_of` 提取语义与原 `build_provider_usage_groups` 一致（`"items" in snapshot` → `Array.isArray` 兜底），未改 group 侧行为；ready-only 门与 spec「failed/loading/idle 保留全部」及 AC-003 语义一致。

### 复跑验证

- `npx vitest run tests/unit/renderer/provider-usage.test.ts tests/unit/renderer/views/popup_view_config.test.tsx`：2 files / 75 passed（provider-usage 61，含新增 f001；popup_view_config 14）。
- `npx vitest run tests/unit/renderer`：121 files / 1349 passed。

## 结论

- 前轮 finding 复核：Round 1 无 test finding；本轮新增的 f001 用例与 popup fixture 迁移经 diff/代码/复跑核验均妥当、无假绿。
- 改测方向复核：唯一改动的既有测试（popup 拖拽排序）只迁移 fixture 前置条件、断言与意图未变，非「迁就实现」；provider-usage.test.ts 仅新增 it 块，无就地改预期。
- 本轮新发现：0 条。
- 未进表的提示（范围外观察与可选覆盖扩展）：
  - ready 空 items 的隐藏分支与 loading / idle（无 items）保留分支仍无直接单测（非 AC 条目，Round 1 已提示；当前生产 ready-only 门使「loading 保留上次可见集」注释新增，可选补 loading 回归 case）。不阻断。
  - f001 与 AC-003 可合并为一参数化用例，纯结构偏好。不阻断。
- 总体判断：Round 1 后新增的 failed-with-items 用例是真判别回归护栏，popup fixture 迁移保持测试原意且断言未弱化；复跑 1349 renderer 用例全绿；无未解决 critical / important。
- AC 复验披露：
  - AC-001：`re_verified`。`provider-usage.test.ts:467-482` ready + items=[claude]、activeProviders=[claude,kimi] → `toEqual(["claude"])` 且不含 kimi；与 `provider-usage.ts:452-455` ready-only 过滤一致；旧实现返回 [claude,kimi]，可判别。复跑绿。
  - AC-002：`re_verified`。`:484-499` items=[kimi] → `toEqual(["kimi"])` 且不含 claude；有数据 provider 保留、空 provider 剔除双断言。复跑绿。
  - AC-003：`re_verified`。`:501-511` failed 无 items → `toEqual(["claude","kimi"])`；配套 `:513-528` f001 覆盖 failed+stale items 形态并判别 ready-only 门。复跑绿。
  - coverage = 3 / 3
- 系统性 follow-up：无。

verdict: PASS

## Round 3 (2026-09-04 21:45 UTC+8)
reviewed_scope: 8deafcc4c425d006

### 本轮背景

Round 2 后实现侧响应 code review f003（ready-only 门把 spec「ready 空 items 走保留分支」翻转成剔除全部）做两处改动：过滤门由 `snapshot.status === "ready"` 收窄为 `is_ready && items.length > 0`（`provider-usage.ts:451`），新增「t450 f003: CPA ready snapshot with empty items keeps all monitor providers」单测（`provider-usage.test.ts:530-544`）。popup fixture 迁移（Round 2 已审）本轮未再动。本 round 复核该收窄判据下的测试是否假绿/弱断言、判别力是否保持。

### Findings（本轮新发现）

无。

### 复核结论（前轮 finding / 本轮新增项）

- 前轮 test finding：Round 1 / Round 2 均无 test finding，无历史 blocker 需消除复核。
- f003 用例（`provider-usage.test.ts:530-544`）：非假绿，是 f003 code 修复的真实判别回归护栏。
  - 判别力：fixture = gateway ready + updatedAt + items=[] + activeProviders=[claude,kimi]，断言 `toEqual(["claude","kimi"])`。对 Round 2 的 ready-only 门（empty present 集下两 provider 均被 continue、返回 `[]`）该断言失败；对收窄后 `ready && items.length>0` 门（空 items 落保留分支）通过——能区分旧回归态与新修复。与 code 修复建议（code review f003 建议的 `has_items` 限定）一致。
  - 断言强度：`toEqual` 精确列表，无恒真/弱化/条件跳过；经 `get_visible_providers` 真实组合 `build_provider_usage_groups` + `visible_providers_from_groups` 触达生产实现，无 mock。ready + items=[] 形态为 `ConnectorSnapshotDTO` 类型合法值（`ipc.ts:194-195` 允许空数组），与 spec「依赖与约束」声明边界一致。
- 收窄判据下既有用例语义复核：AC-001/002（ready + 非空 items → 交集过滤）、AC-003（failed 无 items → 保留）、f001（failed + stale items → 保留，`is_ready=false` 落保留分支）在 `ready && has_items` 门下断言仍与生产控制流一致，复跑全绿。最终门的决策矩阵被 5 条用例完整钉死：ready+items→过滤（AC-001/002 判别，回退无过滤即红）、ready+空 items→保留（f003 判别 Round2 回归）、failed 有/无 items→保留（AC-003/f001 判别 Round1 has_items 门）。任一历史缺陷变体均至少一条用例转红。
- 生产逻辑抽查（`provider-usage.ts:449-462`）：`is_ready` 与 `items.length > 0` 双条件进入过滤分支，空 items / 非 ready（含 failed+stale items）均落 `:460-462` 保留循环，与 spec 范围「ready 且 items 非空才交集收窄」逐字对齐；`snapshot_items_of` helper 复用，无守卫漂移新增。
- popup fixture（`popup_view_config.test.tsx:672-766`）：Round 2 已审的迁移在本轮收窄门下语义仍成立（ready + 非空 items 覆盖 claude+deepseek → 两 tab 渲染 → 拖拽写 providerOrder），断言 `:759-765` 未动，复跑绿。

### 复跑验证

- `npx vitest run tests/unit/renderer/provider-usage.test.ts tests/unit/renderer/views/popup_view_config.test.tsx`：2 files / 76 passed（provider-usage 62 含新增 f003；popup_view_config 14）。
- `npx vitest run tests/unit/renderer`：121 files / 1350 passed（Round 2 为 1349，净增 f003 一条）。

## 结论（Round 3）

- 前轮 finding 复核：Round 1 / Round 2 无 test finding；code f003 引发的 ready+空 items 边界现由 f003 用例 + `ready && has_items` 门共同锚定，判别力经代码流与断言核验成立，无假绿。
- 改测方向复核：无。Round 3 测试侧仅新增 f003 一个 `it` 块，未改任何既有断言；popup fixture 迁移为 Round 2 前置条件修正，断言与意图全程未动，非「迁就实现」。
- 本轮新发现：0 条。
- 未进表的提示（范围外观察与可选覆盖扩展）：
  - 「items 中出现、但不在 activeProviders 的 provider 仍不可见」方向（交集第二半边）无独立用例——AC-001/002 及既有 `:446` 用例的 items 均 ⊆ activeProviders，无法区分「active∩items」与「仅 items」实现。当前生产为正确交集（`:451-458` 遍历 activeProviders），属可选补强，不阻断。
  - ready 空 items 保留分支（f003）与 loading / idle（无 items）保留分支仍无 loading 态直接回归 case（非 AC 条目，Round 1/2 已提示）。不阻断。
  - AC-001 测试夹具用 claude 代 codex/antigravity（p217 场景具体 provider 名），语义等价（active 的 monitor provider 无 item → 剔除），AC 覆盖成立。
- 总体判断：Round 3 收窄判据与 f003 用例一一对应，新用例对 Round-2 回归态有真实判别力，全部 1350 renderer 用例绿；无未解决 critical / important。
- AC 复验披露：
  - AC-001：`re_verified`。`provider-usage.test.ts:467-482` ready + items=[claude]、active=[claude,kimi] → `toEqual(["claude"])` 不含 kimi，与 `provider-usage.ts:451-458` 交集过滤一致；回退无过滤门即红（返回 [claude,kimi]）。复跑绿。
  - AC-002：`re_verified`。`:484-499` ready + items=[kimi] → `toEqual(["kimi"])` 不含 claude，验证有数据 provider 保留。复跑绿。
  - AC-003：`re_verified`。`:501-511` failed 无 items → `toEqual(["claude","kimi"])`；`:513-528` f001 补 failed+stale items 形态并判别 has_items 门回归。复跑绿。
  - coverage = 3 / 3
- 系统性 follow-up：无。

verdict: PASS

## Round 4 (2026-09-04 21:45 UTC+8)

reviewed_scope: eea23940edd8f0df

### 本轮背景

Round 3 后实现侧仅响应 code review f004（minor 注释措辞）做了一处改动：把 `visible_providers_from_groups` 过滤分支上的注释由「loading 保留上次可见集防跳动」改写为如实表述（`src/renderer/lib/provider-usage.ts:443-448`）。生产逻辑门 `:451`（`source==="gateway" && is_ready && items.length>0`）未动；测试文件无任何改动。本 round 复核该注释改动是否影响测试有效性，并确认无新增测试回归。

### Findings（本轮新发现）

无。

### 复核结论（前轮 finding / 本轮改动）

- 前轮 test finding：Round 1 / Round 2 / Round 3 均无 test finding，无历史 blocker 需消除复核。
- f004 注释改动对测试无影响：
  - 注释现写「ready 空 items、failed/loading（含带 lastSuccess items）都无当前真相，保留全部 activeProviders：失败态供 banner 锚定、loading 与空 items 态维持卡片/入口不整体消失（空 provider 卡短暂闪跳为 spec 已批准的 loading 语义）」——与 `:451-462` 实际控制流逐句一致（loading/failed 不触发过滤、全量并入），并正确点明空 provider 卡闪跳为已批准 loading 语义，修正了原「防跳动」与行为相悖的误导。注释为纯文本，不改变控制流，5 条 t450 用例锚定的决策矩阵（ready+items→过滤、ready+空 items→保留、failed 有/无 items→保留）无任何断言受影响。
  - 测试文件相对 Round 3 审读态零改动：`provider-usage.test.ts` 新增块仍为 AC-001/002/003 + f001 + f003 五条 `it`（`provider-usage.test.ts:467-544` 区域），`popup_view_config.test.tsx` fixture 迁移（`:672-766`）断言未动。
- 生产逻辑抽查：`:443-462` 结构与 Round 3 完全一致，注释改动不触及 `snapshot_items_of` 复用、过滤门与保留循环。

### 复跑验证

- `npx vitest run tests/unit/renderer/provider-usage.test.ts tests/unit/renderer/views/popup_view_config.test.tsx`：2 files / 76 passed（provider-usage 62，popup_view_config 14）。
- `npx vitest run tests/unit/renderer`：121 files / 1350 passed。
  - 注意：首次全量出现 1 例失败（`token_stats_header.test.tsx`「AC-001: 刷新时间（刷新中）在标题栏内渲染」`toBeInTheDocument` 未找到元素），与 t450 改动无因果（该组件不触达 `provider-usage.ts`，本轮仅有注释改动）；独立重跑该文件 13/13 绿、二次全量 1350 全绿，判定为并发 flaky，不构成回归证据。

## 结论（Round 4）

- 前轮 finding 复核：Round 1-3 无 test finding；本轮 code f004 注释措辞改动经代码核验为纯文本、不触及测试锚定的控制流，无 test finding 引入。
- 改测方向复核：无。本轮测试文件零改动，无「迁就实现」的改测。
- 本轮新发现：0 条。
- 未进表的提示（范围外观察与可选覆盖扩展）：
  - `token_stats_header.test.tsx`「刷新时间（刷新中）渲染」在全量并发下偶发 flaky（独立跑稳定绿），与本 task 无关，属既有测试环境噪声；如频繁复现可另行登记，不阻断。
  - Round 1-3 已提示的 loading / idle 态直接回归 case 与「active∩items」交集第二半边独立用例仍为可选补强，本轮未变。不阻断。
- 总体判断：本轮仅注释措辞改动且表述已如实，5 条 t450 用例决策矩阵与生产控制流一致，复跑 1350 renderer 用例全绿；无未解决 critical / important。
- AC 复验披露：
  - AC-001：`re_verified`。`provider-usage.test.ts:467-482` ready + items=[claude]、active=[claude,kimi] → `toEqual(["claude"])` 不含 kimi；与 `:451-458` 交集过滤一致。复跑绿。
  - AC-002：`re_verified`。`:484-499` ready + items=[kimi] → `toEqual(["kimi"])` 不含 claude。复跑绿。
  - AC-003：`re_verified`。`:501-511` failed 无 items → `toEqual(["claude","kimi"])`；`:513-528` f001（failed+stale items）与 `:530-544` f003（ready+空 items）锚定相邻边界。复跑绿。
  - coverage = 3 / 3
- 系统性 follow-up：无。

verdict: PASS
