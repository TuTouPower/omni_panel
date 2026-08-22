# Task review t437（reviewer_focus: 测试）

- task：`t437_wsl_host_collect_windows_agents`
- spec：`docs/tasks/t437_wsl_host_collect_windows_agents/spec.md`
- diff_anchor：`80398ac99707accadaa30d343374f813873da901`
- target：`git diff 80398ac99707accadaa30d343374f813873da901`
- round：1
- reviewed_at：2026-08-23 03:48 UTC+8

## Findings

### t437_test_f001 - mac 测试内部不一致：resolve 用 mac、query 漏改为 linux

- 严重度：minor
- 锚点：AC-003（macos 宿主 → mac）；测试自身语义矛盾
- 位置：`tests/unit/main/core/session-history/subscription-service.test.ts`「host=macos 时同样可读取本机 mac 会话」it 块
- 问题：同一 it 内 `resolve_session_file("claude_code", "mac", "sess_mac", macos_paths)` 用 mac，紧接着 `service.query({ source: "claude_code", env: "linux", session_id: "sess_mac", ... })` 的 env 仍是改前的机械替换结果（应随 mac）。query 的 env 参与 extract-cache key（`source|env|session_id`，`loc_key`），因此 mac env 的 query/缓存路径未被验证；该 it 宣称覆盖 macos 场景，实际 query 侧走的是 linux env。文件读取断言真实发生（file_path 显式传入），不掩盖实现缺陷，故不阻断。
- 建议：把该 query 的 `env: "linux"` 改为 `"mac"`。

### t437_test_f002 - AC-005 测试侧 `local` 字面量残留两处

- 严重度：minor
- 锚点：AC-005（面向 TokenStatsEnv / session 会话 env 的 `"local"` 字面量清零；允许「迁移前旧库」构造输入，此处非此类构造）
- 位置：`tests/unit/renderer/components/session_shell/SessionShell.test.tsx:242`、`tests/unit/main/core/token-stats/collector.test.ts:1243`
- 问题：两处活跃测试数据仍含 `local` 字面量，diff 未清理：
    1. `SessionShell.test.tsx:242`：`ub.tokenStats.getSessions.mockResolvedValue([{ id: "s1", source: "claude_code", env: "local", ... }] as never)` —— TokenStatsSession 夹具，`as never` 绕过类型（类型系统已因枚举移除而拒绝 `local`）。同文件 focus 事件已用 `env: "win"`，此处为漏改。
    2. `collector.test.ts:1243`：`emitted_record_keys.set("fresh|local|m-fresh", now)` —— 同 it 内前一个 key 已改 `"old|win|m-old"`，此条漏改（prune 只按时间戳裁 key，env 段无行为影响）。
        两处均不产出任何数据、不掩盖行为，故 minor；但会让全仓 `local` 清零的 grep/守卫对 tests 侧误报，且 AC-005 字面未完全达成。
- 建议：分别改为合法平台值（如 `"linux"` / `"win"`）。

### t437_test_f003 - 迁移测试宿主默认 env 断言硬编码 linux，平台耦合

