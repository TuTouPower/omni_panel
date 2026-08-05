# 待办与不办总账

项目里「已知、还欠着」的事只在本文件登记：未修 bug、review 遗留、技术债、该做未做的需求，以及用户已确认暂搁的事项。分两节：「待办」放未闭环、待启动条目；「不办」放用户显式确认暂搁的条目。

- 三态划分：未闭环（「待办」节，`- 处理：未开`） / 已闭环（迁 `docs/archive/pending.md`） / 暂搁（「不办」节，`- 处理：不办` + `- 暂搁`）。
- 「不办」不等于闭环：条目整条留本文件「不办」节，不迁 archive；以后决定复活时移回「待办」节（`- 处理` 改回 `未开`、删 `- 暂搁`、保留原 `pNNN`）。
- 所有条目统一使用 `pNNN`，当前主总账（含「待办」「不办」两节）与归档总账共享一条递增序列，历史编号不复用。
- 新增条目前运行 `scripts/pending.py next`；更新已有条目或迁入归档时保留原编号。

## 待办

两种字段模板，按条目性质选一种；`- 处理` 字段未闭环写「未开」，闭环写 `{tid}` 或外部动作说明。

- 普通（需求 / 遗留 / 技术债）：`- 来源` / `- 内容` / `- 处理`。`- 来源` 写清出处：finding_id、原 tid、用户提出，或技术债自查。
- bug：`- 现象` / `- 影响` / `- 根因` / `- 测试缺口` / `- 线索` / `- 处理`。bug 由 `task-bug` 登记并完成根因与补测分析。

已验证的技术发现不属于待办，写 `docs/findings.md`。

<!-- 待办节空置：p040-p051 已全部转 t216-t222，条目迁 docs/archive/pending.md「已处理待办」节（2026-08-05）。 -->

### p052 legacy rollup 路径 session 分组仍按裸 session_id（t217 审阅 minor）

- 来源：t217_code_f001
- 内容：legacy `prepareBarDataFromRollup`（chart-data.ts:822）/ `rollup_group_metric`（:985,1012）的 session 轴与去重 key 仍为 `${source}|${session_id}` 不含 env，跨 env 同 session_id 在此两处仍合并。当前 `rollup` prop 恒为 `never[]`（TokenStatsView.tsx:592）不可达，属 p040 复发陷阱。若未来恢复该 fallback 路径须一并补 env。
- 处理：未开

### p053 合并后 pnpm check 存量失败：format:check 与 knip 死类型（批次前遗留）

- 来源：t216-t222 合并后验证
- 内容：合并后 `pnpm check` 两处失败，均为批次前存量、本批次 7 个 task 未触碰：
    1. `tests/unit/renderer/views/session_history_test_utils.ts`（t210 遗留）prettier format 不通过——`npx prettier --write` 即可修。
    2. knip 报 `src/shared/types/token-stats.ts:444-451` `TokenStatsDashboardPlatform/Metric/XAxis/Granularity` 4 个未使用导出（t189 时代 dashboard 类型，非本批次新增）。
- 处理：未开

## 不办

用户已显式确认暂搁的条目——「以后再说」，不是闭环。`task-from-pending` / `task-bug` 不自动捞本节；`repo-hygiene` 不迁 archive。

字段复用上方普通 / bug 模板，追加必填项：

- `- 暂搁：YYYY-MM-DD 决定不办的理由`：写清为什么现在不动（风险可控、排期靠后、等外部依赖等）。
- `- 处理` 固定写「不办」。

以下 9 条自 `docs/legacy_backlog.md`「暂不建 task（附理由）」节迁入（2026-07-31 对齐模板时迁移）；2026-08-01 复核后 8 条复活回「待办」节，1 条保留。

### p008 taskkill 按路径（PowerShell）（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t074 遗留
- 内容：taskkill 改为按路径（PowerShell）
- 暂搁：2026-08-01 复核——t065 已把误杀范围从「所有 electron.exe」收窄为只杀 `OmniPanel.exe`（package-and-run.ts:18 按镜像名），撞名面极小；按路径实现需 PowerShell + 遍历进程路径，Windows 特定重构，边际收益低。等下次动打包脚本再一并做
- 处理：不办
