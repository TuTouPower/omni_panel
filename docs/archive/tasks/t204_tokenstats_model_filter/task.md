---
tid: "t204"
slug: "tokenstats_model_filter"
title: "代理面板顶部加模型筛选"
status: "done"
branch: "t204_tokenstats_model_filter"
worktree: ""
review_level: "full"
diff_anchor: "571768ca14548038e8e294dc010318ab8a61d799"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### Step 1 前置

- 环境：worktree 装依赖 + node ABI；gen-build-info 产物（gitignore）需 `mkdir -p src/generated` 后重新生成。
- SPIKE s013 用本机真实 token-stats 库（530k records）7d 窗口验证两个契约：
    1. distinct model 列表：records 全窗口 = 物化 union 窗口 = 19，实现从 window_rows 查 `SELECT DISTINCT model ORDER BY model`。
    2. model 过滤加在 union 两侧（rollup 整小时段 + records 边缘段）后 calls/sessions/tokens 与 records 全窗口过滤逐项相等（gpt-5.6-sol：12850/43/1261048396）。
       结论写入 d013 与 spec 上下文区，preflight --require-verified PASS。
- 注意：实验初版 WITH CTE + 全列 SELECT 出现过 sess=1 误结果，复现 store 子查询结构后一致——验证以 store 结构为准。

### Step 2/3 红绿

- 后端：dashboard/sessions query schema 加可选 `model`（max 200）；DTO 加 `models`（distinct 列表，max 500）；heatmap/hour/rollup filters 加 `model`。store 的 `build_dashboard_conditions`/`dashboard_window_union_builder`（两侧 `AND model=@model`）/records 源/session_meta 均按 model 过滤；query_dashboard 从 window_rows 取 models。local-api /v1/dashboard、/v1/dashboard/sessions、/v1/heatmap、/v1/hourBuckets、/v1/rollup 透传 model（IPC 走 schema 自动透传）。
- 前端：TokenStatsView 顶部 controls 加模型下拉（select，复用 pgselect 样式），选项 = dashboard.models + 当前选中值；model 进 prefs / query key（含 serialize_key）/ session_data_identity / range_refresh_key；getDashboard / getDashboardSessions 传 model。
- 测试：store 3 条（dashboard 全区域过滤 + models 列表、sessions 过滤、heatmap/hour 过滤）、DTO/query schema 各补 model 用例、query-cache key 加 model 维度、token_stats_view 3 条 UI（下拉渲染、选择 refetch + prefs、缓存隔离）、local-api 1 条（model 透传 dispatcher）。既有测试适配 DTO 新必填 `models` 字段（ipc/local-api/shared 各 mock）。
- 全量单测 2163 passed / 1 skipped。

### Step 4 黑盒

- 全量单测 `pnpm test` 通过（2163 passed / 1 skipped）；`pnpm test:e2e:electron` 真实启动 Electron 通过（35 passed / 4 skipped，无回归）。
- 真实库语义验证见 Step 1 SPIKE s013：模型列表来源与 union 两侧过滤均以真实 530k records 库核对（gpt-5.6-sol 三指标逐项相等）。黑盒覆盖 AC1-AC5 查询层；UI 交互（下拉渲染/选择 refetch/prefs/缓存隔离）由组件单测覆盖。
- lint：修复 token_stats_view.test.tsx 2 处（JSON.parse any 访问 + no-unnecessary-condition）后 `--max-warnings=0` 干净；typecheck 通过。
- 中途 ABI 告警：better-sqlite3 原生产物在 node(127) 与 electron(146) 之间切换，`pnpm test` 后直接跑 electron e2e 会以 node ABI 产物加载报错；重跑 `node scripts/ensure_sqlite_abi.mjs electron` 后 e2e 正常。

### Step 5/6 审阅与处置

- Round 1 code FAIL（f001 critical web 漏透传 + f002 important models 坍缩）、test FAIL（f001 important union 路径零覆盖 + 3 minor）。
- 修复 f001：web 层五 getter 补 model 透传 + 3 条 web 测试。修复 f002：models 改从 records 按 agent/platform/range（不含 model）物化 window_models 临时表；AC1 物化计数 3→4 同步。
- Round 2 code PASS（两 finding 消除、无新发现）；test 仍 FAIL（f001 important 未补 union 路径覆盖）。
- 修复 test f001：baseline 参数化 queries 加 `model:"sonnet-4"` 维度（backfill 后 union 路径逐区域 toEqual）+ 独立用例 `union dual-source path filters every region by model after backfill`（calls=5/sessions=s1,s4/metric_buckets+rollup 全 sonnet-4）。
- Round 3 test PASS。三条 minor（AC4 remount/AC3 组合/端点透传）合并登记 p043。
- 全量单测 2169 passed / 1 skipped；typecheck、lint 干净。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-04 19:01 UTC+8)

| finding_id     | severity  | status | rationale                                                                          | fix_ref                                                              |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| t204_code_f001 | critical  | 已修   | web 层五 getter 补 model 透传，web 测试 3 条断言（usageboard-web.test.ts）         | src/web/usageboard-web.ts:212-283                                    |
| t204_code_f002 | important | 已修   | models 改从 records 按 agent/platform/range（不含 model）物化 window_models 临时表 | src/main/core/token-stats/token-stats-store.ts:1282-1301             |
| t204_test_f001 | important | 已修   | baseline 参数化加 model 维度 + union 路径显式过滤断言用例（backfill 后）           | tests/unit/main/core/token-stats/token-stats-store.test.ts:1778,1811 |
| t204_test_f002 | minor     | 遗留   | AC4 remount 恢复路径未覆盖；不阻断                                                 | p043                                                                 |
| t204_test_f003 | minor     | 遗留   | AC3 model+agent/platform 组合、窗口切换刷新无显式用例；不阻断                      | p043                                                                 |
| t204_test_f004 | minor     | 遗留   | local-api 其余端点与 IPC 透传、query_range_rollup 过滤无显式断言；不阻断           | p043                                                                 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1（下拉渲染 + 全窗口模型列表，store/window_models + view 单测）；AC2（model 过滤 KPI/heatmap/chart/sessions，含 union 双源路径 store 用例）；AC3（model 进 query key + build_dashboard_conditions，缓存隔离 view 单测）；AC4（prefs 持久化 view 单测，remount 路径遗留 p043）；AC5（web 五端点透传 + local-api dispatcher 透传集成测 + DTO models 字段 schema 测，端点全显式断言遗留 p043）；AC6（query-cache model 维度单测）。全量单测 2169 passed / 1 skipped，e2e 35 passed / 4 skipped，typecheck/lint 干净。

### Reviewer verdict

`full`：

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：FAIL
- Round 3 test：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 代理面板顶部加单选模型筛选，选定后整块面板（KPI/热力/柱状/会话表）按模型过滤；下拉选项取全窗口 distinct 模型，不随选中坍缩。