- 严重度：minor
- 锚点：AC-002（NULL directory 行 → 宿主默认；决策 d048）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts`（v8 迁移 it 内 `session("null-sess").env).toBe("linux")`、`daily_env("orphan")).toBe("linux")`、`record_env("rec-null")).toBe("linux")`）
- 问题：宿主默认由生产 `host_default_env()` 按 `process.platform` 推导，断言却硬编码 `"linux"`（注释声明「测试机 linux」）。测试机/CI 切到 Windows/macOS 时这三处必红——测试正确性依赖运行平台，与生产逻辑的平台无关性相矛盾。行为本身真实（生产代码在测试机 linux 上确实产出 linux），不构成假验证，故 minor。
- 建议：断言改为与 `host_default_env()` 推导结果比较（或按平台参数化），并在测试注释注明 CI 平台约束。

### t437_test_f004 - dashboard 查询 platform→env 过滤路径无测试触达

- 严重度：minor
- 锚点：AC-004（选 win 只列出 env=win 会话）
- 位置：`src/main/core/token-stats/token-stats-store.ts:669-671`（`query.platform !== "all"` 时 `params["env"] = query.platform`，dashboard rollup 过滤）
- 问题：AC-004 的验证链为「筛选选项无 local 且含四平台（token_stats_view 测试 ✓）→ 选 win 发出 platform=win 请求（token_stats_view 测试 ✓）→ dashboard 响应只含 win 会话」。末环在 UI 测试只断言了请求参数（未 mock 按平台过滤的响应），store 侧 dashboard 查询测试全部用 `platform: "all"`，`platform→env` 的 rollup 过滤分支（669-671 行）无任何测试触达。等价过滤在 `query_records({env})` 有测试（"filters records by platform"），过滤语义被部分覆盖，且该分支为既有代码（本次仅枚举合法值变化，非新逻辑），故不阻断，标 minor。
- 建议：补一个 `query_dashboard({ platform: "win" })` 只返回 env=win rollup 行的 case。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无「迁就实现」的改测。既有测试的 env 字面量替换均对应新枚举语义（windows→win、POSIX→linux、macos→mac）；v7 迁移测试整体替换为 v8 迁移测试，属语义取代（t308 迁移行为已被 t437 v8 覆盖），替换后覆盖更全（分类、merge、幂等、聚合）。唯一异常是 f001（mac 场景 query 漏改为 linux），属机械替换错误，非迁就实现。
- 本轮新发现：4 条（全 minor）
- 未进表的提示：
    - `token_stats_view.test.tsx:430/437`「reuses a cached dashboard」it 的 mock 响应命名 `dashboard("local")` 并断言文本 "local"——该串是 dashboard() 的 title 数据而非 env，无行为问题，仅命名与平台值易混淆，可顺手改名。
    - AC-003 windows 宿主无真文件端到端集成测试（collector-local.test.ts 仅 linux 宿主）；windows 链由「collector→reader 传参 env=win（collector.test.ts）」+「reader 收 env 参数填 rows.env（reader 测试）」+「路径层 win_home（paths.test.ts）」分段验证，覆盖充分，未阻断。
    - v8 迁移后 scan-state 文件（state_path JSON）中旧 `*_local` key 不清理：旧 key 永不被消费但会随 save_state 反复写入，首次 collect 因状态缺失全量重扫一次。属一次性迁移副作用，可接受；如需可后续清旧 key。
    - records 表迁移无显式行数断言（merge 行数由 sessions 表验证，records 仅分类断言），可补一条 count 断言。
- 总体判断：测试可信度高，mock 边界合理（reader mock 与 collector-local 真集成互补），迁移、schema、采集 env、UI 四类 AC 均有真实行为断言；4 条 minor 不阻断，PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。重跑 `token-stats.test.ts` + `paths.test.ts` schema 断言全绿；手工核对 `tokenStatsEnvSchema` 四值枚举、`local` 拒绝。
- AC-002：`re_verified`。重跑 `token-stats-store.test.ts`（110 tests 全绿）；核对 v8 迁移 SQL（三表分类、merge、buckets 重建、hour_rollup 清空置 unready）、断言行数/聚合/幂等。
- AC-003：`re_verified`。重跑 collector/collector-local/reader/paths 测试全绿；核对 host=macos 新测试（平台五源 mac、wsl unavailable、无 local 残留）、linux/windows env 传参断言、reader env 落值断言。
- AC-004：`re_verified`。重跑 `token_stats_view.test.tsx` 全绿；核对筛选选项精确等于 `["all","win","wsl","linux","mac"]` 且不含 local、prefs 残留 local 回退 all、selectOptions("win") 请求参数断言。
- AC-005：`re_verified`。重跑 paths.test.ts rg 守卫测试全绿；另手工 grep 全仓 `env: "local"` 类字面量，src 仅剩 v7 历史迁移 SQL（迁移链输入，合规），tests 残留两处（f002）。「不允许新写入路径产出 local」成立。
- AC-006：`re_verified`。读 store.ts v7 注释（已改写为「t308 历史命名，被 t437 v8 逆转废止，仅保留迁移链兼容」）与 collector.ts 注释（无「Windows 原生源叫 local」表述）；v7 SQL 保留属迁移链兼容，不构成「声称」。
- 覆盖率：`coverage = 6 / 6`。无 trust_prior 项（全部本地单测可复验）。

reviewed_scope: d3c98960e942ff46

verdict: PASS

## Round 2 (2026-08-23 04:10 UTC+8)

- round：2
- target：`git diff 80398ac99707accadaa30d343374f813873da901`（Round 1 后 f001..f004 已修，本轮对修复后全 diff 重审）
- 复验方式：重跑核心测试 405 个全部通过（见下），另逐文件核对修复位点与全 diff。

### 前轮 finding 复核（以 diff 为准）

- **f001（已消除）**：`subscription-service.test.ts`「host=macos 时同样可读取本机 mac 会话」it 内 query 的 `env` 已与 `resolve_session_file` 同步改为 `"mac"`（原 `- env: "local"` → `+ env: "mac"`）。mac env 的 query→extract-cache→文件读取链现在被真实触达。重跑该文件 33 tests 全绿。
- **f002（已消除）**：`SessionShell.test.tsx:242` 夹具 `env: "local"` → `"win"`（diff 可见）；`collector.test.ts` prune 测试两 key 改为 `"old|win|m-old"` / `"fresh|linux|m-fresh"`。两处均不再产出 `local`。重跑两文件全绿。
- **f003（已消除）**：`token-stats-store.test.ts` migration v8 describe 顶部新增 `HOST_DEFAULT_ENV`（按 `process.platform` 派生，注释明确「跨平台 CI 不硬编码 linux（t437 review f003）」），`session("null-sess")` / `daily_env("orphan")` / `record_env("rec-null")` 三处断言均改用派生值。宿主默认不再平台耦合。重跑 store 110 tests 全绿（本机 linux 下派生值 = "linux"，与生产 `host_default_env()` 逐字一致）。
- **f004（已消除）**：`token_stats_dashboard.test.ts` 新增「filters summary, rollup and sessions by platform (t437: platform → env)」：真实 upsert 三平台数据（linux/wsl/win）→ `query_dashboard({ platform: "linux" })` → 断言 `current.tokens=18/sessions=1/calls=1`、rollup 每行 `env==="linux"`、sessions items 1 条 env=linux。比建议更全（summary/rollup/sessions 三处同查），直接触达 store 侧 `platform→env` 过滤分支（token-stats-store.ts 669-671 行）。重跑 22 tests 全绿。

### 改测方向复核

无「迁就实现」的改测。全部 env 字面量替换均对应新枚举语义（windows→win、POSIX→linux、macos→mac、wsl 不变）；v8 迁移测试取代 v7 测试且覆盖更全（分类四分支 + local/win 碰撞 merge + 幂等 + 聚合保行）；本轮新发现的两处残留均属机械替换漏改，非迁就实现。

### 本轮新发现

#### t437_test_f005 - SessionLibrary summaries mock key 残留 `local`，b/c 摘要路径实际不可达

- 严重度：minor
- 锚点：AC-005（session-history 会话 env 的 `local` 字面量清零）+ 测试可信（it 宣称验证「全部可见卡片」只验证了一张）
- 位置：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx:1212-1213`（it「批量摘要：一次 summaries 更新全部可见卡片（t239）」）
- 问题：mock 返回的摘要 Record 中 `"claude_code|linux|a"` 已改，但 `"opencode|local|b"` / `"grok|local|c"` 两 key 漏改仍含 `local`。renderer 消费侧 `key_of(s) = source|env|id`（session-library-utils.ts:24-25），会话 env 为 `linux` → 取 `opencode|linux|b` → mock Record 无此 key → `summaries[key_of(s)] ?? ""`（SessionList.tsx:128）→ b/c 摘要空串。it 只断言了 a 的摘要文本（1232 行）与 summaries 调用参数（1219-1227，已改 env=linux），b/c 的摘要显示从未被验证——测试宣称的「全部可见卡片」实际只验证 a。不掩盖生产缺陷（生产 key 拼接一致），f002 同类残留（第 3 处）。
- 建议：两 key 改为 `"opencode|linux|b"` / `"grok|linux|c"`，并补 b/c 摘要文本断言（当前断言面小于 it 宣称）。

