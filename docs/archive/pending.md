# 已闭环待办历史

由 `tasks-run` 收尾或 `repo-hygiene` 从 `docs/pending.md` 整条迁入。**只追加**，禁止截断、删除、改号或改写已归档条目。本文件 H3 编号仍属全局 `pNNN` 分配历史，`scripts/pending.py next` 会扫描所有本地分支 git 树 + 所有 worktree 工作区的 `docs/pending.md` 与 `docs/archive/pending.md`。

本文件只收录闭环条目；`docs/pending.md`「不办」节条目（`- 处理：不办`）属暂搁而非闭环，保留在主总账，不迁入本文件。

## 已处理待办

### p010 热力图周六（或宽窗口早期 weekday）整列空白（2026-07-31 发现）

- 现象：token-stats 热力图（weekday×hour）在 >=7d 窗口下，某些 weekday 整列零数据（用户观察到周六全空）。期望：窗口内出现的每个 weekday 列按实际数据着色。
- 影响：热力图失真，低活动日（数据量小的 weekday）在宽窗口下尤易整体消失；用户误判「周六从不用」。
- 根因：`TokenStatsView` 给热力图喂的是 `records`（`token_stats_records`），后端 `query_records` 用 `ORDER BY timestamp DESC LIMIT @limit`（宽窗口 limit=100000）。7d 窗口实际 ~14 万行超 limit，按时间倒序截断后丢弃最早的几天；若窗口内某 weekday 仅出现在被截断的早期日期（如本周六 2026-07-25 在 7-26 之前），该列整体空白。t162/t164 已把 >=7d 柱图改走 `buckets`（无截断），但**热力图仍走 records + LIMIT，未一并迁移**。分类：产品缺陷（数据源选择 + LIMIT 截断未覆盖热力图路径）。
- 测试缺口：`tests/unit/renderer/lib/token-stats/chart-data.test.ts` 测了 `prepareHeatmapData` 的 weekday/hour 映射，但用小数据集，未覆盖「records 因 LIMIT 截断致某 weekday 整列缺失」；无「窗口内出现的 weekday 必须有着色」断言。后端 `token-stats-store` 的 `query_records` LIMIT 行为也缺「宽窗口截断会丢早期日期」的回归。补测方向：(1) renderer 端加用例构造跨多 weekday 的 records，断言热力图每个窗口内 weekday 有数据；(2) 集成层断言 7d 窗口 records 行数与 LIMIT 关系、或改走 buckets 后热力图正确性。
- 线索：`.scratch/probe_heatmap.mjs`（查 observations.sqlite 证实 7d 窗口 LIMIT 100000 仅覆盖 2026-07-26T06:36 之后，本周六 7-25 数据全被丢）。
- 处理：t170

### p011 grok 网络故障被呈现为「已过期」，用户 logout 后无法重登（2026-07-31）

- 现象：期望——采集失败区分网络错误与凭证失效，网络恢复后自愈；实际——2026-07-31 07:19 起 `cli-chat-proxy.grok.com` 连接超时（请求挂起约 10.6s 无响应），poll 失败 → 历史观测标 stale → 卡片/账号行显示「已过期」+「采集失败」+「重新登录」。用户在设置里退出登录后尝试重登，device-code `login_start` 连接 `auth.x.ai` 超时失败（DNS 被污染，解析到 Facebook IP `2a03:2880:...:face:b00c...` / `31.13.90.33`），token 已被清空，之后 poll 一律 401，面板持续显示「已过期」。复现：断开/污染到 xAI 域名的网络让 grok poll 超时 → 观测标 stale → UI 呈现与凭证失效不可区分。
- 影响：grok 连接器用量展示；所有 OAuth poll 型连接器在网络抖动时都可能被误呈现为凭证失效，诱导破坏性 re-login（logout 清 token 不可逆）。
- 根因：环境问题为主 + 产品设计弱点。环境：本机到 xAI/Grok 域名不通（`auth.x.ai` DNS 污染；`cli-chat-proxy.grok.com` 连接超时）。产品：`ProviderAccountRow.tsx` 对任意 error 显示「重新登录」，不像卡片失败态用 `is_auth_error` 门控；refresh-service 对 OAuth（poll）连接器收到 401 无即时 `refresh_now` 兜底（自动重登仅 session 连接器）；「已过期」badge 语义是数据 stale，文案读作凭证过期。
- 测试缺口：现有测试只覆盖 auth 错误路径的 UI 状态，未覆盖「网络超时 → stale → 账号行 badge/按钮」组合断言；缺 refresh-service 对 OAuth 连接器 401/超时行为的集成测试。补测方向：renderer 层断言非 auth error 不显示「重新登录」；集成层覆盖 OAuth 连接器超时/401 的 stale 标记与恢复路径。
- 线索：`.scratch/grok-expired-2026-07-31/notes.md`；运行日志 `~/AppData/Roaming/OmniPanel/logs/app-2026-07-31.log`（07:19 首次超时、09:23:52 logout、09:23:59 login_start Connect Timeout、12:29:02 401）
- 处理：t172

### p013 门禁基线红：format:check archive 文档 + knip 未用文件（2026-07-31）

- 来源：t172 顺手发现
- 内容：`pnpm format:check` 全局失败，约 30 个 `docs/archive/tasks/*/` 文档/脚本未过 prettier；`pnpm deadcode`（knip）报 3 个未用文件（`src/renderer/components/add_account/AuthPlaceholder.tsx`、`src/renderer/hooks/useGrokDeviceLogin.ts`、`src/renderer/hooks/useKimiDeviceLogin.ts`）。两者主仓同样报，为存量基线非本次引入。
- 处理：手动修复（2026-07-31）——archive 文档跑 prettier --write；3 个未用文件 git rm；`pnpm format:check` / `pnpm deadcode` 均转绿。

### p012 config-store 并发保存测试疑似 flaky（2026-07-31）

- 来源：t171 黑盒（顺手发现）
- 内容：`tests/integration/config/config-store.test.ts > serializes concurrent saves so final state is consistent` 在 t171 worktree 首次 `pnpm test` 失败、单独重跑即过，疑似时序敏感 flaky。与本 task 改动无关（未碰 config-store）。需复查是否真 flaky 或存在并发断言过弱。
- 处理：手动修复（2026-07-31）——复查确认无并发竞态（`enqueueSave` 串行链严格），失败为 Windows `rename(tmp → config.json)` 覆盖已存在目标时偶发 `EPERM`（目标被短暂句柄锁，如 Defender 扫描），单独重跑即过印证环境瞬态。`writeFileAtomic` 对 rename 的瞬态 EPERM/EBUSY/EACCES 加有限重试（3 次递增间隔）；补 `tests/unit/core/storage/write-json.test.ts` 两用例（瞬态 EPERM 重试成功、耗尽后仍抛）。config-store 21 测试 + write-json 4 测试全绿。

