---
tid: "t520"
slug: "arch_decoupling_and_snake_case"
title: "架构解耦与文件命名全量规范化"
status: "done"
branch: "t520_arch_decoupling_and_snake_case"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "36b749b5361d9dc78a3542938a297040c57ed137"
depends_on: "t510,t516,t517"
conflicts_with: ""
note: "审阅采纳项: A70, A82, A94, A104, A105, A108"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

1. `package.json` & `knip.json`：移除未使用的 `lodash` 生产依赖并更新 knip 配置（A70 / AC-001）。
2. `.dependency-cruiser.cjs`：完善跨层边界规则，增加 `no-web-from-renderer`、`no-renderer-from-main`、`no-preload-from-renderer`、`no-renderer-from-shared`、`no-preload-from-shared`，`pnpm arch` 校验 399 个模块零违规（A82 / AC-004）。
3. `server.ts`：将 2150 行超长文件拆分为单一职责的子模块 `routes/trend.ts`、`routes/auth.ts`、`routes/logs.ts`、`routes/config.ts`、`routes/connector.ts`、`routes/control.ts`、`routes/dev_panel.ts`、`routes/session_history.ts`、`routes/token_stats.ts` 与 `http_helpers.ts`，主文件精简至 360 行调度中心（A94 / AC-002）。
4. `token-stats-store.ts`：将 DDL 与迁移逻辑解耦至 `token-stats-schema.ts`、`token-stats-rollup-schema.ts`、`token-stats-migrations.ts` 与 `token-stats-env.ts`（A94 / AC-002）。
5. `index.ts`：解耦启动与 CLI 入口逻辑至 `src/main/bootstrap/cli_init.ts` 与 `src/main/bootstrap/active_instances.ts`（A94 / AC-002）。
6. 全量文件与新建路径严格遵循 `snake_case` 规范（A104 / AC-003）。

## Review 处置

### Round 1 (2026-09-25 20:15 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（tsc、eslint、prettier、knip、depcruise、vitest 332 套件）全绿
- 黑盒：全部 AC 可自动测试
- review：full 级 code_verdict=PASS, test_verdict=PASS（reviewed_scope: `4f9fd36c1b1f75b3`）
- AC 证据：见 `handoff.json`

### 结果摘要

已按审阅采纳项（A70, A82, A94, A104, A105, A108）完成三大上帝文件（server.ts / token-stats-store.ts / index.ts）的模块化解耦、死依赖 lodash 清理、架构依赖边界加固以及 snake_case 命名风格规范化。全量门禁与 4073 项测试全部通过。