#### t437_test_f006 - session-locator 测试 describe/it 名称与注释残留「local 源」旧词

- 严重度：minor
- 锚点：AC-005 精神（测试代码描述与平台枚举语义对齐）+ 命名与行为不符
- 位置：`tests/unit/main/core/session-history/session-locator.test.ts:182`（describe「非 Windows 宿主 local 源返回 POSIX 路径」）、`:183`（it「linux host：…local 源按 homedir 解析」）、`:187`（注释「若实现误用 win_home 作 local 根」）、`:241`（it「macos host：local 源同样按 homedir 解析」）
- 问题：四处的断言均已平台化（env=linux/mac、win_home 分支测 win env），但描述性文本仍称「local 源」。纯命名/注释过时，无行为影响（`wsl.localhost` UNC 与 `.local/share` 数据目录名属真实概念，不在其列）。
- 建议：把「local 源」改为「linux/mac 平台源」（或对应 env）。

### 结论

- 前轮 finding 复核：f001..f004 全部已消除（以 diff 与重跑为准），无「换形式弱化」。
- 改测方向复核：无
- 本轮新发现：2 条（f005/f006，全 minor）
- 未进表的提示：
    - `token_stats_view.test.tsx:430/437`「reuses a cached dashboard」it 的 mock 命名 `dashboard("local")` 与 selectOptions("win") 并存、断言文本 "local"——该串是 title 数据非 env，无行为问题（Round 1 已提示，未改，可顺手改名）。
    - 生产 `host_default_env()`（未导出）三行三元逻辑在测试以 `HOST_DEFAULT_ENV` 复制；`legacy_env_from_directory` 已导出并直接单测，宿主默认属 process.platform 读取无法注入，复制三行可接受。
    - v7 迁移 SQL 保留为迁移链兼容、注释已改写（AC-006 合规，Round 1 已核）。