### p014 代理面板 7d+小时粒度柱状图缺最早数天数据（2026-07-31 发现）

- 现象：代理面板选「最近七天」+「小时」粒度查看 token 统计，柱状图缺 7.24/7.25/7.26 数据（7/26 仅剩 23:40 后不足一天）。期望窗口内每天每小时都有数据。
- 影响：7d 窗口下小时粒度图表数据不全；随记录增长（当前 40.5 万行/周 14 万行）缺失天数继续扩大。
- 根因：产品缺陷——`TokenStatsView.loadData` 对非短窗口 records 用 `{ start, end, limit: 100000 }`（TokenStatsView.tsx:221-223），后端 `query_records` 为 `WHERE timestamp>=@start AND <=@end ORDER BY timestamp DESC LIMIT @limit`（token-stats-store.ts:483）。7d 窗口 140,481 行超 LIMIT，倒序截断丢最早日期（保留最早 `2026-07-26T15:40Z`）。t162/t164 已把 >=7d 柱状图 day 粒度改走 buckets（无截断），t170 把热力图改走 query_heatmap 聚合（无截断）；但 hour 粒度柱状图仍走 records + LIMIT，是 p010 同类根因在「小时粒度柱状图」路径的遗留。BarChart 仅 `gran==="day"` 用 buckets（BarChart.tsx:94）。
- 测试缺口：`tests/unit/renderer/lib/token-stats/chart-data.test.ts` 测 `prepareBarData` 用小型数据集，不涉及 LIMIT 截断语义；store `query_records` 测试未断言「宽窗口倒序 LIMIT 会丢窗口早期日期」。补测方向：(1) store 集成层断言 7d 窗口 records 行数与 LIMIT 关系、或断言 hour 聚合路径不截断；(2) renderer 层补「hour 粒度宽窗口数据来自聚合、窗口内每天每小时有值」回归。
- 线索：`.scratch/t173/probe.mjs`（实测 DB：7d 窗口 140,481 行，倒序 LIMIT 100000 最早保留 7/26 15:40Z）；`.scratch/t173/probe2.mjs`（hour+model 聚合仅 429 行）。
- 处理：t173——`query_hour_buckets`（UTC+8 本地整点小时 × model 聚合）经 IPC / preload / local-api / web bridge 接线，BarChart 在宽窗口 + 时间轴 + 小时粒度选源聚合；越界桶补 whole-hour 范围守卫。打包实测：7d 窗口最早保留 `7/25 01:00Z`（窗口首个整点小时），30d 窗口 7/24/25/26 均有数据。全量测试 1957 passed。

### p001 16 个 connector 删内联 helper 改 ctx.status（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t088/t066 遗留
- 内容：16 个 connector（connectors/_/connector.ts）删除重复内联 helper，统一改 `ctx.status`。现状：`ctx.status` 机制就绪（host-io.ts:26-30，for*pct/for_ratio/for_balance，t066 产物）但 **0/16 已迁移**；重复 helper 大量存在——`is_record`×9、`to_number`×13、`parse_limit`×5、status_for*_/classify_status 阈值 helper 出现于 14 个文件。均为单次 fetch 后用内联阈值函数算 status，无内联轮询状态机，迁移是纯机械替换。
- 处理：t175

### p002 测试架构改进（I19/I21/I22/I23）（2026-07-26 暂搁，2026-08-01 复核修正记录）

- 来源：t064 遗留
- 内容：测试架构改进，拆解为四路：I19/I21/I22 分别对应 p003（migration 测试 import 生产入口）、p004（e2e 断言真实刷新）、p005（setupFiles 拆 renderer-only），随各自条目推进；I23（取消条件 skip）独立处理。**记录修正**：原条目称「I23 已确认无残留 skip」失实——2026-08-01 复核仍有 5 处条件 skip（tests/e2e/web/{account_error_badge,opencode_go_usage,multi_account,settings_provider_accounts,popup_card_states}.spec.ts），依赖 synthetic/real fixture。
- 处理：t181

### p003 migration 测试改 import 生产迁移入口（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t069 遗留
- 内容：migration 测试改为 import 生产迁移入口。现状：`tests/unit/observation_store_migration.test.ts:26,30,40` 仍手写 `NEW_COLUMN_SQL` + `PRAGMA table_info`；生产迁移在 observation-store.ts:119-133 内联于 `create_observation_store`，未导出独立函数。需先抽取导出迁移函数（小幅 API 暴露，防手写 PRAGMA 与生产漂移）。
- 处理：t176

### p004 e2e 断言真实刷新（当前死等 1000ms）（2026-07-26 暂搁，2026-08-01 复核阻塞解除）

- 来源：t070 遗留
- 内容：e2e 断言真实刷新，替换当前死等 1000ms。现状：**阻塞已解除**——刷新按钮 `.spinning` class（PopupView.tsx:537）由 `refreshing` state 驱动，复位于 refreshAll().finally()（PopupView.tsx:374-388）；`popup_refresh_state_reset.spec.ts:56-72` 已示范「等刷新后 collapse 按钮可见」的免死等断言模式。仍死等两处：`scheduler.spec.ts:43`（waitForTimeout(1000)）、`tray_menu_actions.spec.ts:44-47`（点击后仅断言按钮可见）。
- 处理：t182

### p005 setupFiles 拆 renderer-only（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t071 遗留
- 内容：setupFiles 拆分 renderer-only 部分。现状：vitest.config.mts:16-17 全局 `environment: "jsdom"` + 唯一 `setupFiles: ["./tests/smoke/setup.ts"]`；setup.ts 全为 renderer 专用（import jest-dom、`window.usageboard` mock、beforeEach 注入 `#root` DOM）。node 类测试（paths.test.ts 等）也跑 jsdom 被注入该 mock。vitest.contract_live.config.mts:13 有 node env 先例，但主套件未拆。
- 处理：t177

### p006 完整 rendererIndexPath 白名单（2026-07-26 暂搁，2026-08-01 复核阻塞解除）

