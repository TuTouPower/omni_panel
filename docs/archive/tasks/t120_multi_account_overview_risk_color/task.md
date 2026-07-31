---
tid: "t120"
slug: "multi_account_overview_risk_color"
title: "多账号概览按最高风险账号着色"
status: "dropped"
branch: ""
worktree: ""
review_level: "full"
diff_anchor: "<SHA>"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: "dropped: 用户取消"
---

# Task t120_multi_account_overview_risk_color

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- backlog：只完成问题只读排查与任务拆分；未创建分支、未改产品代码或测试。
- 已确认运行数据：Kimi 周额度有四个账号，概览聚合为 203/400（51%）；其中两个账号为 83%，当前 `risk-projected` 概览缺少账号周期数据而退回按聚合当前值着色。

## Review 处置

尚未进入 review。

## 收尾报告

### 验收标准勾选

- [ ] Kimi 多账号 `weekly` 汇总 51%，包含 83% 高风险账号时，`risk-projected` 概览条按最高风险账号显示红色。
- [ ] `risk-current` 概览条按最高单账号当前用量风险着色；`nine-cycle` 输出保持不变。
- [ ] 任一账号缺失 `resetAt` 或 `cycleDurationMs` 时，其他账号仍可提供预测风险色。
- [ ] 账号均无有效周期时，概览按最高单账号当前用量风险着色。
- [ ] 多账号概览的总用量文本仍为聚合值，单账号详情不回归。
- [ ] 定向 renderer 单测、`pnpm typecheck` 与 `pnpm test` 通过。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- backlog，未执行。
