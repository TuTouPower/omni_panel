# Task review t342（reviewer_focus: 通用）

- task：`t342_account_overrides_hide_key`
- spec：`docs/tasks/t342_account_overrides_hide_key/spec.md`
- diff_anchor：`1ebfb619708562cd10cb61767a85a55f4ec7fc6f`
- target：`git diff 1ebfb619708562cd10cb61767a85a55f4ec7fc6f`
- round：1
- reviewed_at：2026-08-13 16:27 UTC+8

## Findings

### t342_gen_f001 - AC-003 集成测试未触达写端 hide_account，回归防线缺失

- 严重度：important
- 锚点：AC-003（端到端测试须覆盖「隐藏 → 持久化 → 主面板过滤」完整链路）+ spec 测试策略「单测：`hide_account` 写入键 == `accountKey(item)`」
- 位置：`tests/unit/renderer/provider-usage.test.ts:900-906`；实际修复点 `src/renderer/views/SettingsView.tsx:193-198` 未被测试触达
- 问题：新测试手工 `const written_key = accountKey(item)` 模拟写键，再喂给 `apply_account_overrides`。它验证的是「accountKey 形态的键能被消费端过滤」，并未调用 `hide_account`（t342 修的正是该函数写错键）。若 `SettingsView.tsx:197` 回退为 `item.accountId`，本测试仍全绿——测试防不住它要防的回归。spec 测试策略明确要求的写键单测（`hide_account` 写入键 == `accountKey(item)`）缺失。
- 建议：在 `tests/unit/renderer/views/settings_view_cpa.test.tsx`（已有 `SettingsView` 渲染 + save_config mock 基建）补组件级用例：点击隐藏行后断言 `save_config` 收到的 `accountOverrides.hidden[provider]` 含 `accountKey(item)`；或把 `hide_account` 的键派生抽成可单测纯函数后直接断言。

### t342_gen_f002 - gateway label 变化会使隐藏键孤儿化，账号静默重现

- 严重度：minor
- 锚点：行为缺陷（低概率、spec 风险区已提示 accountKey 语义）
- 位置：`src/renderer/views/SettingsView.tsx:197`、`src/renderer/views/settings-view/sections/accounts_list.tsx:148-151`
- 问题：gateway 账号键为 `${sourceInstanceId}|label|${accountLabel}`，label 入键。隐藏后若 gateway 侧子账号 label 变化，主面板过滤与 settings `is_hidden` 均不再命中旧键，账号重新出现，旧 hidden 键成孤儿；再次隐藏会累积双键。`accountKey` 文档已声明「gateway 按 label 键（gateway 可能无稳定 id）」，属设计使然；修复前写裸 accountId 从不生效，故非本次引入的回归，不阻断。
- 建议：如需长期稳定，另立 task 评估 gateway 子账号稳定 id 键或隐藏键存 label 变体集合；当前收敛读写键为同一函数即可接受。

### t342_gen_f003 - on_unhide/on_clear 按 provider+accountId 首个匹配解析 item，重复 accountId 时可能删错键

- 严重度：minor
- 锚点：行为缺陷（低概率）
- 位置：`src/renderer/views/settings-view/sections/accounts_list.tsx:201-227`
- 问题：`items.find((it) => it.provider === target.provider && it.accountId === target.account_id)` 取首个匹配；若同一 gateway 快照内同 provider 出现同 accountId 但不同 label 的多账号，点击行的 `accountKey` 未必等于 `find` 命中 item 的 key，unhide/clear 会删错键。概率低（gateway 子账号 accountId 通常唯一），且 find 模式为 pre-existing（`on_hide` 原样），t342 未扩大风险面。
- 建议：可选优化——让 CpaCard 回调直接携带行级 accountKey，或 find 时按 (provider, accountId, account_label) 三重匹配。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：3 条（1 important + 2 minor）。
- 未进表的提示：无。
- 总体判断：写键/读键/恢复键已收敛到 `accountKey`；`apply_account_overrides` 在 `apply_account_labels` 之前执行（`src/renderer/hooks/use_popup_derived.ts:56-59`），过滤用原始 label，与 settings 侧 `accountKey(item)` 口径一致，无 label 覆盖错位；`on_rename` 走 `accountLabels[provider][account_id]`（裸 accountId 键），与 hidden override（accountKey 键）互不干扰，改动正确。但 AC-003 测试未触达写端（f001, important），留待处置。
- 系统性 follow-up：无。

### AC 复验披露

