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

### p016 t174 minor 遗留：prune 同 ts 保护过宽 + AccountUsageRow observedAt 路径无测试（2026-08-01）

- 来源：t174_code_f001 / t174_test_f001
- 内容：t174_code_f001——`observation-store.ts` 的 `prune_stmt`（:193-200）MAX 保护子查询未同步 `stale DESC` tie-breaker；stale 副本保留原 `observed_at` 后原观测与副本同时间戳，同 ts 下全部命中「保留每键最新行」保护，prune 对该键失效，同 ts 行随失败-恢复循环累积（数据不丢，latest 查询仍唯一）。t174_test_f001——`UsageRows.tsx` 的 `AccountUsageRow` 做了对称的 observedAt 优先取数改动，但 `usage_rows.test.tsx` 无用例断言该路径。
- 处理：未开

### p017 store dedupe 用例未锁行累积防护，删 `delete_stale_dup` 后测试仍绿（2026-08-01）

- 来源：t174_test_f002（review_test.md Round 2，未进处置表）
- 内容：`observation-store.test.ts` 新增用例「dedupes stale copies sharing the same observed_at」只断言查询层去重（`stale DESC` tie-breaker + ROW_NUMBER 独立保证返回 1 行），未直连断言 `delete_stale_dup_stmt` 的行数防护。推演验证：删除该删除逻辑后用例仍全绿，但连续失败会对同键同 ts 无限累积 stale 行（insert 前清理失效）。数据不丢、latest 仍唯一，属防护性覆盖缺口，非行为错误。
- 处理：未开（随 p016 一并修——同属 t174 后续行累积防护，补 `SELECT COUNT(*)` 行数断言 + prune tie-breaker 对齐）

### p018 pending.py / render_review_prompts.py 直写权威/派生文件未原子化（2026-08-01）

- 来源：t179 spec 非范围（t169 模板化重写后原子性丢失的同一根因，t179 只覆盖 task.py）
- 内容：`scripts/pending.py:328-329` 与 `scripts/render_review_prompts.py:297` 仍直接 `write_text` 写 `docs/pending.md` / `docs/archive/pending.md` / review prompt 文件，无 tmp+fsync+os.replace 原子写，中断会产生半写状态。`scripts/task.py` 的 `_atomic_write_text` 可复用。
- 处理：未开

### p019 t175 归档 spec.md 未过 prettier，pnpm check format:check 红（2026-08-01）

- 来源：t180 顺手发现（commit 242343ad 引入）
- 内容：`docs/archive/tasks/t175_connector_ctx_status_migrate/spec.md` 存在 prettier 格式问题（`pnpm check` 的 `format:check` 全仓检查报警），t180 拆分执行时首次暴露。归档文件由 `finish` 移动，格式问题随 t175 归档带入。需 prettier --write 后单独 commit（属维护，不混入 task 执行 commit）。
- 处理：未开

### p020 代理面板 24h 高密度统计被 records LIMIT 截断（2026-08-01）

- 现象：代理面板选择「24 小时」后，期望时间柱覆盖完整 24 小时；实际高密度使用时仅最近约 3 小时有柱。最小复现向 48 小时查询窗口写入 60,000 条明细，其中最近 3 小时 50,000 条；倒序查询限制 50,000 条后，24 个小时桶仅最后 3 个非空。
- 影响：24h 时间轴小时柱丢失较早时段；同一批受限明细还驱动 24h KPI、donut、项目轴和会话轴，高密度使用时这些统计也不完整。7d/30d 的 day/hour 聚合路径与热力图不受此缺陷影响。
- 根因：24h 被划为 short window，柱状图跳过已有 hour 聚合并拉取 current+previous 共 48 小时明细；records 查询按时间倒序限制 50,000 条，数据量超限时静默丢弃最早记录。分类：产品缺陷，伴随测试假绿。
- 测试缺口：现有 renderer 测试明确断言 24h 不请求 hour 聚合，且 records mock 永不模拟倒序 LIMIT 截断；store 测试只验证 limit 下推，未覆盖高密度 24h 用户行为。补测应覆盖：24h 时间轴接入完整 hour 聚合；超过 50,000 条时 KPI/donut 与项目/会话轴仍覆盖完整窗口；断言最终用户可见统计，而非锁定旧数据源选择。
- 线索：`.scratch/task_bug_24h_bar/repro.py`
- 处理：时间轴小时柱已由 t183 修复（24h preset 改走 hour 聚合）；KPI/donut 与项目/会话轴仍走受限 records，由 t184 处理。

### p023 自定义 ≤25h 范围的小时柱仍走 records，高密度时同源截断（2026-08-01）

- 来源：t183 review 结论段提示（spec 明确保守保留，未随 t183 修复）
- 内容：`TokenStatsView` 的 `hour_fetch` 条件为 `gran !== "hour" || !time_axis || (is_short_window && preset !== "24h")`——非 24h preset 的 ≤25h 自定义范围（custom range）时间轴小时柱仍走 records，高密度时受倒序 LIMIT 50000 截断，与 p020 同源。t183 只覆盖 24h preset；如需消除，让 ≤25h 自定义范围同样走 hour 聚合（hour 聚合支持任意窗口，无短窗口对称切分约束——那是 KPI/donut 的事）。
- 处理：未开

### p021 e2e gen-synthetic 重生成会抹掉手工 synthetic fixture 条目（2026-08-01）

- 来源：t181 review f001 / test_f001
- 内容：t181 为让 6 处条件 skip 用例在 synthetic 下可跑，手工给 `synthetic.json` 注入 KIMI items `error`（HTTP 401）并补 opencode_go connector（2 workspace）。`gen_synthetic.mjs`（`e2e:gen-synthetic`）不产生这两类条目，重跑生成会静默覆盖，导致 account_error_badge / opencode_go_usage 在 CI 变红。需把「KIMI failed connector 注入 item.error + 补 opencode_go connector」固化进 gen_synthetic.mjs（或加持久化合并逻辑）。
- 处理：未开

### p022 synthetic fixture trend key 用短 metricId，renderer 按完整 period.id 拉取导致 sparkline 恒空（2026-08-01）

- 来源：t181 review 未进表提示（pre-existing 系统性 fixture 不一致）
- 现象：synthetic.json 的 trend key 为 `GET /v1/trend?provider=X&accountId=Y&metricId=<短末段>`（gen_synthetic 取 `it.id.split(":").slice(-1)[0]`）；renderer 的 `trend_api.get(provider, accountId, period.id)`（ProviderAccountRow.tsx:98）传完整 `period.id`（形如 `srcInstanceId:provider:accountId:metricId`），mock_server 按完整 query 精确匹配，key 不命中 → 返回 `[]`，synthetic 下 sparkline 恒空。
- 影响：synthetic e2e 的 sparkline 相关断言退化（空序列）；real fixture 同机制疑受 metric_id 匹配影响（待 task-bug 复现确认）。
- 根因：待确认（mock_server query 精确匹配 vs renderer 传完整 id；real server query_trend_series 的 metric_id 匹配口径）。
- 测试缺口：无 synthetic 断言 sparkline 非空。
- 线索：`mock_server.mjs:49`、`ProviderAccountRow.tsx:98`、`gen_synthetic.mjs` trend 拷贝段。
- 处理：未开
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
