# Task review t521（reviewer_focus: 代码）

- task：`t521_schema_contract_governance`
- spec：`docs/tasks/t521_schema_contract_governance/spec.md`
- diff_anchor：`172efd2eee8186dbd4ea103471ea2fd185546b4c`
- target：`git -C '/Users/karson/kar/code/omni_panel_t521' diff 172efd2eee8186dbd4ea103471ea2fd185546b4c`
- round：1
- reviewed_at：2026-09-25 20:45 UTC+8

reviewed_scope: 218b3d49c780fc49

## Findings

Round 1 零 finding。

## 审计与总结

- 范围与代码审查：
    - `scripts/export-schemas.ts` & `package.json`：
        - `scripts/export-schemas.ts` 实现单一生成源（Zod -> JSON Schema），并读取统一 Prettier 配置输出标准格式（A77 / AC-001）；
        - 实现 `--check` 参数与 `pnpm schema:check` 门禁，将其正式编入 `pnpm check` 主门禁流水线，出现未同步手改或 schema 漂移时自动拦截退出（A81 / AC-003）；
    - `src/main/core/scheduler/refresh-service.ts`：
        - 在连接器产物消费边界调用 `pluginResultSchema.safeParse`，校验通过方可写入 `observationStore`，遇到非契约脏数据拦截并记录 `trace_log.warn`，彻底激活死契约（A78 / AC-002）；
    - `config/env/.env.example`：
        - 补齐全部 20 个连接器的配置指引说明与环境变量占位符，明确标注交互授权类与本地 CLI 类免环境变量说明（A80 / AC-004）。
- 门禁工具链核查：
    - `pnpm schema:check` 验证磁盘 JSON 架构与代码 Zod 完全一致；
    - `pnpm check`（tsc, eslint, prettier, knip, depcruise, vitest）全绿无报警。

### AC 复验方式

- AC-001：`verified`，查证 `scripts/export-schemas.ts:31-38` 生成物与 `pluginMetadataSchema` 完全对齐，测试 `plugin-metadata.test.ts:80-105` 通过。
- AC-002：`verified`，查证 `refresh-service.ts:408-422` safeParse 拦截脏数据，测试 `plugin-metadata.test.ts:110-150` 通过。
- AC-003：`verified`，查证 `scripts/export-schemas.ts:40-62` 与 `package.json:34, 36`，运行 `pnpm schema:check` 验证防漂移通过。
- AC-004：`verified`，查证 `config/env/.env.example`，测试 `plugin-metadata.test.ts:152-170` 验证包含全部 20 厂商指引。

coverage = 4 / 4 (100%)

verdict: PASS