- 来源：t062 遗留
- 内容：完整的 rendererIndexPath 白名单。现状：**t067 已落地**——`set_renderer_index_path`（helpers.ts:19-29）+ file:// 精确 pathname 比对（helpers.ts:39-43），接线于 main/index.ts:122-126，测试 helpers.test.ts:12-39（拒绝同名异路径）。仅剩未初始化时 `endsWith` fallback（helpers.ts:44，测试环境专用）。
- 处理：t178

### p007 write_front_matter / rebuild_indexes 原子写恢复（2026-07-26 暂搁，2026-08-01 改写）

- 来源：t063/t068 遗留改写。t063（8eaf1892）曾为权威 task JSON 实现 tmp+fsync+os.replace 原子写（防掉电损坏）；t169 模板化重写后 `scripts/task.py` 全仓 `os.replace` 命中为 0，`write_front_matter`（task.py:387）直接 `write_text` 写**权威 front matter**，`rebuild_indexes`（task.py:835）直接写派生索引 JSON，原子性丢失。task.md front matter 是状态权威（CLAUDE.md 明文「只经 task.py 修改」），中断写损坏影响比旧 JSON 更重。原「mock os.replace 失败路径测试」目标代码已消失，故改写为恢复原子写。
- 内容：`write_front_matter` + `rebuild_indexes` 恢复 tmp+fsync+os.replace 原子写；在 `tests/repo_template/` 补失败路径/中断恢复测试（pytest 基建已就绪，197 用例；`test_task_save.py` 测了内容正确性未测原子性）。
- 处理：t179

### p009 拆 PopupView.tsx（869行）与 popup_view.test.tsx（1519行）（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t153 f002/f003
- 内容：拆分 `PopupView.tsx`（实测 869 行）与 `popup_view.test.tsx`（实测 1519 行，项目最大测试文件）。t044/t125/t126 有拆分先例。
- 处理：t180

### p015 采集失败的 stale 副本时间戳打成尝试时间，卡片「几分钟前」误导为新数据（2026-08-01）

- 现象：期望——采集失败沿用上次数据时，卡片时间应反映数据真实年龄（或明确标注为尝试时间）；实际——每次失败采集都把历史观测复制为 stale 副本，副本 `observed_at` 打成本次尝试时间（`refresh-service.ts` 标 stale 分支 `observed_at = Date.now()`），卡片相对时间每轮失败都被刷新成「几分钟前」，与「已过期」徽标并列时读作「几分钟前刚采的数据」，误导用户。复现：让某连接器持续采集失败 → 卡片时间始终显示刚刚/几分钟前，数据实际可能是数小时或数天前。
- 影响：所有连接器账号行/卡片的相对时间显示；失败窗口内用户无法从时间判断数据真实年龄（grok 2026-07-31 故障期实证：imagine 数据停在 07-29，卡片时间却每 30 分钟刷新）。
- 根因：产品缺陷。stale 副本复制时覆盖了原观测的 `observed_at`（`refresh-service.ts:336,345`），数据年龄在副本中丢失；UI 相对时间直接取该字段（`observation-mapping.ts` → `provider-usage.ts` → `ProviderAccountRow` 的 `relative_time(account.updatedAt)`）。既有测试 `tests/unit/scheduler/refresh-service.test.ts:330` 还断言了误导行为本身（副本 observed_at 必须大于原观测）。
- 测试缺口：stale 副本语义的测试只断言 stale 标记与 last_error，唯一涉及时间戳的断言（上述 :330）锁死了错误语义，没有「副本应保留原数据时间」的覆盖；renderer 层也无「stale 行的时间显示数据年龄」断言。补测方向：refresh-service 层断言 stale 副本保留原 observed_at（旧断言按 TDD 规则整体删除并写明理由，不就地改预期）；renderer 层断言 stale 账号行相对时间取自原数据时间。
- 线索：`.scratch/grok-expired-2026-07-31/notes.md`；`.scratch/grok_imagine_history.py` 查询输出（imagine 副本 observed_at=2026-07-31T23:33:30Z，实际数据 07-29）
- 处理：t174

### p020 代理面板 24h 高密度统计被 records LIMIT 截断（2026-08-01）

- 现象：代理面板选择「24 小时」后，期望时间柱覆盖完整 24 小时；实际高密度使用时仅最近约 3 小时有柱。最小复现向 48 小时查询窗口写入 60,000 条明细，其中最近 3 小时 50,000 条；倒序查询限制 50,000 条后，24 个小时桶仅最后 3 个非空。
- 影响：24h 时间轴小时柱丢失较早时段；同一批受限明细还驱动 24h KPI、donut、项目轴和会话轴，高密度使用时这些统计也不完整。7d/30d 的 day/hour 聚合路径与热力图不受此缺陷影响。
- 根因：24h 被划为 short window，柱状图跳过已有 hour 聚合并拉取 current+previous 共 48 小时明细；records 查询按时间倒序限制 50,000 条，数据量超限时静默丢弃最早记录。分类：产品缺陷，伴随测试假绿。
- 测试缺口：现有 renderer 测试明确断言 24h 不请求 hour 聚合，且 records mock 永不模拟倒序 LIMIT 截断；store 测试只验证 limit 下推，未覆盖高密度 24h 用户行为。补测应覆盖：24h 时间轴接入完整 hour 聚合；超过 50,000 条时 KPI/donut 与项目/会话轴仍覆盖完整窗口；断言最终用户可见统计，而非锁定旧数据源选择。
- 线索：`.scratch/task_bug_24h_bar/repro.py`
- 处理：t183（24h 时间轴小时柱改走 hour 聚合）+ t184（KPI/donut 与项目/会话轴改走 window rollup 聚合）

### p016 t174 minor 遗留：prune 同 ts 保护过宽 + AccountUsageRow observedAt 路径无测试（2026-08-01）

- 来源：t174_code_f001 / t174_test_f001
- 内容：t174_code_f001——`observation-store.ts` 的 `prune_stmt`（:193-200）MAX 保护子查询未同步 `stale DESC` tie-breaker；stale 副本保留原 `observed_at` 后原观测与副本同时间戳，同 ts 下全部命中「保留每键最新行」保护，prune 对该键失效，同 ts 行随失败-恢复循环累积（数据不丢，latest 查询仍唯一）。t174_test_f001——`UsageRows.tsx` 的 `AccountUsageRow` 做了对称的 observedAt 优先取数改动，但 `usage_rows.test.tsx` 无用例断言该路径。
- 处理：t186

