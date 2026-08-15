# Task review t398（reviewer_focus: code）

- task：`t398_config_account_logic_fix`
- spec：`docs/tasks/t398_config_account_logic_fix/spec.md`
- diff_anchor：`e85f38318812d5f2a1e4ba420c3c03bcfb568637`
- target：`git diff e85f38318812d5f2a1e4ba420c3c03bcfb568637`
- round：1
- reviewed_at：2026-08-15 22:40 UTC+8

## Findings

### t398_cod_f001 - CpaCard 去重使 AC-001「对比修复前删错键」在当前构建不可复现（修复本身正确）

- 严重度：minor
- 锚点：AC-001（行为差异声明对比修复前）；非阻塞
- 位置：`src/renderer/components/CpaCard.tsx:75-84`（`unique_accounts` useMemo，pre-existing 非本次改动）、`src/renderer/views/settings-view/sections/accounts_list.tsx:197/202/212`
- 问题：CpaCard 在渲染前按 `${row.provider}:${row.account_id}` 去重（`git show e85f3831:...CpaCard.tsx` 确认 pre-existing），只保留首行。AC-001 场景「同 provider 同 accountId 不同 label」的两行因此在 UI 永远只渲染一行（首行），而新匹配 `items.find((it) => accountKey(it) === target.account_key)` 中 `target.account_key` 正是该首行的 `accountKey(item)`；修复前的 `find(provider, account_id)` 首匹配与渲染行是同一 item、键相同。即：在当前去重下，修复前/后行为一致，spec 所述「点击行 accountKey ≠ find 命中 item 的 key」不成立，AC-001 的行为差异对比无法在真实 UI 复现。行级 account_key 修复本身是正确且更健壮的防御（去重键或排序一旦变化即受保护），AC-001 字面要求「删除该行对应 accountKey 的 override」已满足；但该 AC 的证据强度依赖测试 fixture（双同 accountId 行经 CpaCard 去重后仅断言显示行删 Label A 键、不删 Label B 键），并未覆盖「两行同时可见各自删键」的真场景。
- 建议：修复代码无需改动；如需强化 AC-001 证据，可将双行场景拆到不经 CpaCard 去重的层（或 CpaCard 层 fixture 用不同 accountId 制造双可见行）单独验证各行删各自键。属证据/文档层面说明，不阻塞。

## 结论

- 本轮新发现：1 条（minor）
- 未进表的提示：
  - `account_key` 用原始 `item.accountLabel`（gateway 键 `sourceInstanceId|label|accountLabel`），而显示 `account_label` 可被 `config.accountLabels`（按 accountId 键）覆盖。rename 只改显示不改键，hide 写键（`SettingsView.tsx:191` `accountKey(item)`）与 unhide/clear 删键（`accounts_list.tsx:207/216` 同样 `accountKey(item)`）始终对称使用原始键，无写读不对称缺陷；「显示行与键不一致」仅为观感，无功能错误。
  - `items.find(...)` 按 account_key 未命中时静默 return（`accounts_list.tsx:198/203/213`），与修复前 `find` 未命中同行为，无回归。
  - ADR 018 记录基本准确；「retention 把 0 视为不限制的分支成死代码」措辞略松——`retention_params`（`observation-retention.ts:20`）的 `!cache_max_mb || <= 0` 分支经 `undefined`（可选字段未设）一直可达，死的仅是「具体值 0」这一子情形；不影响结论。
- 总体判断：三条 AC 生产实现均达成（AC-001 行级键精确匹配且 hide/restore 键语义不变；AC-002 `min(0)` 仍拒负数、0 可持久化、retention 0 分支可达且无其它消费方；AC-003 去 break 后循环以 `cutoff < now_ms` 兜底，上界 DEFAULT_RETENTION_DAYS=90 步，无无限循环），无范围外生产改动；仅 1 条 minor 证据性观察，PASS。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: 154f7e5f56f6b86a