- 总体判断：前轮 4 条 minor 全部修到位（f004 修复甚至比建议更全）；本轮 2 条新 minor（f005 mock key 残留 + f006 命名过时）不阻断；测试可信度维持，PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- 重跑命令：`npx vitest run` 覆盖 13 个测试文件（store 110 / collector 49 / subscription-service 33 / token-stats.test.ts 31 / token_stats_dashboard.test.ts 22 / token_stats_view.test.tsx 37 / chart-data 65 / watcher 22 / SessionShell 12 / paths 11 / shared dashboard 7 / collector-local 3 / baseline 3），**405 tests 全绿**（3.0s + 2.56s 两批）。
- AC-001：`re_verified`。重跑 `token-stats.test.ts` + `paths.test.ts` schema 断言全绿；`tokenStatsEnvSchema` 四值枚举、`local` 拒绝（含 dashboard platform schema 同步断言）。
- AC-002：`re_verified`。重跑 `token-stats-store.test.ts` v8 迁移测试全绿；核对迁移 SQL（分类四分支、local+win 碰撞 merge、buckets 重建、hour_rollup 清空置 unready）、断言行数/聚合/幂等/HOST_DEFAULT_ENV。
- AC-003：`re_verified`。重跑 collector/collector-local/watcher/subscription-service 全绿；host=macos 新测试（平台五源 mac、wsl unavailable、无 local 残留）、collector env 传参断言、`pick_strategy` 平台化 it.each（win/linux/mac→watch）。
- AC-004：`re_verified`。重跑 `token_stats_view.test.tsx` 全绿（筛选选项 `["all","win","wsl","linux","mac"]`、prefs 残留 local 回退 all）；f004 新 dashboard 过滤测试直接验证 store 侧 `platform→env`。
- AC-005：`re_verified`。重跑 paths/session-locator 守卫测试全绿（正则已翻转为扫 `local`）；手工 grep 确认 src 无 `env:"local"` 类字面量（仅迁移 SQL `env='local'` 单引号条件，迁移链输入合规）；tests 侧残留仅 f005（mock key）与合法畸形值/注释，Round 1 两处已清。
- AC-006：`re_verified`。store.ts v7 注释已改写（t308 命名被 v8 逆转废止，仅迁移链兼容），无「Windows 原生源叫 local」表述。
- 覆盖率：`coverage = 6 / 6`。无 trust_prior 项。

reviewed_scope: d3c98960e942ff46

verdict: PASS

## Round 3 (2026-08-23 04:09 UTC+8)

- round：3（窄范围复核：f005/f006 修复）
- target：`git diff 80398ac99707accadaa30d343374f813873da901`（HEAD 未变，修复在工作区；指纹已随修复变更）
- 复验方式：逐位点核对 diff + 实跑两个测试文件 59 tests 全绿

