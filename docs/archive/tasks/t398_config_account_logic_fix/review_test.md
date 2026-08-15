# Task review t398（reviewer_focus: test）

- task：`t398_config_account_logic_fix`
- spec：`docs/tasks/t398_config_account_logic_fix/spec.md`
- diff_anchor：`e85f38318812d5f2a1e4ba420c3c03bcfb568637`
- target：`git diff e85f38318812d5f2a1e4ba420c3c03bcfb568637`
- round：3
- reviewed_at：2026-08-15 10:51 UTC+8（Round 1）/ 11:00 UTC+8（Round 2）/ 11:05 UTC+8（Round 3 复核）

## Findings（Round 1）

### t398_tst_f001 - accounts_list AC-001 测试恒真，修复前代码同样通过，未锁定「删对 override 键」

- 严重度：critical
- 锚点：AC-001
- 位置：`tests/unit/renderer/views/settings-view/accounts_list.test.tsx:87-127`（`"同 provider 同 accountId 不同 label：unhide 用行级 accountKey（非 find 首匹配）"`）
- 问题：该测试在修复前（`e85f383` 的 accounts_list.tsx:193-219，`items.find((it) => it.provider === target.provider && it.accountId === target.account_id)`）代码上**同样全绿**，无法区分新旧行为，AC-001 未被锁定。逐段推导：
  1. fixture 双 item（Label A / Label B）同 provider=claude、同 accountId=acc-1。CpaCard `unique_accounts` 按 `${provider}:${account_id}` 去重（CpaCard.tsx:75-84，修复前后均存在），只渲染首 item Label A 一行——测试自己也断言 `rows.length === 1`、`shown` 含 "Label A"，即已意识到显示行 = 首 item。
  2. 显示行即首 item，故其 `account_key = accountKey(items[0]) = "cpa-1|label|Label A"`。
  3. 修复前 on_unhide 的 `find(provider, accountId)` 命中同一个首 item Label A（`items.find` 顺序遍历返回首个匹配），restore 键同为 `"cpa-1|label|Label A"`。
  4. 于是 `toHaveBeenCalledWith("claude","cpa-1|label|Label A","hidden")` 与 `not.toHaveBeenCalledWith(Label B)` 在旧代码上全部成立。「不误删 Label B」断言恒真：Label B 行从未被渲染/点击，`find` 首匹配路径也不会触达它。
  5. 根因：同一 CPA 卡内去重保证「渲染行 = find 首命中行」，二者键恒等；AC-001 描述的「点击行键 ≠ find 首命中键」的失败场景在当前 CpaCard 去重下 UI 层不可达。该测试因此对「回退成 find 首匹配」的回归无任何检出能力。
- 建议：让 fixture 产生「点击行 account_key ≠ find 首命中项键」的可区分场景，否则测试无法锁定修复。两条路径：
  - 直测 handler：渲染后直接触发 AccountsList 的 on_unhide/on_clear（或构造 target.account_key 指向 Label B 键，绕过 UI 去重），断言 `restore` 用 Label B 键而非 Label A 键——修复前 find(provider,accountId) 会取 Label A 键，可区分。
  - 或承认去重使行为 UI 不可区分，在 spec/测试注释中明示，并保留 cpa_card 侧「回调携带 account_key」的契约断言（该部分被 t398 的 cpa_card.test.tsx 改动锁定，见下），同时给出锁定 find-by-key 的直接测试。
- 注：cpa_card.test.tsx 的新增断言（`expect(on_hide/on_unhide).toHaveBeenCalledWith({..., account_key: ...})`，cpa_card.test.tsx:109-131 等）在修复前代码上会 FAIL（旧回调无 account_key 字段），确属有效回归锁定；f001 仅针对 accounts_list 侧「删对键」行为未锁定。

### t398_tst_f002 - AC-001 仅测 unhide，未测 clear

- 严重度：minor
- 锚点：AC-001（契约区范围明示「on_hide/on_unhide/on_clear」）
- 位置：`tests/unit/renderer/views/settings-view/accounts_list.test.tsx:87-127`
- 问题：AC-001 措辞覆盖 unhide 与 clear；测试只点击了 unhide。on_clear 与 on_unhide 处理逻辑完全相同（均 `find(accountKey===target.account_key)` 后 `restore_override_account`，accounts_list.tsx:201-219），故覆盖度可接受，但 clear 路径未被可观察断言触达。
- 建议：如补 f001 的直测，顺带把 on_clear 同一断言走一遍即可，不需单独重写。

