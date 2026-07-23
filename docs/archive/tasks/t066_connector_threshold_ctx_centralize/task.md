---
tid: t066
slug: connector_threshold_ctx_centralize
diff_anchor: "64a9ad17884e2080a92cd1aebee4cdf5f0283865"
branch: t066_connector_threshold_ctx_centralize
---

# Task t066_connector_threshold_ctx_centralize

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

### Round 1 (2026-07-24 00:45 UTC+8)

spike 性质：建共享 helper + ctx 注入机制 + 单测 + 全测试 mock 适配。连接器逐个迁移到 ctx.status（删内联）标 follow-up。

| finding_id | severity  | status | rationale                                                            | fix_ref   |
| ---------- | --------- | ------ | -------------------------------------------------------------------- | --------- |
| 连接器迁移 | important | 遗留   | 9 连接器逐个删内联改 ctx.status（工作量大，内联已统一语义+测试覆盖） | follow-up |

### Round 2

两轴均 PASS（spike 验证 + 遗留裁决）。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t066` 查，不在此记。

### 验收标准勾选

- [x] 共享阈值 helper 抽出（connector-thresholds.ts，三函数 + 边界单测）。
- [x] ConnectorContext 加 `status` 字段 + net-client 注入。
- [x] 全测试 mock 适配 status（19 文件 + \_ctx_status helper）。
- [ ] 全连接器改用 ctx.status（替代内联）：follow-up（9 连接器逐个迁移，内联已统一语义）。
- [x] pnpm typecheck + test 全绿（1591 passed）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 9 连接器逐个迁移到 ctx.status（删内联 helper）：follow-up task。当前内联已统一语义（t055 修），ctx.status 注入机制就绪。

### 结果摘要

- connector-thresholds.ts 共享 helper + ConnectorContext.status 注入 + 全 mock 适配 + 单测；连接器迁移 follow-up。