### p017 store dedupe 用例未锁行累积防护，删 `delete_stale_dup` 后测试仍绿（2026-08-01）

- 来源：t174_test_f002（review_test.md Round 2，未进处置表）
- 内容：`observation-store.test.ts` 新增用例「dedupes stale copies sharing the same observed_at」只断言查询层去重（`stale DESC` tie-breaker + ROW_NUMBER 独立保证返回 1 行），未直连断言 `delete_stale_dup_stmt` 的行数防护。推演验证：删除该删除逻辑后用例仍全绿，但连续失败会对同键同 ts 无限累积 stale 行（insert 前清理失效）。数据不丢、latest 仍唯一，属防护性覆盖缺口，非行为错误。
- 处理：t186（与 p016 合并）

### p018 pending.py / render_review_prompts.py 直写权威/派生文件未原子化（2026-08-01）

- 来源：t179 spec 非范围（t169 模板化重写后原子性丢失的同一根因，t179 只覆盖 task.py）
- 内容：`scripts/pending.py:328-329` 与 `scripts/render_review_prompts.py:297` 仍直接 `write_text` 写 `docs/pending.md` / `docs/archive/pending.md` / review prompt 文件，无 tmp+fsync+os.replace 原子写，中断会产生半写状态。`scripts/task.py` 的 `_atomic_write_text` 可复用。
- 处理：t185

### p019 t175 归档 spec.md 未过 prettier，pnpm check format:check 红（2026-08-01）

- 来源：t180 顺手发现（commit 242343ad 引入）
- 内容：`docs/archive/tasks/t175_connector_ctx_status_migrate/spec.md` 存在 prettier 格式问题（`pnpm check` 的 `format:check` 全仓检查报警），t180 拆分执行时首次暴露。归档文件由 `finish` 移动，格式问题随 t175 归档带入。需 prettier --write 后单独 commit（属维护，不混入 task 执行 commit）。
- 处理：已验证不存在（2026-08-02 复核：`prettier --check docs/archive/tasks/t175_connector_ctx_status_migrate/spec.md` 通过，格式问题已消失，无需处理）

### p023 自定义 ≤25h 范围的小时柱仍走 records，高密度时同源截断（2026-08-01）

- 来源：t183 review 结论段提示（spec 明确保守保留，未随 t183 修复）
- 内容：`TokenStatsView` 的 `hour_fetch` 条件为 `gran !== "hour" || !time_axis || (is_short_window && preset !== "24h")`——非 24h preset 的 ≤25h 自定义范围（custom range）时间轴小时柱仍走 records，高密度时受倒序 LIMIT 50000 截断，与 p020 同源。t183 只覆盖 24h preset；如需消除，让 ≤25h 自定义范围同样走 hour 聚合（hour 聚合支持任意窗口，无短窗口对称切分约束——那是 KPI/donut 的事）。
- 处理：t187

### p024 query_range_rollup 的 title 子查询选全表最新而非窗口内最新（2026-08-01）

- 来源：t184 review Round 2 f003 复核提示（non-blocking）
- 内容：`token-stats-store.ts` 的 `query_range_rollup` 用相关子查询选每组最新 timestamp 的 title 对齐 records `rs[0].title`，但子查询 `WHERE t2.session_id=... AND source=... AND env=...` 未带窗口 `timestamp` 过滤，选的是该 session 全表最新标题。records 版 `query_records` 先按窗口过滤再 `ORDER BY timestamp DESC`，`rs[0].title` 是窗口内最新。差异：session 在窗口外被改名时，rollup 返回窗口外的新名，session 轴 label 前 7 字符可能漂移；token 统计不受影响。如需严格对齐，给子查询加 `timestamp >= @start`（与外层窗口一致）条件。
- 处理：t188

### p021 e2e gen-synthetic 重生成会抹掉手工 synthetic fixture 条目（2026-08-01）

- 来源：t181 review f001 / test_f001
- 内容：t181 为让 6 处条件 skip 用例在 synthetic 下可跑，手工给 `synthetic.json` 注入 KIMI items `error`（HTTP 401）并补 opencode_go connector（2 workspace）。`gen_synthetic.mjs`（`e2e:gen-synthetic`）不产生这两类条目，重跑生成会静默覆盖，导致 account_error_badge / opencode_go_usage 在 CI 变红。
- 处理：已修（2026-08-02 手动修复，直接在 main）——gen_synthetic.mjs 固化注入 KIMI failed connector（items 带 error HTTP 401）+ opencode_go connector（2 workspace × rolling/weekly/monthly，窗口文案 滚动/一周/一月），重跑 e2e:gen-synthetic 不再覆盖。

### p022 sparkline 恒空：renderer trend 传 period.id（长）与 trend key metricId（raw_label 短）不匹配（2026-08-01）

- 来源：t181 review 未进表提示（pre-existing 系统性 fixture 不一致）
- 现象：synthetic e2e 下 sparkline 恒空。renderer `trend_api.get(provider, accountId, period.id)` 传完整 period.id（长，如 `srcInstanceId:...:metricId`），但 trend 数据 key（real responses / mock_server）的 metricId 是 raw_label（短，如 `gemini-models`）→ 不命中 → 空。
- 根因：renderer 传 period.id，trend 索引按 raw_label。real/real-server 同机制（query_trend_series 按 metric_id 精确匹配）。
- 处理：已修（2026-08-02 手动修复，直接在 main）——ProviderAccountRow.tsx trend 调用改传 `period.raw_label`（与 trend key metricId 一致），对齐 real 录制行为。

### p025 reviewer prompt 模板要求 `overall:` 但 check_review_status.py 认 `verdict:`（2026-08-02）

- 来源：t187 收尾自查（task-run Step 7）
- 内容：`task-run` skill 的 review 指示与 reviewer 习惯写「overall: PASS/FAIL」，但 `scripts/check_review_status.py:29` 的 `VERDICT_RE = ^verdict: (PASS|FAIL)$` 只认 `verdict:`。reviewer 若只写 `overall:` → check 返回 `overall=INCOMPLETE`，需手工在 review 报告补 `verdict:` 行。t187 Round 1/2 即踩此坑（手工补正）。两处应统一：要么脚本兼容 `overall:`，要么 skill prompt 模板与 reviewer 指示统一要求 `verdict:`。
- 处理：手动统一为 `verdict:`（2026-08-04）——review prompt 模板（code/test/general/share）末行已统一要求 `verdict: PASS` / `verdict: FAIL`，`check_review_status.py:29` 认 `^verdict:\s*(PASS|FAIL)\s*$`，`tests/repo_template/test_check_review_status.py` 锁定严格行匹配；脚本保持不兼容 `overall:`，reviewer 只写 `overall:` 仍会 INCOMPLETE 属预期。归档 t187 review_general.md 残留 `overall:` 为历史产物，不再回改。

