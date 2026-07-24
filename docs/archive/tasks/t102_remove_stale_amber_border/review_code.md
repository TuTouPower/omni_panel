# Task review t102（reviewer_focus: 代码）

- task：`t102_remove_stale_amber_border`
- spec：`docs\tasks\t102_remove_stale_amber_border/spec.md`
- diff_anchor：`53862bb9e5e8a3327dc649aaa4d745f27d33fd78`
- target：`git diff 53862bb9e5e8a3327dc649aaa4d745f27d33fd78`
- round：1
- reviewed_at：2026-07-24 22:03 UTC+8

## Findings

### t102_code_f001 - 清理失效的 stale class

- 严重度：minor
- 位置：`src/renderer/components/ProviderCard.tsx:117`；`src/renderer/components/ProviderAccountRow.tsx:126`
- 问题：删除全局唯一的 `.card.stale` 规则后，这两处仍为 `CollapsibleCard` 根 `.card` 拼接 `stale` class；`globals.css` 已无能消费该 class 的规则。尤其 account 级 class 经 `CollapsibleCard.tsx:32-35` 同样落到 `.card.stale`，未落实 spec 要求的同步清理。
- 建议：从两个 `card_class` 表达式移除 `stale` 后缀，保留 `group.stale` / `account.stale` 用于现有「已过期」徽章和错误展示逻辑。

## 结论

- 本轮新发现：1 条。
- 总体判断：视觉规则已移除，但遗留两个无消费者的 stale class，且 account 级同步清理未完成。

verdict: FAIL

## Round 2 (2026-07-24 14:14 UTC+8)

### t102_code_f002 - task 状态索引格式不通过质量门

- 严重度：minor
- 位置：`docs/tasks_index.json:1`
- 问题：本 task 更新后文件改为 CRLF 且使用 2 空格缩进；仓库索引版本为 LF，`.prettierrc` 要求 4 空格。`git diff --check 53862bb9e5e8a3327dc649aaa4d745f27d33fd78` 对第 1–20 行报 trailing whitespace，`pnpm exec prettier --check docs/tasks_index.json` 退出码为 1，导致本 task 无法通过 `pnpm check` 格式质量门。
- 建议：调整 `scripts/task.py` 的索引序列化，使其输出仓库约定的 LF 和 4 空格格式，再通过该脚本重写索引；不要手工修改 JSON。

## 结论

- 前轮 finding 复核：`t102_code_f001` 已修；`ProviderCard.tsx:114` 与 `ProviderAccountRow.tsx:123` 均不再拼接 `stale` class，现有 stale 徽章和错误文字逻辑保持。
- 本轮新发现：1 条。
- 总体判断：黄色 stale 边框及无消费者 class 均已清理，但 task 状态索引格式未通过项目质量门。

verdict: FAIL

## Round 3 (2026-07-24 14:24 UTC+8)

## 结论

- 前轮 finding 复核：`t102_code_f001` 已修；`ProviderCard.tsx:114` 与 `ProviderAccountRow.tsx:123` 均不再向 `CollapsibleCard` 根节点拼接 `stale` class，`stale-badge` 和 `.card-state.err` 仍保留。`t102_code_f002` 未修；`docs/tasks_index.json:1–20` 仍为 CRLF/2 空格格式，`git diff --check 53862bb9e5e8a3327dc649aaa4d745f27d33fd78` 对全部 20 行报 trailing whitespace，Prettier 检查仍失败。
- 本轮新发现：0 条。
- 总体判断：黄色 stale 边框及无消费者 class 已清理，相关回归测试通过；但未解决的索引格式质量门问题仍使本轮不通过。

verdict: FAIL
