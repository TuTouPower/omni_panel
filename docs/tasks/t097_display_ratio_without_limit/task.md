---
tid: t097
slug: display_ratio_without_limit
diff_anchor: "<SHA>"
branch: t097_display_ratio_without_limit
---

# Task t097_display_ratio_without_limit

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-23：用户反馈 GetOneAPI 面板刷新后一直显示 `0`。实测 API 正常返回 `balance: 4.84`，连接器测试全过。定位到 `UsageRows.tsx` 中 `limit === null` 时百分比强制为 `0`，且 `is_ratio` 判断失败，最终渲染为 `0%`。
- 排查全仓连接器，发现同类问题还存在于 tikhub（balance / free_credit）、exa（total_cost_usd / breakdown 子项）、codex（每日 token 用量）。
- mimo / deepseek 通过硬编码 `DEFAULT_LIMIT = 100` 规避了显示 `0%` 的问题，属于错误做法；本 task 一并删除这两个连接器的默认上限，统一为「用户未设置则 `limit=null`、`status=unknown`」。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| t097_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t097` 查，不在此记。

### 验收标准勾选

- [ ] `UsageBarRow` 在 `displayStyle === "ratio"` 且 `limit` 无效（null / ≤0）时显示原始数值，而非 `0%`。
- [ ] `build_overview_for_group` 不过滤「有 used 但无 limit」的 ratio 周期，或提供等效展示。
- [ ] mimo / deepseek 删除 `DEFAULT_LIMIT`；未填 LIMIT 时 `limit=null`、`status="unknown"`。
- [ ] 相关单元测试 / 连接器集成测试更新或新增用例覆盖无 limit 场景以及 mimo / deepseek 的 LIMIT 缺失行为。
- [ ] `pnpm test`、`pnpm typecheck`、`pnpm lint` 全绿。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