- AC-001（隐藏后主面板不再显示，写键与读键一致）：`re_verified`。`SettingsView.tsx:197` 写 `accountKey(item)`；`build_provider_usage_groups` 中 `accounts.id = accountKey(period)`（`provider-usage.ts:293`），`apply_account_overrides` 按 `a.id`/`accountKey(p)` 过滤（`provider-usage.ts:346-347`），读写同键函数，键一致。
- AC-002（settings「已隐藏」判定与主面板口径一致）：`re_verified`。`accounts_list.tsx:150` `is_hidden` 用 `accountKey(item)`，与主面板过滤同键函数；面板流水线过滤先于 label 应用，无错位。
- AC-003（端到端测试覆盖完整链路）：`re_verified`（部分）。已运行 `npx vitest run tests/unit/renderer/provider-usage.test.ts tests/unit/renderer/views/settings_view_cpa.test.tsx tests/unit/renderer/views/settings_view_accounts.test.tsx tests/unit/renderer/account-overrides.test.ts`，4 文件 98 用例全绿，新用例通过并断言消费端可用 accountKey 形态键过滤；但写端 `hide_account` 未被测试触达，见 f001。
- coverage = 3 / 3

reviewed_scope: 1d495f0c103ab3a9

verdict: FAIL

## Round 2 (2026-08-13 16:37 UTC+8)

### 前轮 finding 复核（以 diff 与代码/测试为准）

- **f001（important，AC-003 写端未测）— 已消除**。新增 `tests/unit/renderer/views/settings_view_cpa.test.tsx:462-493` 用例：真实渲染 `SettingsView`，点击 CPA 子行「显示账号」Switch（`AccountRow.tsx:155-158` onChange 触发 `on_hide`）→ `AccountsList.on_hide`（`accounts_list.tsx:192-200`）→ `hide_account`（`SettingsView.tsx:193-198`）→ mock `save` 收到 `accountOverrides.hidden.claude` 含 `accountKey(item)`（`cpa-1|label|Claude Account`），并断言 `accountKey(item) !== item.accountId`。用例未 mock 被测逻辑本身——`hide_account`/`AccountsList`/`CpaCard` 全走真实实现，仅 IPC `save` 为持久化边界 mock（与同文件既有用例一致）。回退 `SettingsView.tsx:197` 写裸 `item.accountId` 时 `expect.objectContaining({accountOverrides:{hidden:{claude:[accountKey(item)]}}})` 不匹配，测试必红，回归防线成立。`snapshot_items`（`settings-view/lib.ts:112-116`）原样透出 snapshot items，无 label 变换，运行时键与测试期望键一致。实跑 `node_modules/.bin/vitest run tests/unit/renderer/views/settings_view_cpa.test.tsx`：12/12 通过；受影响 4 文件合计 99/99 通过。
- **f002（minor，on_unhide/on_clear 恢复键对称）— 已满足**。`accounts_list.tsx:201-227` `on_unhide`/`on_clear` find item 后传 `accountKey(item)`，与 `hide_account` 写键同函数，恢复/清除对称，无新增改动必要。
- **f003（minor，find 首个匹配低概率）— 已处置**。已登记 pending `docs/pending/todo/p157_account_row_find_match_key.md`，非 t342 阻断面，遗留跟踪。

### 本轮新发现

0 条。新增测试形态健全：`findByLabelText("显示账号")` 在 fixture（单 claude CPA 子行，直连行用「启用账号」标签）下唯一匹配，无 `expect(true).toBe(true)`/mock 被测逻辑/弱化断言等危险模式，断言触达 `save_config` 落库的 observable 行为。

### 结论

- 前轮 blocker（f001）已由代码/测试核实消除；f002 已满足；f003 已登记 pending。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：写键/读键/恢复键收敛 `accountKey`，AC-001/002 实现正确，AC-003 现同时覆盖消费端（provider-usage.test.ts）与写端（settings_view_cpa.test.tsx）集成链路，无未解决 critical / important。

### AC 复验披露（Round 2）

- AC-001：`re_verified`。写键 `SettingsView.tsx:197` = 读键 `provider-usage.ts:293/346-347` = 恢复键 `accounts_list.tsx:211/224`，同 `accountKey`。
- AC-002：`re_verified`。`accounts_list.tsx:150` `is_hidden` 与主面板过滤同键函数，面板先 override 后 label（`use_popup_derived.ts:56-59`），口径一致。
- AC-003：`re_verified`。写端组件测试（settings_view_cpa.test.tsx，点击 Switch 断言 save 落 accountKey）+ 消费端测试（provider-usage.test.ts 断言过滤结果为空），两条链路均实跑通过。
- coverage = 3 / 3

reviewed_scope: e87186cf2ce87c0b

verdict: PASS