### p039 prettier 基线漂移 2 文件致 format:check 挂（2026-08-04）

- 来源：t197 收尾自查（task-run Step 7）
- 内容：`docs/spikes/s010_popup_hide_resource/code/hide_show_spike.js` 与 `tests/e2e/fixtures/mock_server.mjs` 未过 prettier 格式，`pnpm check` 的 format:check 必挂。两者均非 t197 改动文件（`git diff 3b2804f6` 无此二文件），为既有漂移，影响后续每个 task 的 `{test_cmd}` 门禁。
- 处理：t199

### p026 TokenStats 查询缓存键包含展示维度

- 来源：t190_code_f003
- 内容：`metric`、`xaxis`、部分 `gran` 只影响 renderer 派生展示，却进入底层查询缓存 key，导致相同数据依赖重复 IPC 查询并占用 LRU 条目
- 处理：t200

### p029 t191 会话翻页重算整个 dashboard

- 来源：t191_code_f006
- 内容：renderer query key 含 `session_offset`，翻页 cache miss 后重新请求完整 dashboard（summary/chart/heatmap 一并重算），连续翻页将同窗口全量聚合重复执行
- 处理：t200

### p027 t191 dashboard 单请求对同一窗口重复执行多次聚合

- 来源：t191_code_f004
- 内容：`query_dashboard` 对同一 `[start,end)` 窗口串行执行 current/previous rollup、time chart、session count、session page、heatmap 共 5–6 次全窗口聚合；better-sqlite3 同步执行期间 IPC/local API 请求排队
- 处理：t201

### p028 t191 dashboard rollup/session 相关子查询按分组重复 lookup

- 来源：t191_code_f005
- 内容：rollup 每个 `(source,env,model,directory,session_id)` 分组执行一次窗口内最新 title 子查询；session page 又对每个 session 各执行 title、directory 两个子查询。N 个 session 接近 2N+ 次索引 seek
- 处理：t201

### p030 t191 `freshness.stale` 恒为 false

- 来源：t191_code_f007
- 内容：`query_dashboard` 返回 `freshness: { queried_at, stale: false }` 硬编码，不反映真实数据新鲜度；renderer 当前未消费 stale
- 处理：t201

### p031 query_dashboard records 与聚合路径双轨重复（2026-08-03）

- 来源：t192_code_f002（t192 Round 1，minor）
- 内容：`query_dashboard` 四段查询区域（read_rollup、time bucket、session 列表、heatmap）各维护 records 与 rollup 两份实现，语义等价但写法不同（`SUM(calls)` vs `COUNT(*)`、rollup 路径 GROUP BY 含 agent、started_at/ended_at 由子查询提供）。当前经 oracle 测试逐区相等无分叉，但长期修复遗漏源：任一区域修正须同步两份；read_rollup 聚合路径 GROUP BY 多含 `agent` 列，若未来 session 跨多 agent 则两路径产出不同行数。
- 处理：t201

### p032 AC2「未受影响聚合保持不变」无多 session 增量直测（2026-08-03）

- 来源：t192_test_f001（t192 Round 1，minor）
- 内容：增量测试全部单 session，dashboard fallback 对比在 upsert 后立即 backfill 掩盖增量期状态；若 `delete_hour_rollup_session_stmt` 丢失 session_id 谓词导致清空其它 session 行，现有测试仍绿。建议补「两 session 入库 → 增量 upsert 仅触碰其一 → 不 backfill 直接 read_rollup == oracle_rollup」。
- 处理：t202

### p033 AC3 失败/回滚批次不推进版本无测试（2026-08-03）

- 来源：t192_test_f002（t192 Round 1，minor）
- 内容：版本递增与 records 写入、rollup 重建同处一事务，抛错理应整体回滚，但无失败注入用例（仅空批次不推进）。建议构造类型非法 record 断言抛错后 `get_data_version()` 与 `query_records` 行数均不变。
- 处理：t202

### p034 AC4 竞态子句（更新事件 vs 进行中查询）无专门测试（2026-08-03）

- 来源：t192_test_f003（t192 Round 1，minor）
- 内容：事件触发 `loadData` 后旧查询晚到被 request_id guard 丢弃的竞态只在 filter 变更路径验证，未在事件触发路径验证。建议补「查询 in-flight 时触发更新版本事件 → 旧响应晚到不覆盖新数据」。
- 处理：t202

### p035 AC3「更新事件报告同一已提交版本」的 main→preload 转发粘合层无测试（2026-08-03）

- 来源：t192_test_f004（t192 Round 1，minor）
- 内容：主进程 on_update 发送 `get_data_version()`、preload onUpdated 解析 number，但版本在 main→preload 转发中丢失/错位无用例捕获。建议在 ipc/preload 层补 onUpdated 事件版本转发用例。
- 处理：t202

### p036 AC5 读取规模无直接测量，聚合路径误读全量 records 也能 PASS（2026-08-03）

- 来源：t192_test_f005（t192 Round 1，minor）
- 内容：AC5 用例断言 DTO 形状与 rollup 行数平坦，但若 `window_union` 因 bug 改为整窗读 records，输出仍一致照常 PASS。窗口恰为整点时可加 `EXPLAIN QUERY PLAN` 断言命中 `token_stats_hour_rollup` 且不 SCAN `token_stats_records`。
- 处理：t202

### p037 AC1 重启场景（ready=1 持久化 + 重启后续写）无专门测试（2026-08-03）

- 来源：t192_test_f006（t192 Round 1，minor）
- 内容：幂等测试只覆盖同进程两次 backfill；ready 标志跨 reopen 持久化、重启后 ready=1 时增量续写与 oracle 一致无用例。建议补「backfill 置 ready → close → reopen → 断言 ready 仍 true、再增量 upsert 后 read_rollup == oracle_rollup」。
- 处理：t202

### p038 electron e2e 一批账号/表单用例在 t193 基线上已失败（2026-08-03）

