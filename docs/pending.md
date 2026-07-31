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

### p010 热力图周六（或宽窗口早期 weekday）整列空白（2026-07-31 发现）

- 现象：token-stats 热力图（weekday×hour）在 >=7d 窗口下，某些 weekday 整列零数据（用户观察到周六全空）。期望：窗口内出现的每个 weekday 列按实际数据着色。
- 影响：热力图失真，低活动日（数据量小的 weekday）在宽窗口下尤易整体消失；用户误判「周六从不用」。
- 根因：`TokenStatsView` 给热力图喂的是 `records`（`token_stats_records`），后端 `query_records` 用 `ORDER BY timestamp DESC LIMIT @limit`（宽窗口 limit=100000）。7d 窗口实际 ~14 万行超 limit，按时间倒序截断后丢弃最早的几天；若窗口内某 weekday 仅出现在被截断的早期日期（如本周六 2026-07-25 在 7-26 之前），该列整体空白。t162/t164 已把 >=7d 柱图改走 `buckets`（无截断），但**热力图仍走 records + LIMIT，未一并迁移**。分类：产品缺陷（数据源选择 + LIMIT 截断未覆盖热力图路径）。
- 测试缺口：`tests/unit/renderer/lib/token-stats/chart-data.test.ts` 测了 `prepareHeatmapData` 的 weekday/hour 映射，但用小数据集，未覆盖「records 因 LIMIT 截断致某 weekday 整列缺失」；无「窗口内出现的 weekday 必须有着色」断言。后端 `token-stats-store` 的 `query_records` LIMIT 行为也缺「宽窗口截断会丢早期日期」的回归。补测方向：(1) renderer 端加用例构造跨多 weekday 的 records，断言热力图每个窗口内 weekday 有数据；(2) 集成层断言 7d 窗口 records 行数与 LIMIT 关系、或改走 buckets 后热力图正确性。
- 线索：`.scratch/probe_heatmap.mjs`（查 observations.sqlite 证实 7d 窗口 LIMIT 100000 仅覆盖 2026-07-26T06:36 之后，本周六 7-25 数据全被丢）。
- 处理：未开

## 不办

用户已显式确认暂搁的条目——「以后再说」，不是闭环。`pending-to-task` / `task-bug` 不自动捞本节；`repo-hygiene` 不迁 archive。

字段复用上方普通 / bug 模板，追加必填项：

- `- 暂搁：YYYY-MM-DD 决定不办的理由`：写清为什么现在不动（风险可控、排期靠后、等外部依赖等）。
- `- 处理` 固定写「不办」。

以下 9 条自 `docs/legacy_backlog.md`「暂不建 task（附理由）」节迁入（2026-07-31 对齐模板时迁移）。

### p001 16 个 connector 删内联 helper 改 ctx.status（2026-07-26 暂搁）

- 来源：t088/t066 遗留
- 内容：16 个 connector 删除内联 helper，统一改 `ctx.status`
- 暂搁：全部未迁移，工作量大；纯 DRY 无功能收益；ctx.status 注入机制已就绪但不阻塞；当前各 connector 内联实现语义已统一（t055 修），重复但正确。等有新 connector 需求或批量改动窗口再做
- 处理：不办

### p002 I19/I21/I22/I23 测试架构改进（2026-07-26 暂搁）

- 来源：t064 遗留
- 内容：测试架构改进（I19/I21/I22/I23）
- 暂搁：需 CI 环境配合验证；其中 I23（取消 skip）已确认无残留 skip，I19/I21/I22 属测试基建增强非缺陷修复；项目当前测试覆盖率足够支撑日常开发
- 处理：不办

### p003 migration 测试改 import 生产迁移入口（2026-07-26 暂搁）

- 来源：t069 遗留
- 内容：migration 测试改为 import 生产迁移入口
- 暂搁：需导出 observation-store 内部迁移函数，属 API 暴露面扩大；当前手写 PRAGMA+ALTER 测试覆盖核心迁移路径，风险可接受
- 处理：不办

### p004 e2e 断言真实刷新（当前死等 1000ms）（2026-07-26 暂搁）

- 来源：t070 遗留
- 内容：e2e 断言真实刷新，替换当前死等 1000ms
- 暂搁：需 e2e 运行环境改造；现有测试通过单元/集成层覆盖刷新逻辑，e2e 死等是已知妥协
- 处理：不办

### p005 setupFiles 拆 renderer-only（2026-07-26 暂搁）

- 来源：t071 遗留
- 内容：setupFiles 拆分 renderer-only 部分
- 暂搁：需 vitest.config 改 + 评估 renderer 测试对 mock 依赖；当前 mock 注入无副作用
- 处理：不办

### p006 完整 rendererIndexPath 白名单（2026-07-26 暂搁）

- 来源：t062 遗留
- 内容：完整的 rendererIndexPath 白名单
- 暂搁：需 helpers 注入 path（架构改）；当前 endsWith index.html 已拒非 HTML file://，攻击面极小
- 处理：不办

### p007 mock os.replace 失败路径测试（2026-07-26 暂搁）

- 来源：t063/t068 遗留
- 内容：mock os.replace 失败路径测试
- 暂搁：当时需 pytest 基建，项目无 Python 测试框架；当前原子写实现（tmp+fsync+os.replace）+ happy path + 中断恢复测试已覆盖核心契约。注：现已引入 `tests/repo_template/` Python 测试，复活门槛降低
- 处理：不办

### p008 taskkill 按路径（PowerShell）（2026-07-26 暂搁）

- 来源：t074 遗留
- 内容：taskkill 改为按路径（PowerShell）
- 暂搁：Windows 特定重构；当前按端口 kill 已覆盖主场景
- 处理：不办

### p009 拆 PopupView.tsx（869行）与 popup_view.test.tsx（1519行）（2026-07-26 暂搁）

- 来源：t153 f002/f003
- 内容：拆分 `PopupView.tsx`（869行）与 `popup_view.test.tsx`（1519行）
- 暂搁：均为 diff 前存量超阈（848/1421 行），t153 净增为必要守卫与验收覆盖；拆分是独立重构（参照 t044/t125/t126 先例），等下次大改面板时一并做
- 处理：不办