### t398_tst_f003 - config-schema 未实现测试策略声明的「往返持久化」

- 严重度：minor
- 锚点：AC-002（spec 测试策略「cacheMaxMb=0 schema 通过 + 往返持久化」）
- 位置：`tests/unit/config/config-schema.test.ts:211-238`
- 问题：新增用例仅验证 `appConfigurationSchema.parse({... cacheMaxMb: 0})` 通过、边界 1/10000/-1/10001/0.5 拒绝——schema 层正确且非恒真（修复前 min(1) 对 0 会抛错，用例必挂，锁定有效）。但测试策略声明的「往返持久化」未实现。load 路径即 `appConfigurationSchema.safeParse`（config-store.ts:133），JSON 序列化/反序列化不引入额外拒绝 0 的逻辑，故 schema 接受 ≈ 持久化可用，缺失不影响 AC-002 可验证性，仅与 spec 测试策略不完全对齐。
- 建议：非阻塞。如需对齐，加一条 `JSON.parse(JSON.stringify(configWith0))` 再过 schema 的往返用例；否则可接受现状。

## Round 2 复核（2026-08-15 11:00 UTC+8）

复核范围：`tests/unit/renderer/views/settings-view/accounts_list.test.tsx` 重写（127→126 行，`git diff --stat` 确认仅此测试文件变更）；生产代码与其余测试未动。实测：accounts_list 1 + cpa_card 14 全绿。

### f001 复核：恒真已消除，但 AC-001 核心（accounts_list find-by-key）仍无回归锁

- 原 critical 的两半：(a) 恒真断言「不误删 Label B」——已删除，改为 `expect(restore).toHaveBeenCalledWith("claude", "cpa-1|label|Label A", "hidden")`（accounts_list.test.tsx:119-126）；(b) 测试无法区分修复前代码——仍部分成立。
- (a) 已消除：新断言非恒真。若 CpaCard 回调不携带 account_key（t398 前契约），`target.account_key` 为 undefined，accounts_list `find(accountKey(it) === undefined)` 永不命中 → restore 不调用 → 断言失败。实现者实测（CpaCard on_hide 的 account_key 改 undefined → restore 不调用 → 测试失败）与代码路径推导一致。故 **CpaCard 回调携带行级 account_key 的契约被有效锁定**。
- (b) 残留：**整文件回退到修复前（old CpaCard 无 account_key + old accounts_list `find(provider, accountId)`）该测试仍全绿**。推导：old CpaCard `on_unhide({provider:"claude", account_id:"acc-1"})`；old accounts_list find 命中首 item Label A，restore 键 `accountKey(Label A)` = "cpa-1|label|Label A"，与断言参数完全一致。即「把 accounts_list 回退成 find 首匹配」的回归（AC-001 的核心行为改动，accounts_list.tsx:197/202/212）不被捕获——新断言只锁 CpaCard 侧键传递，未锁 accounts_list 侧按 account_key 精确匹配替代 find 首匹配。
- 根因不变：CpaCard `unique_accounts` 按 `${provider}:${account_id}` 去重（CpaCard.tsx:75-84），渲染行恒为首 item，其 account_key 恒等于 find 首命中键；经真实 CpaCard 的 UI 点击无法产生「点击行键 ≠ find 首命中键」的可区分输入。
- 可区分路径（锁定 AC-001 核心）：`vi.mock` CpaCard 渲染双行（绕过去重），点击 Label B 行 → 新代码 `find(accountKey === Label B 键)` → restore("claude","cpa-1|label|Label B","hidden")；旧代码 `find(provider, accountId)` 首命中 Label A → restore("claude","cpa-1|label|Label A","hidden")。二者可区分，可作修复方向。
- 严重度：critical → important（恒真已消除、CpaCard 契约已锁定；但 spec AC-001 将其描述为可观察行为且可测性声明「全部 AC 可自动测试」，其核心 find-by-key 改动仍无回归保护，回退修复即漏检）。

### f002 复核：未测 clear —— 维持 minor（未解决）