### 前轮 finding 复核

- **f005（已消除）**：`SessionLibrary.test.tsx:1211-1213` mock 摘要 Record 三 key 全改为 `claude_code|linux|a` / `opencode|linux|b` / `grok|linux|c`，`local` 残留清零；`summaries` 调用参数断言（1219-1227）env 同步 `linux`，b/c 会话 `key_of = source|env|id` 拼接现在真实命中 mock key，摘要路径可达。重跑该文件 42 tests 全绿。f005 建议中的「补 b/c 摘要文本断言」未执行（1232 行仍只断言「摘要 a」）——属建议的可选扩展，非 finding 核心（AC-005 local 残留与路径不可达均已消除），转未进表提示。
- **f006（已消除）**：`session-locator.test.ts` 7 处 describe/it/注释全平台化——182 describe「非 Windows 宿主 linux/mac 源」、183 it「linux 源按 homedir」、187 注释「误用 win_home 作 linux 根」、241 it「mac 源同样按 homedir」、277 describe「win 源基于 win_home」、286 it「win 源基于 win_home + win32 拼接」、318 it「win 源不受影响」。剩余 `local` 字样均为合法概念：`.local/share` 数据目录名（122/210/291/306）、`wsl.localhost` UNC（223/228/233/238/257/303/309/312）、AC-005 守卫测试本身的正则与 it 名（337-351）。重跑该文件 17 tests 全绿。

### 改测方向复核

无「迁就实现」的改测。两文件改动均为：mock 夹具与生产 key 拼接对齐（f005，AC-005 要求 local 清零，断言方向不变）+ 命名/注释平台化（f006）。守卫测试由 t310 win 守卫翻转为 t437 local 守卫是 AC-005 语义所需，非弱化。

### 本轮新发现

0 条。

### 结论

- 前轮 finding 复核：f005/f006 均已消除（以 diff 与重跑为准），无「换形式弱化」；f005 建议的 b/c 摘要断言增强未执行，属可选扩展不阻断。
- 改测方向复核：无
- 本轮新发现：0 条
- 未进表的提示：
    - f005 建议第二部分（补 b/c 摘要文本断言）未执行：`SessionLibrary.test.tsx:1232` 仍只断言「摘要 a」，it 宣称「全部可见卡片」的文本断言面只覆盖 a；b/c 由 summaries 调用参数断言（1219-1227）间接覆盖，无行为缺口，可选扩展。
- 总体判断：两处修复到位、59 tests 全绿、无新问题，PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-005：`re_verified`。重跑 `SessionLibrary.test.tsx`（42）+ `session-locator.test.ts`（17）共 59 tests 全绿；手工核对 f005 mock key 三处（1211-1213）与 f006 7 处命名/注释（182/183/187/241/277/286/318）无 env `local` 残留，残留 local 均为合法概念（`.local/share`、`wsl.localhost`、守卫正则）。
- AC-001/002/003/004/006：沿用 Round 2 复验证据（同 review 会话全量重跑 405 tests）；本轮窄范围未重跑这些位点，f005/f006 修复不涉及。
- 覆盖率：`coverage = 6 / 6`。本轮 re_verified 仅 AC-005（f005/f006 相关面），其余依赖 Round 2 同会话重跑证据。

reviewed_scope: f8e1dc627217cdfe

verdict: PASS

## Round 4 (2026-08-23 04:20 UTC+8)

- round：4（文档轮，test 视角）
- target：`git diff 80398ac99707accadaa30d343374f813873da901`（Round 3 后仅 docs 改动：blueprint 三件 + specs 三件 + specs_index + d048 + s032 + pending p205；无测试改动，git status 确认 src/tests 文件清单与 Round 3 一致）
- 复验方式：逐文件读 docs diff，文档中测试相关陈述与已审测试断言逐条比对

### 文档陈述 ↔ 测试断言核对（全部一致，无误导）