- 来源：t194 黑盒（全量 electron e2e）对比确认
- 内容：`auto_seed`（existing config not overwritten）、`plugin_config`×3、`secrets_persistence`×3、`settings_view`×2、`popup_window_constraints`（collapsing all cards 底部留白）、`tray_menu_actions`（quit 菜单标签）共 11 个用例在 t193 HEAD（bb31938d）同样失败（stash t194 改动后逐组复跑确认一致），非 t194 引入。共性是 settings 账号/表单渲染与 connector 加载路径，疑为 t189-t193 范围内回归或本机环境（connector 发现/auto-seed）差异。
- 处理：t203

### p043 t204 model 筛选测试覆盖补强（AC3/AC4/端点透传）

- 来源：t204_test review Round 1 f002/f003/f004
- 内容：t204 model 筛选遗留三条测试覆盖缺口：(1) AC4「重开面板保持」只断言 localStorage 未做 remount 恢复路径覆盖；(2) AC3 model+agent/platform AND 组合、窗口切换后模型列表刷新无显式用例；(3) local-api /v1/dashboard/sessions、/v1/heatmap、/v1/hourBuckets、/v1/rollup 四端点与 IPC 通道的 model 透传、`query_range_rollup` 过滤无显式断言。
- 处理：t206

### p044 用量面板所有账号 sparkline 恒显「近 7 天数据不足」

- 现象：展开任意账号，token 消耗折线图区恒显「近 7 天数据不足」，无折线。期望：展示该账号近 7 天用量趋势。
- 影响：全账号、全指标（CPA Claude five_hour/seven_day、opencode_go rolling/weekly/monthly、grok、tavily 等）sparkline 全失效；折线图功能整体不可用。回归自 commit 48512085（p022）。
- 根因：`ProviderAccountRow.tsx:112` 把 `period.raw_label`（短标签，如 `five_hour`、`monthly`）当作 `metric_id` 传给 `trend:getBulk` IPC。`trend-ipc.ts` 透传该值给 `observation-store.query_trend_series`，其 SQL `WHERE provider=? AND account_id=? AND metric_id=? AND observed_at>=?` 按 `metric_id` 列精确匹配。但 observation 写入时 `metric_id` 列存的是 connector 构造的完整键，与 raw_label 不一致：
    - CPA Claude: `claude:${account_id}:${key}`（如 `claude:acc-1:five_hour`），raw_label=`five_hour`
    - opencode_go: `opencode_go:${raw_label}`（如 `opencode_go:monthly`），raw_label=`monthly`
    - grok: `grok:product:${raw_label}`，raw_label=产品名
    - tavily: `tavily:monthly_usage`，raw_label=`total-month`
      两者从不相等 → 查询 0 行 → 7 天全 null → `valid_points.length < 2` → 显示占位文案。产品缺陷（前端查询键与存储键不一致）。
- 测试缺口：
    1. `trend-ipc.test.ts` 用 mock store，mock 内 `metric_id === "5h"` 直接匹配传入值，绕开真实 store 的完整键逻辑——无法 catch 键不匹配。
    2. `provider_account_row` 前端测试只断言「调用参数是 raw_label」，不验证端到端数据返回。
    3. 缺集成测试：connector 产出 observation → store.insert → 用前端 bulk 实际传递的键查询 → 断言非空。
       补测方向：加跨层集成测试（真实 store + 前端实际传递的 metric_id 值），或在 trend-ipc 层接真实 store 跑回归。
- 线索：`.scratch/`（本 skill 仅只读探查，未产生 scratch 文件；根因全在源码与 git blame）
- 处理：t207

### p040 session 轴会话 key 不含 env（t200 遗留）

- 来源：t200_code_f003
- 内容：rollup DTO 行（`tokenStatsRollupRowSchema`）不含 `env`，renderer `prepareBarDataFromDashboardRollup` 的 session_key 缩为 `${source}|${session_id}`；改前服务器含 env（`${source}|${env}|${session_id}`）。跨平台同 session_id 的会话在 session 轴会合并为一个 category。session_id 为 UUID 碰撞概率极低。补 env 会改变 `query_range_rollup` 的分组/校验语义，改动面广，暂缓。
- 处理：t217

### p041 不可折叠卡片死折叠箭头扩散到其余组件（t203 审阅建议）

- 来源：t203_code review 未进表提示 1
- 内容：t203 为 ProviderCard 引入 `collapsible={can_collapse}` 消除不可折叠卡片的死折叠箭头（no-op + aria-expanded=true）。同款模式仍存在于 `UpcomingResetCard`（onToggleExpand 未定义时渲染 no-op 箭头）、`ProviderAccountRow`（can_collapse=false 仍出箭头）、PopupView token 面板（非 live 时 onToggle no-op）。live 弹窗中这些组件恒有回调故不造成用户可见问题，但镜像树（aria-hidden）仍渲染死按钮，属 a11y/整洁度技术债。
- 处理：t220

### p042 auto_seed BUNDLED_PLUGIN_NAMES 与 connectors/ 实际连接器脱节（t203 审阅提示）

- 来源：t203_code review 未进表提示 3
- 内容：`auto_seed.spec.ts` 的 `BUNDLED_PLUGIN_NAMES` 仍是 7 条历史插件名，与 `connectors/` 下实际 16 个连接器脱节。断言用 `>=` 故仍通过，语义只剩「种子未清空既有配置」，靠 `.acc-row` "My Claude" 可见性断言兜底。属测试维护债，可考虑改为与 `discover_connector_definitions` 结果对齐或删去常量。
- 处理：t220

### p045 idx_trend 索引对 trend 查询冗余（t214 审阅建议）

- 来源：t214_code review 未进表提示
- 内容：t214 给 `query_trend_series` SQL 加 source_instance_id 后，SQLite planner 改用 idx_lookup（provider, account_id, metric_id, source_instance_id, observed_at）全覆盖，idx_trend（provider, account_id, metric_id, observed_at）对该查询不再被选用（见 d015）。idx_trend 保留无害但属冗余索引（占空间、增写入开销）。清理前须确认无其他查询路径依赖 idx_trend 的列序（如不含 source_instance_id 的等价范围查询）。
- 处理：t221

### p046 sparkline 窗口选择持久化（t208 范围外功能增强）

