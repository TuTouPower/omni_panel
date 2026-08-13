# p157 账号行 find 首个匹配解析 item，重复 accountId 可能删错 override 键

- 来源：t342 遗留（2026-08-13，t342_general_f003 minor）
- 内容：`accounts_list.tsx` on_hide/on_unhide/on_clear 用 `items.find((it) => it.provider === target.provider && it.accountId === target.account_id)` 取首个匹配；若同一 gateway 快照内同 provider 同 accountId 不同 label 的多账号，点击行的 accountKey 未必等于 find 命中 item 的 key，unhide/clear 会删错键。概率低（gateway 子账号 accountId 通常唯一），且 find 模式为 pre-existing。改进方向：CpaCard 回调直接携带行级 accountKey，或 find 时按 (provider, accountId, account_label) 三重匹配。
- 处理：未开
