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