|文档陈述|测试证据|
|---|---|
|v8 迁移分类四分支（盘符→win、`/Users/`→mac、POSIX→linux、NULL/孤儿→宿主默认），`api.md` 2.4 迁移链|`token-stats-store.test.ts:1164-1178`（delta 四类）与 1260-1276（断言分类正确、`HOST_DEFAULT_ENV`）|
|宿主默认 win32→win / darwin→mac / 其他→linux（`api.md` v8、`decisions.md` 022、d048）|store 测试 1152 注释 + `HOST_DEFAULT_ENV` 派生（Round 2/3 已核）|
|碰撞 merge：token MAX、started_at MIN、ended_at MAX（`api.md` v8）|store 测试 1277 注释「input_tokens MAX(1000,111)=1000、started_at MIN、ended_at MAX」+ 184 行 MIN/MAX 断言|
|buckets 由迁移后 daily 整体重建、行数/token 不减少（`api.md` v8、AC-002）|store 测试 1309-1317「buckets 重建后合计 == 迁移前 daily 合计」|
|hour_rollup 清空置 `hour_rollup_ready=0` 走异步回填（`api.md` v8、`decisions.md` 022）|store 测试 1333-1346（清空计数 + unready 断言）|
|`PRAGMA user_version = 8`（`api.md` v8）|store 测试 1061/1502 `user_version` = 8|
|env 枚举 `win\|wsl\|linux\|mac`（`api.md` buckets/sessions 表注释、`architecture.md`、`domain.md` §3.4、`decisions.md` 022）|schema 单测 + 全量测试 405 个（Round 2）|
|UI 环境列 Windows/WSL/Linux/macOS、筛选四值 + prefs 残留旧值回退「全部」（`ui.md`）|`token_stats_view.test.tsx` 选项断言（Round 2 核）+ 282 行「prefs 残留 local 回退 all」|
|homedir 只服务 linux/mac 源、win_home 只服务 win 源（`architecture.md` 4.1）|`session-locator.test.ts`（Round 3 核：linux/mac 走 homedir、win 走 win_home、wsl UNC）|
|grok 双源 `grok_wsl` / `grok_linux`/`grok_mac`，任一宿主只一个平台变体参与（`architecture.md` 4.1、`domain.md` §3.2、`api.md` 2.4、`decisions.md` 022）|`collector.test.ts:655`（grok_linux 参与）、1117-1130（host=macos 平台五源 env=mac 全 ok、wsl 五源 unavailable、无 local 残留）；`collector.ts:250-251` 注释（平台 key 动态派生 `*_win/_linux/_mac`）|
|连接器 observation `source: "local"` 属另一概念不受影响（`domain.md` §3.4、`decisions.md` 022）|非范围声明；collector 无相关改动|
|d048/s032 实测数据（sessions local 2435、records 559835、盘符 212639 / POSIX 347196）|两文件自洽，且如实标注限制「本机库无 `/Users/` 与 UNC 形态，mac 规则靠路径约定推断」——诚实披露，不误导|
|specs_index 挂 t437|文件本身|

### 前轮 finding 复核

无新增代码改动，f001-f006 状态维持（Round 1-3 结论）。

### 改测方向复核

无（本轮无测试改动）。

### 本轮新发现

0 条。

### 结论

- 前轮 finding 复核：f001-f006 维持已消除/已处置状态，本轮无代码改动不涉及。
- 改测方向复核：无
- 本轮新发现：0 条
- 未进表的提示：
    - p205（pending todo）登记 `src/main/index.ts:489-490/514` 两处过期 local 注释（范围外、不在 t437 diff 内、纯注释修订）。处置正确：注释非 `local` 字面量，不违反 AC-005；登记未开，留待后续。仅提示：该文件若后续进 task diff，应随改。
    - d048/s032 的 mac 分类规则（`/Users/` 前缀→mac）无真实库形态样本，靠路径约定推断（报告已如实披露）；macos 宿主分类在 store 迁移测试以 `delta({ directory: "/Users/u/proj" })` 覆盖，行为路径有测试锚定，不构成缺口。
- 总体判断：文档轮所有测试相关陈述（迁移 v8 行为、UI 筛选、env 枚举、平台源 key）与已审测试断言逐条一致，无误导、无夸大；0 finding，PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 4）