- 来源：t208 SPIKE 结论
- 内容：t208 sparkline 窗口选择器（1/7/30 天）仅 session 内 useState，重启回默认 7 天。config 层有 per-view 偏好字段（`collapsedAccounts` 等），可加字段持久化用户选择。属功能增强，非 bug。
- 处理：t222

### p047 trend 相关注释订正与窗口选择器测试 flaky（t208 审阅范围外）

- 来源：t208 code/test review 未进表提示
- 内容：(1) `TrendApi.get` 注释「返回长度=days、缺失日期填 null」已过时（t208 改 ≤max_points 桶、不填充）；(2) `observation-store.ts` 接口前置 docstring 与 t208 补充段表述矛盾；(3) `provider_account_row.test.tsx` 窗口选择器「切回缓存」断言用 `setTimeout(50)` 负向等待，CI flaky 风险，宜改用 `waitFor` 配合「调用次数未变」或伪时钟。
- 处理：t220

### p048 会话历史增量推送固定发往历史窗口（t210 遗留）

- 来源：t210_code_f004
- 内容：`session-history-ipc.ts` SUBSCRIBE 的 `on_update` 把增量消息发往 `history_window_controller.get_window()`（唯一历史窗口），未按「订阅方窗口」路由。当前架构下订阅只由历史窗口（t211）发起，agent route 明细表入口（t212）走 `SESSION_HISTORY_OPEN` 打开窗口而非内联订阅，故无实际推错场景。若未来某窗口在自身内嵌订阅（如明细表内联会话视图），需把订阅事件与发起窗口绑定后路由推送。
- 处理：t219

### p049 refresh-service 集成测试在整批并行下偶发超时（疑似 flaky）

- 来源：t210 黑盒顺手发现
- 内容：`tests/integration/scheduler/refresh-service.test.ts` 在整批 `pnpm test` 高并行负载下偶发失败，单文件隔离跑稳定 30/30 通过。失败形态：`preserves lastSuccess across consecutive failures` / `inserts stale observations` / `passes config.proxy.url` 5s 超时、`retries failing non-session connector 3 times` 得 4 次尝试。这些用例走真实 2s 重试定时器，负载高时循环跑不进 5s 窗口或额外触发一次。与 t210 无关（t210 未触 refresh-service）。处置方向：给这些用例提 timeout、改用伪时钟或缩小重试间隔，消除并行时序敏感。
- 处理：t218

### p050 grok 增量消息 id 从 0 重计与全量 id 冲突（t210 审阅发现，t209 域）

- 来源：t210 code review 结论提示（t209 根因，建议 follow-up）
- 内容：grok 提取器的增量 id 从 0 重计，与全量提取的 id（按行号全局计）冲突：订阅建立时全量提取得 id 如 `grok-0..N`，追加后增量第一条 id 又从 `grok-0` 起。HistoryMessage.id 用于窗口渲染 key 与分页，重复 id 会导致 React key 冲突 / 订阅去重异常。另 byte_offset 增量遇写入半行时游标越过该记录，该记录在增量通道丢失（renderer 5s 兜底可恢复）。修法：增量 id 改成全局行号（offset 对应的行索引），且半行容错（读到非法 JSON 行时回退一个行边界重读）。
- 处理：t216

### p051 整批并行下真实定时器集成测试偶发 5s 超时（系统性 flaky）

- 来源：t211 黑盒顺手发现（p049 同类的更广表现）
- 内容：`pnpm test` 高并行负载下，多个走真实定时器的集成/单测间歇 5s 超时或断言窗口被挤爆：refresh-service（重试循环、proxy resolver）、grok-oauth（5000ms）、secrets-store / file-vault（20 并发写 2s 窗口）、subscription-service（30ms 轮询 + 2s wait_for）。单文件隔离跑全部稳定通过，证明是负载敏感而非逻辑错误。分布每次不同、与改动文件无关。处置方向：给这些用例统一提 timeout / 改用伪时钟 / 缩小真实定时器间隔 / 限制 vitest 并行 worker 数。
- 处理：t218

### p052 legacy rollup 路径 session 分组仍按裸 session_id（t217 审阅 minor）

- 来源：t217_code_f001
- 内容：legacy `prepareBarDataFromRollup`（chart-data.ts:822）/ `rollup_group_metric`（:985,1012）的 session 轴与去重 key 仍为 `${source}|${session_id}` 不含 env，跨 env 同 session_id 在此两处仍合并。当前 `rollup` prop 恒为 `never[]`（TokenStatsView.tsx:592）不可达，属 p040 复发陷阱。若未来恢复该 fallback 路径须一并补 env。
- 处理：fe80caa2

### p053 合并后 pnpm check 存量失败：format:check 与 knip 死类型（批次前遗留）

- 来源：t216-t222 合并后验证
- 内容：合并后 `pnpm check` 两处失败，均为批次前存量、本批次 7 个 task 未触碰：
    1. `tests/unit/renderer/views/session_history_test_utils.ts`（t210 遗留）prettier format 不通过——`npx prettier --write` 即可修。
    2. knip 报 `src/shared/types/token-stats.ts:444-451` `TokenStatsDashboardPlatform/Metric/XAxis/Granularity` 4 个未使用导出（t189 时代 dashboard 类型，非本批次新增）。
- 处理：fe80caa2

### p008 taskkill 按路径（PowerShell）（2026-07-26 暂搁，2026-08-01 复核，2026-08-07 归档）

- 来源：t074 遗留
- 内容：taskkill 改为按路径（PowerShell）
- 暂搁：2026-08-01 复核——t065 已把误杀范围从「所有 electron.exe」收窄为只杀 `OmniPanel.exe`（package-and-run.ts:18 按镜像名），撞名面极小；按路径实现需 PowerShell + 遍历进程路径，Windows 特定重构，边际收益低。等下次动打包脚本再一并做
- 处理：归档（2026-08-07 用户要求，自「不办」节移出；非闭环，属暂搁条目确认关闭不再保留在主总账）

### p054 本地默认 `pnpm test:e2e:web` 必挂 account_error_badge（需 MOCK_FIXTURE=synthetic）

- 来源：2026-08-05 /goal 全量 e2e 验证
- 内容：`pnpm test:e2e:web` 默认走 real fixture（responses.json），KIMI 三实例 state 无 item 级 error，`account_error_badge.spec.ts` 断言 `.error-badge` 必失败；`MOCK_FIXTURE=synthetic pnpm test:e2e:web`（CI smoke，docs/guides/testing.md:80 文档化）48 全绿。测试本身非回归（fe80caa2 未触该路径），属本地默认 fixture 与 synthetic-only 测试的配置分叉：daily 命令默认跑 real 却含 synthetic-only 用例。候选修法：该 spec 在非 synthetic fixture 下条件 skip，或 webServer 恒设 MOCK_FIXTURE=synthetic。
- 处理：t231

