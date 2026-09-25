---
tid: "t521"
slug: "schema_contract_governance"
title: "Schema 契约治理、单一来源与防漂移门禁"
status: "done"
branch: "t521_schema_contract_governance"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "172efd2eee8186dbd4ea103471ea2fd185546b4c"
depends_on: "t514"
conflicts_with: ""
note: "审阅采纳项: A77, A78, A80, A81"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

1. `scripts/export-schemas.ts`：以 Zod 定义为唯一真相源，通过 `zodToJsonSchema` 并按 Prettier 配置导出标准 JSON Schema，消除双源分叉（A77 / AC-001）。
2. `scripts/export-schemas.ts` & `package.json`：实现 `--check` 模式并在 `package.json` 中配置 `schema:check`，集成进 `pnpm check` 门禁流水线，检测手改漂移（A81 / AC-003）。
3. `refresh-service.ts`：在连接器观测入库前调用 `pluginResultSchema.safeParse` 实施契约拦截，遇到脏数据告警并拒绝入库（A78 / AC-002）。
4. `config/env/.env.example`：补全全部 20 个连接器的配置说明与环境变量占位符（A80 / AC-004）。

## Review 处置

### Round 1 (2026-09-25 20:45 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（tsc、eslint、prettier、knip、depcruise、schema:check、vitest 332 套件）全绿
- 黑盒：全部 AC 可自动测试
- review：full 级 code_verdict=PASS, test_verdict=PASS（reviewed_scope: `218b3d49c780fc49`）
- AC 证据：见 `handoff.json`

### 结果摘要

已按审阅采纳项（A77, A78, A80, A81）确立 Zod 单一 Schema 权威源、建立 `schema:check` CI 防漂移门禁、在数据流管道消费端激活 `pluginResultSchema` 安全校验、并补齐全部连接器 `.env.example` 配置指引。全量门禁与 4075 项测试全部通过。