- AC-001：`re_verified`。`api.md` env 四值表注释 ↔ schema 单测（Round 2）；本轮读 diff 确认表注释已更新 `win|wsl|linux|mac`。
- AC-002：`re_verified`。`api.md` v8 迁移描述（分类/merge/buckets 重建/hour_rollup 清空/user_version=8）逐条对上 store 测试断言（上表）。
- AC-003：`re_verified`。`architecture.md`/`domain.md` grok 平台源 `grok_linux/grok_mac` ↔ `collector.test.ts:1117-1130`（host=macos 五源 env=mac）+ collector.ts 注释。
- AC-004：`re_verified`。`ui.md` 环境列与筛选四值 + prefs 回退 ↔ `token_stats_view.test.tsx`（Round 2 + 本轮 282 行）。
- AC-005：`re_verified`。文档表述与 AC-005 无冲突；p205 登记的 index.ts 残留是注释非字面量，且走 pending 登记，合规。
- AC-006：`re_verified`。`decisions.md` 022 明确「ADR 016（t308）的 local=进程所在 OS 语义废止」「t437 逆转废止」与 `architecture.md` 4.1 注释一致，无「Windows 原生源叫 local」表述。
- 覆盖率：`coverage = 6 / 6`。本轮全部以已审测试断言 + 本轮抽查代码位点为据，无 trust_prior 项。

reviewed_scope: e1470192903fa97f

verdict: PASS

## Round 5 (2026-08-23 04:26 UTC+8)

- round：5（窄复核：code 轴 f002 文档排序修复，test 视角）
- target：`git diff 80398ac99707accadaa30d343374f813873da901`
- 复验方式：指纹验证 + status 文件清单对比 + 两处重排位点逐行确认

### 指纹与改动面验证

- 当前指纹实测 `2aa5f2cafcdbc4c8`，与 prompt 一致，已写本轮 reviewed_scope。
- `git status --short`（排除 t437 task 目录）与 Round 4 文件清单完全一致（仅 d048/s032/p205 的暂存标记显示差异），src/tests 零变化，测试文件零改动。
- 两处重排确认：
    1. `docs/blueprint/domain.md`：§3.4「token-stats env 平台标签（t437）」由 §3.2 之前移至之后（现 59 行 §3.2 grok → 68 行 §3.4），文字与 Round 4 完全一致（四值表、local 废止、d048 引用、connector `source: "local"` 另一概念）。
    2. `docs/specs/ai-cli-token-stats-api.md`：迁移列表恢复 v2→v3→v4→v5→v6（278-282）→ v7（283）→ v8（284）升序；v7/v8 条目文字与 Round 4 完全一致，v8 描述（分类四分支、merge token MAX/started_at MIN/ended_at MAX、buckets 重建、hour_rollup 清空、user_version=8）仍与已审 store 测试断言逐条吻合。
- 其余 docs（decisions/architecture/ui/specs_index/d048/s032）diff 内容与 Round 4 逐字一致，无新增变化。

### 前轮 finding 复核

f001-f006 状态维持（Round 1-4 结论）；code f002 为 code 轴 finding，test 视角确认其修复（排序重排）不改变任何测试相关语义。

### 改测方向复核

无（本轮零测试改动）。

### 本轮新发现

0 条。

### 结论

- 前轮 finding 复核：test 轴 f001-f006 维持已消除/已处置；code f002 修复位点（两处文档重排）核实为纯位置移动、文字零变化，不触及测试语义。
- 改测方向复核：无
- 本轮新发现：0 条
- 未进表的提示：
    - `domain.md` §3.3（47 行）在 §3.1（51 行）/§3.2（59 行）之前的编号乱序为 anchor 版本（80398ac）既有问题，非 t437 引入、亦非本轮 f002 范围；纯文档编号顺序，无测试影响，可留待后续文档维护。
- 总体判断：本轮改动仅为两处文档位置重排，迁移列表 v8 文字与已审测试断言仍一致，无新问题，PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 5）

- 本轮为窄复核：无代码/测试改动，AC-001~006 全部沿用 Round 4 复验结论（6/6 re_verified，无 trust_prior）。本轮额外确认 `api.md` 迁移列表 v2→v8 升序完整、v8 条目文字未变（AC-002/AC-006 相关陈述仍与已审断言一致），`domain.md` §3.4 文字未变（AC-001/AC-005 相关）。
- 覆盖率：`coverage = 6 / 6`。

reviewed_scope: 2aa5f2cafcdbc4c8

verdict: PASS