- accounts_list.test.tsx 仍只走 unhide；on_clear 与 on_unhide 逻辑同构（accounts_list.tsx:201-219），覆盖度可接受，但 clear 可观察断言仍缺。

### f003 复核：config-schema 往返持久化 —— 维持 minor（未解决）

- 与 Round 1 一致；非阻塞。

## Round 3 复核（2026-08-15 11:05 UTC+8）

复核范围：`accounts_list.test.tsx` 重写（126→183 行，`vi.mock` CpaCard 渲染双行绕过 provider:account_id 去重）；生产代码与其余测试未动。实测：accounts_list 2 + cpa_card 14 全绿。mock 生效由 `row-Label B` querySelector 非空证明——若 mock 未应用，真实 CpaCard `unique_accounts` 去重只渲染 1 行，`row-Label B` 为 null → 测试必抛。

### f001 复核：已消除（important → 关闭）

- 按 Round 2 建议的 vi.mock 路径重做。mock CpaCard 对每 row 渲染「恢复」「清除」两按钮，on_unhide/on_clear 携带行级 account_key；Label A/B 同 accountId 两行均可见可点击，可产生「点击行键 ≠ find 首命中键」的可区分输入。
- unhide 用例点击 Label B 行：当前代码 `find(accountKey(it) === "cpa-1|label|Label B")` → restore("claude","cpa-1|label|Label B","hidden")；断言 Label B 键 + not Label A。
- 非恒真确认（路径推导，与实现者实测一致）：回退 accounts_list 为 `find(provider, accountId)` 首匹配 → 点击 Label B 命中首 item Label A → restore("claude","cpa-1|label|Label A","hidden") → 断言 `toHaveBeenCalledWith(Label B)` 必挂。AC-001 核心（按 account_key 精确匹配替代 find 首匹配，accounts_list.tsx:197/202/212）现被有效锁定。
- 残留观察（不阻塞）：clear 用例点击的是 Label A 行（首匹配行）——回退 find 首匹配时旧/新行为均 restore Label A，故 clear 用例本身不独立区分 find-by-key。但 on_unhide 与 on_clear 共用同一 find 表达式（accounts_list.tsx:201-219），unhide 用例已锁该逻辑；clear 用例补 clear 按钮→restore 的可观察接线覆盖。如需 clear 独立锁定，点 Label B 行即可（可再加 case，非 blocking）。

### f002 复核：已消除

- clear 已测（accounts_list.test.tsx 第二用例）：点击 Label A 清除 → restore("claude","cpa-1|label|Label A","hidden") 且 not Label B。clear 路径可观察断言补齐。

### f003 复核：维持 minor（未解决，非阻塞）

- 与 Round 1/2 一致；schema 层锁定有效，往返持久化缺失不影响 AC-002 可验证性。

## 结论

- 本轮新发现：Round 1 计 3 条（1 critical，2 minor）；Round 2 f001 降级 critical→important；Round 3 f001/f002 已消除，f003 维持 minor（非阻塞）。无未解决 critical/important。
- 未进表的提示：
  - observation-retention 两个新增用例（observation-retention.test.ts:102-155）经逐行推导均非恒真：空窗口用例 `calls.length >= ceil((NOW-older)/DAY)=90`（新代码 91 次调用，修复前遇首 0 break 仅 2 次，必挂）；达 now 终止用例 `last+DAY >= NOW` 修复前也必挂。AC-003 被有效锁定。
  - config-schema AC-002 用例非恒真（修复前 min(1) 对 0 抛错，必挂），锁定有效。
  - 无 `.skip`、无删 expect、无 mock 被测单元；accounts_list 的 vi.mock 仅替换 CpaCard 展示层（被测单元为 AccountsList 的 find-by-key 处理逻辑，未 mock），deps（prune/count_observations）为 DI 注入 mock，均合规。
  - handoff.json `ac_evidence` 键精确覆盖 AC-001..003；`tests` 字段统计（accounts_list 2 / cpa_card 14 / config-schema 16 / observation-retention 12）与实测一致。
- 总体判断：AC-001 核心经 vi.mock 双行路径锁定（unhide 用例非恒真，回退 find 首匹配必挂），clear 接线覆盖；AC-002、AC-003 锁定有效；仅余 f003 一条 minor（非阻塞）。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: 154f7e5f56f6b86a
