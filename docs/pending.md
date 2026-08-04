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

### p026 TokenStats 查询缓存键包含展示维度

- 来源：t190_code_f003
- 内容：`metric`、`xaxis`、部分 `gran` 只影响 renderer 派生展示，却进入底层查询缓存 key，导致相同数据依赖重复 IPC 查询并占用 LRU 条目
- 处理：未开

### p027 t191 dashboard 单请求对同一窗口重复执行多次聚合

- 来源：t191_code_f004
- 内容：`query_dashboard` 对同一 `[start,end)` 窗口串行执行 current/previous rollup、time chart、session count、session page、heatmap 共 5–6 次全窗口聚合；better-sqlite3 同步执行期间 IPC/local API 请求排队
- 处理：未开

### p028 t191 dashboard rollup/session 相关子查询按分组重复 lookup

- 来源：t191_code_f005
- 内容：rollup 每个 `(source,env,model,directory,session_id)` 分组执行一次窗口内最新 title 子查询；session page 又对每个 session 各执行 title、directory 两个子查询。N 个 session 接近 2N+ 次索引 seek
- 处理：未开

### p029 t191 会话翻页重算整个 dashboard

- 来源：t191_code_f006
- 内容：renderer query key 含 `session_offset`，翻页 cache miss 后重新请求完整 dashboard（summary/chart/heatmap 一并重算），连续翻页将同窗口全量聚合重复执行
- 处理：未开

### p030 t191 `freshness.stale` 恒为 false

- 来源：t191_code_f007
- 内容：`query_dashboard` 返回 `freshness: { queried_at, stale: false }` 硬编码，不反映真实数据新鲜度；renderer 当前未消费 stale
- 处理：未开

### p031 query_dashboard records 与聚合路径双轨重复（2026-08-03）

- 来源：t192_code_f002（t192 Round 1，minor）
- 内容：`query_dashboard` 四段查询区域（read_rollup、time bucket、session 列表、heatmap）各维护 records 与 rollup 两份实现，语义等价但写法不同（`SUM(calls)` vs `COUNT(*)`、rollup 路径 GROUP BY 含 agent、started_at/ended_at 由子查询提供）。当前经 oracle 测试逐区相等无分叉，但长期修复遗漏源：任一区域修正须同步两份；read_rollup 聚合路径 GROUP BY 多含 `agent` 列，若未来 session 跨多 agent 则两路径产出不同行数。
- 处理：未开

### p032 AC2「未受影响聚合保持不变」无多 session 增量直测（2026-08-03）

- 来源：t192_test_f001（t192 Round 1，minor）
- 内容：增量测试全部单 session，dashboard fallback 对比在 upsert 后立即 backfill 掩盖增量期状态；若 `delete_hour_rollup_session_stmt` 丢失 session_id 谓词导致清空其它 session 行，现有测试仍绿。建议补「两 session 入库 → 增量 upsert 仅触碰其一 → 不 backfill 直接 read_rollup == oracle_rollup」。
- 处理：未开

### p033 AC3 失败/回滚批次不推进版本无测试（2026-08-03）

- 来源：t192_test_f002（t192 Round 1，minor）
- 内容：版本递增与 records 写入、rollup 重建同处一事务，抛错理应整体回滚，但无失败注入用例（仅空批次不推进）。建议构造类型非法 record 断言抛错后 `get_data_version()` 与 `query_records` 行数均不变。
- 处理：未开

### p034 AC4 竞态子句（更新事件 vs 进行中查询）无专门测试（2026-08-03）

- 来源：t192_test_f003（t192 Round 1，minor）
- 内容：事件触发 `loadData` 后旧查询晚到被 request_id guard 丢弃的竞态只在 filter 变更路径验证，未在事件触发路径验证。建议补「查询 in-flight 时触发更新版本事件 → 旧响应晚到不覆盖新数据」。
- 处理：未开

### p035 AC3「更新事件报告同一已提交版本」的 main→preload 转发粘合层无测试（2026-08-03）

- 来源：t192_test_f004（t192 Round 1，minor）
- 内容：主进程 on_update 发送 `get_data_version()`、preload onUpdated 解析 number，但版本在 main→preload 转发中丢失/错位无用例捕获。建议在 ipc/preload 层补 onUpdated 事件版本转发用例。
- 处理：未开

### p036 AC5 读取规模无直接测量，聚合路径误读全量 records 也能 PASS（2026-08-03）

- 来源：t192_test_f005（t192 Round 1，minor）
- 内容：AC5 用例断言 DTO 形状与 rollup 行数平坦，但若 `window_union` 因 bug 改为整窗读 records，输出仍一致照常 PASS。窗口恰为整点时可加 `EXPLAIN QUERY PLAN` 断言命中 `token_stats_hour_rollup` 且不 SCAN `token_stats_records`。
- 处理：未开

### p037 AC1 重启场景（ready=1 持久化 + 重启后续写）无专门测试（2026-08-03）

- 来源：t192_test_f006（t192 Round 1，minor）
- 内容：幂等测试只覆盖同进程两次 backfill；ready 标志跨 reopen 持久化、重启后 ready=1 时增量续写与 oracle 一致无用例。建议补「backfill 置 ready → close → reopen → 断言 ready 仍 true、再增量 upsert 后 read_rollup == oracle_rollup」。
- 处理：未开

### p038 electron e2e 一批账号/表单用例在 t193 基线上已失败（2026-08-03）

- 来源：t194 黑盒（全量 electron e2e）对比确认
- 内容：`auto_seed`（existing config not overwritten）、`plugin_config`×3、`secrets_persistence`×3、`settings_view`×2、`popup_window_constraints`（collapsing all cards 底部留白）、`tray_menu_actions`（quit 菜单标签）共 11 个用例在 t193 HEAD（bb31938d）同样失败（stash t194 改动后逐组复跑确认一致），非 t194 引入。共性是 settings 账号/表单渲染与 connector 加载路径，疑为 t189-t193 范围内回归或本机环境（connector 发现/auto-seed）差异。
- 处理：未开

### p039 prettier 基线漂移 2 文件致 format:check 挂（2026-08-04）

- 来源：t197 收尾自查（task-run Step 7）
- 内容：`docs/spikes/s010_popup_hide_resource/code/hide_show_spike.js` 与 `tests/e2e/fixtures/mock_server.mjs` 未过 prettier 格式，`pnpm check` 的 format:check 必挂。两者均非 t197 改动文件（`git diff 3b2804f6` 无此二文件），为既有漂移，影响后续每个 task 的 `{test_cmd}` 门禁。
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
