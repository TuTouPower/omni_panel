# Task review t476（reviewer_focus: 代码）

- task：`t476_session_history_query_shared`
- spec：`docs/archive/tasks/t476_session_history_query_shared/spec.md`
- diff_anchor：`f87825dd5d5baf58d7d19a886d28ebcc1c883b1e`
- target：`git diff f87825dd5d5baf58d7d19a886d28ebcc1c883b1e`
- round：1
- review_level：full

## Findings

无 finding（0 条）。

## 审查结论

- `src/main/core/query-contract.ts` 是新增的共享运行时契约，集中定义 query/recent/searchContent/summaries 的输入校验、候选枚举分页、token-stats limit/range、trend 默认值以及 dashboard `sources_status` 补全；IPC 与 LocalAPI 适配层不再各自维护同名常量和分页实现，满足 AC-008。
- 会话 query 对 `id/source/env`、正整数 limit 和有限 cursor 做同一归一化；recent 的显式 limit 使用 [1, 10000]；searchContent 的现代/legacy 请求和 summaries loc 容器均在进入定位、枚举或 service 前校验，畸形 loc 按逐条跳过策略保留有效项，符合 AC-001/002/004/009。
- token-stats sessions/records 的显式 limit、范围/offset/directories 和 trend 必填参数统一走共享验证；IPC 与 LocalAPI dashboard 都从 `TokenStatsStore.sources_status()` 取得并保证公开 DTO 含数组，空报告为 `[]`，符合 AC-005/006/007。
- LocalAPI 新增 `/v1/sessionHistory/query` 别名与 `/v1/sessionHistory/recent`，未改 Web bridge 范围；`SessionQueryFilters` 的 `title` 类型补齐了既有 store 能力的共享类型缺口。
- 变更未引入外部输入拼接、文件写入或 schema/表结构迁移；搜索枚举仍受 100 页大小和 100000 总量上限约束。依赖巡检通过，无新增架构违规。

## 验证

- 定向 Vitest：4 files / 73 tests passed。
- ESLint、Prettier、Knip、dependency-cruiser 均通过。
- `pnpm exec tsc --noEmit` 的唯一报错是环境缺失 `src/main/generated/build-info`；生产构建在 Electron SQLite binding 编译验证后被 `tsx` IPC 管道的沙箱 `EPERM` 阻塞；LocalAPI 集成 setup 仍受 Node `better-sqlite3` native binding 缺失影响，未观察到本次 diff 的业务断言失败。

## 结论

代码审查 PASS，无 critical/important/minor finding。

reviewed_scope: a486db99a86ade0c

verdict: PASS