### p055 工作台 WorkspaceView.tsx / workspace.css 超行数阈值待拆分

- 来源：t224 code reviewer（round 1/2 提示，未进 finding 表）
- 内容：`src/renderer/components/workspace/WorkspaceView.tsx` 629 行、`src/renderer/styles/workspace.css` 780 行，均超项目 400 行 minor 阈值（未达 800 important）。工作台为 t224 新建且后续 t225（面板交互）/t226（摘选）还会继续演进，建议按功能拆（如消息状态逻辑抽 hook、弹窗样式独立）。
- 处理：t232

### p057 SessionLibrary 测试 act() 警告（异步 mock resolve 在 act 外）

- 来源：t227 test reviewer round 2（f007 minor）
- 内容：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 13 个用例渲染后 `getSessions`/`query` mock 的异步 resolve 落在 act 外，vitest 打印 "not wrapped in act(...)" 警告；不导致失败，纯 dev 噪声。候选修法：render 后 `await act(async () => {})` 冲刷微任务，或断言统一改用 findBy/waitFor 前先 act。
- 处理：t233

### p058 会话库 load_error 空态误报与中途分页失败无提示

- 来源：t227 code reviewer round 3（f013 minor，f012 修复残余）
- 内容：`SessionLibrary.tsx` 的 `load_error` 唯一渲染点是被 `visible_sessions.length === 0` 门控的空态分支。两个残余缺口：① 中途分页失败时部分数据照常展示且无「加载中断」标识；② `load_error=true` 且筛选匹配 0 条时，空态误报「会话列表加载失败」并隐藏「清除筛选」按钮。候选修法：空态文案区分「加载失败（all 为空）」与「无匹配（all 非空）」；中途失败时列表上方加一行提示。
- 处理：t234

### p059 会话库 SessionLibrary.tsx / session-library.css 超行数阈值待拆分

- 来源：t227 code reviewer round 1/2/3 连续提示（未进 finding 表）
- 内容：`src/renderer/components/session-library/SessionLibrary.tsx` 645 行、`src/renderer/styles/session-library.css` 725 行，均超项目 400 行 minor 阈值（未达 800 important），round 1-3 持续净增。建议按功能拆（SessionCard/SessionRow/预览抽屉抽独立组件文件、CSS 按区块拆）。
- 处理：t241

### p060 柱状图小时/天粒度按钮在 7d/30d 预设下点击无效（回归）

- 现象：代理面板柱状图时间轴的「小时/天」粒度按钮，在 7d/30d 预设下点击无响应（显示恒为「天」）；24h 预设下点「天」按钮样式也不随点击变化。期望：24h 强制小时粒度，7d/30d 可选择小时或天，自定义范围可自由切换。
- 影响：粒度切换在常用 7d/30d 视图完全失效，用户无法按小时查看一周/一月的分布。
- 根因：t191（commit 96cbf532）引入 `effective_granularity(preset, custom, gran)`（`src/renderer/views/TokenStatsView.tsx`），`preset` 非 24h 时恒返回 `"day"`、24h 恒返回 `"hour"`，且粒度 Segmented 的 `value={effective_gran}`、onChange 只 `setGran`。7d/30d 下 `effective_gran` 强制 `"day"`，`gran` state 的「小时」选择被覆盖，控件假死；24h 下点「天」仅改 `gran`，UI 仍显示 hour，点击无视觉反馈。t191 之前 `value={gran}` 原生生效，可自由切换。属于产品缺陷 + 回归。t183（24h preset 走 hour 桶聚合）依赖 24h 强制 hour；t184（24h 只走 rollup）不依赖 gran 覆盖，修复时须保持 24h 锁定小时，仅放开 7d/30d 的 `effective_gran` 约束。
- 测试缺口：`tests/unit/renderer/views/token_stats_view.test.tsx` 无断言覆盖预设下粒度按钮的行为；`effective_granularity` 为视图内纯函数未导出未单测，7d/30d 下点「小时」后的 UI/查询 gran 行为无任何断言。补测：点击 7d/30d「小时」后断言 Segmented 高亮与 `getDashboard` 请求 `gran="hour"`；24h 下断言恒 hour；自定义范围断言可切换。
- 线索：`.scratch/task-bug-gran-24h7d/`（回归定位笔记）；根因定位见 commit 96cbf532 引入 `effective_granularity`。
- 处理：t229

### p061 代理面板模型下拉未应用模型映射（alias）

- 现象：代理面板右上角「模型筛选」下拉列出的是原始模型名（如 `claude-3-5-sonnet-20241022`），而柱状图、donut、会话表同窗口都显示映射后的别名（如 `Sonnet`）。期望：下拉选项显示文本应用同样的 modelAliases 映射。
- 影响：用户在下拉里看不到与图表一致的模型名，筛选时难以对照；alias 用户日常操作体验不一致。
- 根因：后端 `dashboard.models` 由 `token-stats-store.ts` 的 `SELECT DISTINCT model ... ORDER BY model`（`window_models` 临时表）直接取原始名，未过 `model_resolver`（alias 在 TopN 聚合前的 `model_token_totals`/`model_call_totals` 中已合并）。前端 `TokenStatsView.tsx` 的 `modelOptions` 直接用 `dashboard.models` 渲染下拉，未套 `modelAliases`。属产品缺陷。注意：后端 `build_dashboard_conditions` 的 model 筛选是原始名精确匹配（`model = @model`），所以下拉 value 必须保留原始名、只映射显示文本，否则筛选失效。
- 测试缺口：`tests/unit/renderer/views/token_stats_view.test.tsx` 的模型筛选测试（t204/t206）只断言 option 文本等于原始名（`sonnet`），未覆盖配置了 modelAliases 时下拉显示映射名；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 未断言 `dashboard.models` 的 alias 映射。补测：后端测试断言配置 model_aliases 后 `models` 返回映射名；前端测试断言带 modelAliases 时下拉显示别名且选中后查询仍发原始名。
- 线索：`.scratch/task-bug-model-dropdown/`（映射链路分析）。
- 处理：t230
