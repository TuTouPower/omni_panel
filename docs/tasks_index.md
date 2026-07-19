# 任务总清单

- ID 在此分配，全局递增；取 `docs/tasks/` 与 `docs/archive/tasks/` 中最大 ID 加一，无历史时从 T001 开始。
- 状态只使用：`backlog`、`active`、`done`、`dropped`。
- `backlog` 不建目录；`active` 必须有 `TNNN_slug/` 目录。
- `done` 及曾 active 的 `dropped` 任务目录必须移入 `docs/archive/tasks/`。
- owner 和 branch 表示当前归属；工作分支推荐 `task_tnnn_slug`。

| ID   | 标题                                            | 状态 | owner  | branch | 备注                                    |
| ---- | ----------------------------------------------- | ---- | ------ | ------ | --------------------------------------- |
| T001 | fix preload route 分权同步 usage/setting        | done | claude | main   | route 重构漏改 preload 层;代码已先实现  |
| T002 | docs specs route 值同步代码 + 补 TokenStatsView | done | claude | main   | 依赖 T001 代码真相                      |
| T003 | route 字面量收口 + route 值回归断言             | done | claude | main   | T001/T002 遗留合并(T001_f001/T002_f003) |
