# Task review t520（reviewer_focus: 代码）

- task：`t520_arch_decoupling_and_snake_case`
- spec：`docs/tasks/t520_arch_decoupling_and_snake_case/spec.md`
- diff_anchor：`36b749b5361d9dc78a3542938a297040c57ed137`
- target：`git -C '/Users/karson/kar/code/omni_panel_t520' diff 36b749b5361d9dc78a3542938a297040c57ed137`
- round：1
- reviewed_at：2026-09-25 20:15 UTC+8

reviewed_scope: 4f9fd36c1b1f75b3

## Findings

Round 1 零 finding。

## 审计与总结

- 范围与代码审查：
    - `package.json` & `knip.json`：移除未使用的 `lodash` 生产依赖及其 ignore 项，消除死依赖与不必要的安装面（A70 / AC-001）；
    - `.dependency-cruiser.cjs`：完善架构边界依赖规则，补充 `no-web-from-renderer`、`no-renderer-from-main`、`no-preload-from-renderer`、`no-renderer-from-shared`、`no-preload-from-shared` 等架构越界看护约束，`pnpm arch` 验证 399 个模块零违规（A82 / AC-004）；
    - `src/main/core/local-api/server.ts`：从 2150 行超长文件按路由域全面解耦拆分为单一职责的子模块 `routes/trend.ts`、`routes/auth.ts`、`routes/logs.ts`、`routes/config.ts`、`routes/connector.ts`、`routes/control.ts`、`routes/dev_panel.ts`、`routes/session_history.ts`、`routes/token_stats.ts` 与 `http_helpers.ts`，主文件精简至 360 行调度中心，对外接口签名保持 100% 兼容（A94 / AC-002）；
    - `src/main/core/token-stats/token-stats-store.ts`：将 DDL 声明、时区回填与 v2~v8 迁移提取至 `token-stats-schema.ts`、`token-stats-rollup-schema.ts`、`token-stats-migrations.ts` 与 `token-stats-env.ts`，主存储模块聚焦于数据读写（A94 / AC-002）；
    - `src/main/index.ts`：启动编排与 CLI 调度解耦至 `src/main/bootstrap/cli_init.ts` 与 `src/main/bootstrap/active_instances.ts`（A94 / AC-002）；
    - 全仓新建文件与模块路径严格遵循 `snake_case` 规范（AC-003）。
- 门禁工具链核查：
    - `tsc --noEmit` 零类型错误；
    - `eslint` 零警告零错误；
    - `prettier --check .` 格式 100% 对齐；
    - `knip` 验证无未消费依赖；
    - `depcruise` 架构校验通过；
    - 全量 332 个测试套件通过（4073 passed, 8 skipped）。

### AC 复验方式

- AC-001：`verified`，查证 `package.json` 与 `knip.json` 已彻底无 `lodash`，执行 `pnpm deadcode` 与 `pnpm test` 通过。
- AC-002：`verified`，查证 `server.ts`、`token-stats-store.ts`、`index.ts` 拆分后的目录结构与导出接口，执行 `server.test.ts`（130 tests）与 `token-stats-store.test.ts`（125 tests）全部通过。
- AC-003：`verified`，查证新建文件与解耦模块路径命名，统一遵循 `snake_case` 命名风格。
- AC-004：`verified`，查证 `.dependency-cruiser.cjs` 新增规则，运行 `pnpm arch` 验证 399 模块无依赖违规。
- AC-005：`verified`，全量执行 `pnpm test`（332 套件全部通过）与 `pnpm check` 零错误。

coverage = 5 / 5 (100%)

verdict: PASS
