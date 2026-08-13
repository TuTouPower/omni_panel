# Task review t348（reviewer_focus: 通用）

- task：`t348_token_stats_timezone`
- spec：`docs/tasks/t348_token_stats_timezone/spec.md`
- diff_anchor：`9f2c97399ef1e1b1e5ee633ff334837ae8eb4724`
- target：`git diff 9f2c97399ef1e1b1e5ee633ff334837ae8eb4724`
- round：1
- reviewed_at：2026-08-13 21:55 UTC+8
reviewed_scope: 458f262c2d88aa59

## Findings

### t348_gen_f001 - 测试套件未固定 TZ，非 UTC+8 机器 10 例失败（AC-002 未达成）

- 严重度：important
- 锚点：AC-002「测试固定 `TZ=Asia/Shanghai` 并含非 UTC+8 用例，任何整点时区机器都红/绿一致」；spec 范围「测试固定 `TZ=Asia/Shanghai`」
- 位置：`vitest.config.mts:12-61`、`tests/unit/renderer/lib/token-stats/aggregate.test.ts:131-207`、`tests/unit/renderer/lib/token-stats/chart-data.test.ts:499-508`（及 prepareBarData time 桶用例）
- 问题：测试环境未固定时区。`vitest.config.mts` 无 `env.TZ`，`package.json` test 脚本、`tests/smoke/setup.ts` 均未设置 TZ。本 diff 将 `bucketize`/`prepareHeatmapData` 改为 UTC+8，但既有测试仍用本地时区日期字面量（如 `new Date("2026-07-18T00:00:00")`、`new Date("2026-07-13T14:30:00")`），两类测试在新实现下跨 TZ 不一致。实测：
  - `TZ=Asia/Shanghai npx vitest run tests/unit/renderer/lib/token-stats/` → 108 全过
  - `TZ=America/New_York npx vitest run tests/unit/renderer/lib/token-stats/` → 10 失败（aggregate bucketize 5 例 + chart-data prepareBarData time 桶 4 例 + prepareHeatmapData 1 例）
  - 即「任何整点时区机器都红/绿一致」不成立：UTC-5 机器整仓 token-stats 渲染端测试为红。
- 建议：按 spec 在 `vitest.config.mts`（renderer project）加 `env: { TZ: "Asia/Shanghai" }`（或 test 脚本前缀 `TZ=Asia/Shanghai`），使既有本地字面量测试确定性通过；同时可把新用例保持 `Date.UTC` 引用（已 TZ 无关）。注意仅设 TZ 后既有测试通过，但「非 UTC+8 用例」仅在非 UTC+8 环境下运行才真正暴露本地时区回退，属测试有效性提示，非本 finding 阻断点。

### t348_gen_f002 - schema `date` 注释未随实现改为 UTC+8，且新注释虚假声称一致（AC-003 未达成）

- 严重度：important
- 锚点：AC-003「`date` 字段 schema 注释与 reader 实现口径一致」；spec 范围「`token-stats.ts` 的 `date` 字段注释与实现/测试口径统一（本地或 UTC 二选一）」
- 位置：`src/shared/types/token-stats.ts:114`、`src/main/core/token-stats/reader-utils.ts:4-11`
- 问题：`calendar_date_of` 已改为 UTC+8（`ts + 8*3600000` 后取 `getUTC*`），但 schema `date` 注释仍是「UTC date YYYY-MM-DD」。UTC date ≠ UTC+8 date：例如 `2026-08-12T20:00:00Z` 的 UTC date 为 `2026-08-12`，UTC+8 date 为 `2026-08-13`。二者对 `date` 字段的值域描述不一致，契约消费者按注释算 UTC date 会与实际存储值错位。本 diff 未改 `token-stats.ts`（范围明列此项）。更甚：reader-utils.ts 新注释声称「与 schema `date` 注释『UTC date』…一致」，事实错误——实现是 UTC+8，不是 UTC。
- 建议：把 `token-stats.ts:114` 注释改为「UTC+8 date YYYY-MM-DD of the usage」；同步修正 reader-utils.ts:4-6 注释，勿再引用「UTC date」为一致依据。

### t348_gen_f003 - `prepareBarDataFromBuckets` 日轴仍按 UTC 建，与 UTC+8 bucket_date 错位（AC-001 未覆盖的兄弟路径）

- 严重度：minor
- 锚点：AC-001「渲染端 bucket 边界/小时标签统一按 UTC+8 计算，与 token-stats-store 一致（非 UTC+8 机器不落错桶）」；本 finding 当前不可达，仅潜在，不按 blocking 判
- 位置：`src/renderer/lib/token-stats/chart-data.ts:320-332, 342-345`
- 问题：`prepareBarDataFromBuckets` 用 `setUTCHours(0,0,0,0)` 按 UTC 日建轴，再用 `date_idx.get(b.bucket_date)` 匹配服务端 `bucket_date`（本 diff 改 reader 后为 UTC+8 日）。当窗口 `end` 落在 16:00-24:00Z（即 UTC+8 次日的 00:00-08:00）时，该窗最后一段记录归到「次日」bucket_date，不在 UTC 轴内，`if (ci === undefined) continue;` 直接丢弃（如 `end=2026-07-24T20:00Z` 时 `bucket_date="2026-07-25"` 被丢）。`presetRange` 的 `end = Date.now()`（`TokenStatsView.tsx:79`）使该窗口每天约有 8h 概率触发。行 320 注释「(UTC dates, matching bucket_date)」的前提（bucket_date 为 UTC）在 t348 后不再成立。缓解因素：生产 `TokenStatsView.tsx:593-596` 传 `buckets={[]}`（`never[]`），该路径当前未被真数据驱动，故不按 blocking 判。
- 建议：日轴改按 `utc8_day_start` 建（复用 utc8 helper），或改用 `bucketize` 的 day 边界，保证与 UTC+8 bucket_date 对齐；并更新行 320 注释。

### t348_gen_f004 - 过时注释：`prepareHeatmapData` 已改用 utc8_weekday，注释仍称 getDay

- 严重度：minor
- 锚点：文档/配置一致性（注释与代码一致）
- 位置：`src/renderer/lib/token-stats/chart-data.ts:562`
- 问题：本 diff 将 `prepareHeatmapData` 的 `(d.getDay()+6)%7` 改为 `(utc8_weekday(...)+6)%7`，但行 562 注释仍写「matching prepareHeatmapData's getDay() map」。getDay 是本地时区取星期，与 UTC+8 口径不同，注释误导。
- 建议：改为「matching prepareHeatmapData's utc8_weekday() map」。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：4 条（2 important + 2 minor）
- 未进表的提示：
  - `utc8_date_str`（`src/renderer/lib/token-stats/utc8.ts:36-41`）仅被测试引用，生产无调用点，属死导出；`utc8_day_start`/`utc8_hour_start` 被 `utc8_next_day`/`utc8_next_hour` 内部复用，非死代码。是否保留死导出由 implementer 处置，非阻断。
  - AC-001 覆盖核查：`bucketize`、`BarChart.tsx` 小时标签/interval、`chart-data.ts` 热力图均已改 UTC+8；`format.ts` 的 `fmtTime`/`toLocalInput`（会话时间展示与 `datetime-local` 输入控件）、`session-history/markdown.ts:40`、`utils.ts` 的 `format_reset_time`/`relative_time`（用量 reset 展示）均为用户侧本地时间 UI，非 token-stats 聚合桶边界，不改正确，属范围外观察。
  - 服务端口径核查：`token-stats-store.ts` `dashboard_local_boundary`/`dashboard_label`（426-445 行）用 `+8*3600000`，与 `utc8.ts` `UTC8_OFFSET_MS` 一致；`bucket_date` 由 reader `calendar_date_of` 统一为 UTC+8；claude/grok/kimi/opencode 四个 reader 共用该 helper，`TZ=America/New_York` 下 4 reader 测试 75 例全过，reader 改动本身 TZ 无关。
- 总体判断：AC-001 生产路径（dashboard chart_data 走服务端 UTC+8 轴 + 渲染端 bucketize/热力图）已统一；但 AC-002（跨 TZ 测试一致性）与 AC-003（schema 注释口径）未达成，各 1 条 important，需修复后进入下一轮。
- 系统性 follow-up：无（测试 TZ 固定属本 task 范围内整改，无需另建 task）

### AC 复验方式

- AC-001：`re_verified` —— 逐点核对渲染端本地时区调用点：`bucketize`（aggregate.ts:66-103）、`BarChart.tsx:216-238`、`prepareHeatmapData`（chart-data.ts:499-503）均已 UTC+8；store `+28800000`（token-stats-store.ts:426-445）一致；剩余 `format.ts`/`utils.ts`/`markdown.ts` 本地调用属会话时间展示/UI 输入，判范围外。存在潜在 UTC 日轴兄弟路径（f003，minor）。
- AC-002：`re_verified` —— 实测 `TZ=Asia/Shanghai` 108 过、`TZ=America/New_York` 10 失败；`vitest.config.mts` 无 TZ 固定。未达成。
- AC-003：`re_verified` —— `token-stats.ts:114` 注释仍「UTC date」，`calendar_date_of` 为 UTC+8，注释与实现不一致。未达成。

coverage = 3 / 3

verdict: FAIL

## Round 2 (2026-08-13 22:05 UTC+8)
reviewed_scope: 458f262c2d88aa59

本轮以 `git diff 9f2c97399ef1e1b1e5ee633ff334837ae8eb4724` 为准复核前轮 finding，并实测 `TZ=Asia/Shanghai` / `TZ=America/New_York` 下直接 `npx vitest run tests/unit/renderer/lib/token-stats/`。

### 前轮 finding 复核

- **f001（AC-002，重要）——修不彻底，仍存在**：
  - 已修部分：`package.json` test 命令加 `TZ=Asia/Shanghai` 前缀（Linux CI 走 `pnpm test` 时固定）；新增非 UTC+8 用例 `aggregate.test.ts:209-227`（Date.UTC 参考）与 `utc8.test.ts` 7 例，均 TZ 无关，实测 UTC-5 下通过。
  - 未修部分：(a) TZ 固定仅在 `pnpm test` 命令层，`test:watch`（仍是 `vitest`）与 `test:coverage`（`vitest run --coverage`）未固定，用户处置声明「package.json test/test:watch」与实际 diff 不符（test:watch 未改）；(b) 测试主体仍 TZ 依赖——`aggregate.test.ts:131-207` 本地日期字面量、`chart-data.test.ts` prepareBarData time 桶与 prepareHeatmapData 用例未改，实测 `TZ=America/New_York` 下直接 `npx vitest run` 仍 10 失败（与 Round 1 相同的 10 例），红/绿一致性仅靠命令前缀掩盖；(c) Windows CI 风险见新 finding f005。
  - 结论：AC-002「任何整点时区机器都红/绿一致」仅在 Linux + `pnpm test` 入口成立，未完全达成。维持 important。

- **f002（AC-003）——已消除**：`token-stats.ts:114` 注释改「UTC+8 日期 YYYY-MM-DD（…与 bucket_date 一致）」，`reader-utils.ts:4-6` 注释同步为「UTC+8 日期」，两者口径一致，不再有「UTC date」误导。已消除。

- **f003（AC-001 兄弟路径）——错位已修，但引入新缺陷（见 f007）**：`chart-data.ts:317-331` 日轴改按 `utc8_day_start` + `utc8_date_str` 建，与 UTC+8 `bucket_date` 对齐，原 UTC 轴错位消除；两相关测试窗口改 UTC+8 日界（`chart-data.test.ts:328-375`）。但新循环 `while (cursor < utc8_day_start(end))` 在 `end` 非 UTC+8 日界时丢失 end 当天，具体见 f007。生产 reachability 仍潜在（`TokenStatsView.tsx:594` `currentBuckets: never[]`）。

- **f004 —— 已消除**：`chart-data.ts:558` 注释改「matching prepareHeatmapData's utc8_weekday map」。已消除。

### 本轮新发现

### t348_gen_f005 - `TZ=Asia/Shanghai` 前缀写法在 Windows CI 不生效，存在 CI 破坏风险

- 严重度：important
- 锚点：AC-002「任何整点时区机器都红/绿一致」；`ci.yml:41` / `nightly.yml:14` matrix 含 `windows-2022`
- 位置：`package.json:37`
- 问题：`"test": "TZ=Asia/Shanghai node ... && TZ=Asia/Shanghai vitest run"` 用 POSIX shell 环境变量前缀。GitHub Actions 的 `windows-2022` job 默认 shell 为 pwsh（pnpm 在 Windows 用 cmd.exe 执行 scripts），`TZ=Asia/Shanghai <cmd>` 在 cmd/pwsh 中把 `TZ=Asia/Shanghai` 当作命令名，报「'TZ=Asia/Shanghai' is not recognized」使 `pnpm test` 直接失败；即使侥幸解析也不产生 TZ 覆盖，Windows 上回到 TZ 依赖（10 例红）。即 AC-002 的跨时区一致性未在 CI 全 matrix 验证，且现有写法有破坏 Windows job 的实际风险。
- 建议：改用跨平台固定——`vitest.config.mts` renderer project 的 `test.env.TZ = "Asia/Shanghai"`（对 vitest 所有入口含 watch/coverage/IDE 生效），或 scripts 内用 `cross-env TZ=Asia/Shanghai`（已能获得 `cross-env` 时）。删除 package.json 的 POSIX 前缀。

### t348_gen_f006 - prepareBarDataFromHourBuckets 用例由 TZ 无关改 TZ 依赖（测试可信度倒退）

- 严重度：minor
- 锚点：测试可信与覆盖（用例不应无谓引入时区依赖）
- 位置：`tests/unit/renderer/lib/token-stats/chart-data.test.ts:374-498`
- 问题：本轮把该组用例的 `hour_start`/`start`/`end` 从 `2026-07-10T02:00:00Z`（绝对参考，TZ 无关）改为无后缀 `2026-07-10T02:00:00`（按本地时区解析，TZ 依赖）。无后缀版本只在 `TZ=Asia/Shanghai`（或碰巧对齐的时区）下语义正确，撤销了原本与系统时区无关的用例性质；本组用例依赖固定 TZ 兜底而非用例自身确定性。
- 建议：保留 `Z` 后缀绝对参考即可（bucketize 已 UTC+8，`Z` 参考换算一致且任意 TZ 下可过），无需改无后缀；如确需本地字面量，应显式以 `TZ` 固定为前提并加注释。

### t348_gen_f007 - prepareBarDataFromBuckets 日轴在 `end` 非 UTC+8 日界时丢失 end 当天

- 严重度：minor
- 锚点：行为缺陷（数据丢失，潜在路径）
- 位置：`src/renderer/lib/token-stats/chart-data.ts:320-331`
- 问题：`let cursor = utc8_day_start(start); const end_day = utc8_day_start(end); while (cursor < end_day) {...}`。当 `end` 落在 UTC+8 日中间（而非恰在日界）时，`utc8_day_start(end)` 是 end 当天 00:00，`cursor < end_day` 在到达 end 当天前终止，**end 当天被整体丢弃**。实测（.scratch 脚本复刻）：
  - `end=2026-07-12T10:00Z`（UTC+8 07-12 18:00）→ dates 仅 `['2026-07-10','2026-07-11']`，缺 07-12；
  - `end=Date.now()` 形态 `2026-08-13T05:30Z`（UTC+8 08-13 13:30）→ dates 止于 08-12，缺「今天」08-13。
  原实现（`<=` end 日 23:59:59.999）覆盖 end 当天，本轮为对齐 UTC+8 改条件时引入此缺陷。正确条件：`while (cursor <= utc8_day_start(end - 1))`（end-1ms 规避 end 恰在日界时多含次日）。测试仅覆盖日界 `end`（`chart-data.test.ts:331-375`），未覆盖非日界场景。生产 reachability 仍潜在（`TokenStatsView.tsx:594` 传 `never[]`），故不按 blocking 判。
- 建议：改为 `while (cursor <= utc8_day_start(end - 1))`，并补一个 `end` 非日界用例。

## 结论（Round 2）

- 前轮 finding 复核：f001 修不彻底仍存在（重要）；f002/f004 已消除；f003 错位已修但引入新缺陷。
- 本轮新发现：3 条（f005 important + f006/f007 minor）
- 未进表的提示：
  - `utc8_date_str` 仍仅测试引用（生产 `prepareBarDataFromBuckets` 现已实际调用，非死导出）；`utc8_day_start`/`utc8_hour_start` 被内部复用，非死代码。
  - AC-001 生产路径（dashboard chart_data + bucketize + 热力图）复核无回归：`BarChart.tsx:216-238`、`aggregate.ts:66-103`、`chart-data.ts:495-503` 均 UTC+8；reader 4 个测试在 UTC-5 下 75 例全过。
- 总体判断：f002/f004 已修复；AC-002 仍存在未解决的 important（f005 Windows CI 破坏风险 + f001 TZ 固定不彻底），需修复后进入下一轮。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified` —— `TZ=Asia/Shanghai` 与 `TZ=America/New_York` 下直接跑 token-stats 渲染端测试，UTC+8 桶/热力图相关新用例（aggregate 209-227、utc8 7 例）两 TZ 均过；生产路径逐点核对无本地时区调用残留。存在 f007 潜在日轴缺陷（minor）。
- AC-002：`re_verified` —— `TZ=Asia/Shanghai` 直接 vitest 108 全过；`TZ=America/New_York` 直接 vitest 仍 10 失败；`test:watch`/`test:coverage` 未固定；CI matrix 含 windows-2022 而 TZ 前缀为 POSIX 语法。未完全达成。
- AC-003：`re_verified` —— `token-stats.ts:114` 与 `reader-utils.ts:4-6` 注释均为「UTC+8 日期」，与实现一致。达成。

coverage = 3 / 3

verdict: FAIL

## Round 3 (2026-08-13 22:20 UTC+8)
reviewed_scope: e69812248d6ff967

本轮以 `git diff 9f2c97399ef1e1b1e5ee633ff334837ae8eb4724` 为准复核 Round 2 全部 finding，并实测 `TZ=America/New_York` 下 vitest env 覆盖系统时区后的整仓 token-stats 测试。

### 前轮 finding 复核

- **f001（AC-002，重要）——已消除**：`vitest.config.mts` 顶层 `test.env: { TZ: "Asia/Shanghai" }`（第 20 行）对所有 vitest 入口（test/test:watch/test:coverage）与所有 project（renderer/node）生效。实测 `TZ=America/New_York` 下直接 `npx vitest run`：renderer token-stats 108 全过（此前 Round 2 同环境 10 失败），全仓 token-stats（main+renderer+shared）417 全过。测试主体不再依赖系统时区，命令前缀掩盖问题消除。非 UTC+8 用例（`utc8.test.ts` 7 例、`aggregate.test.ts:209-227`）均用 `Date.UTC` 绝对参考，TZ 无关，仍在。
- **f005（Windows CI 破坏，重要）——已消除**：`package.json` 回退至 anchor 态（`git diff 9f2c97... -- package.json` 无输出），POSIX `TZ=` 前缀移除；TZ 固定移入 `vitest.config.mts` env，跨 OS（Windows cmd/pwsh 无 POSIX 依赖）与所有 vitest 入口一致。CI 破坏风险消除。
- **f006（hour bucket 用例 Z→无后缀，minor）——已解决**：`prepareBarDataFromHourBuckets` 用例保持本地字面量（无后缀），在 `vitest.config.mts` env 固定 `TZ=Asia/Shanghai` 下语义确定（本地字面量 = UTC+8），任何系统 TZ 一致（实测 UTC-5 过）。`prepareBarDataFromBuckets` 两用例保留 `Z` 绝对参考（`chart-data.test.ts:331,356`，Date.UTC 明确，TZ 无关）。原担忧（用例 TZ 依赖）在 env TZ 生效前提下消除。防御性提示见「未进表」。
- **f007（日轴循环丢 end 当天，minor）——已消除**：`chart-data.ts:325` 条件改 `const end_day = utc8_day_start(end - 1)` + `while (cursor <= end_day)`。脚本复刻 5 边界验证全部正确：
  - A `end` 恰在日界（07-12T16:00Z）→ `[07-10,07-11,07-12]`，不含 07-13（end exclusive）✓
  - B `end` 非日界（07-12T10:00Z）→ 含 end 当天 07-12 ✓
  - C `end`=Date.now() 形态（08-13T05:30Z）→ 含「今天」08-13 ✓
  - D `start` 非日界 7d 窗（07-17T15:30Z→07-24T15:30Z）→ 8 天覆盖 07-17..07-24，与 bucketize 语义一致 ✓
  - E `end`=日界前 1ms → 含 07-12 不含 07-13（不越界多含次日）✓

### 本轮新发现

无（0 条）。

## 结论（Round 3）

- 前轮 finding 复核：f001/f005/f006/f007 全部消除或解决（0 条未解决 critical/important）。
- 本轮新发现：0 条
- 未进表的提示：
  - `prepareBarDataFromHourBuckets` 用例本地字面量隐式依赖 `vitest.config.mts` 的 env TZ（防御性：若未来移除 env TZ，无后缀字面量会静默变系统时区依赖）。当前 env 固定下确定性成立，不判 finding。
  - e2e（playwright）不走 vitest env，本 diff 未触及 e2e 断言，属范围外。
  - `utc8_date_str`/`utc8_day_start` 现被生产 `prepareBarDataFromBuckets` 实际调用，Round 1 死导出观察已不成立。
- 总体判断：AC-001/AC-002/AC-003 全部达成；无未解决 critical / important；仅剩防御性提示（minor 以下），判 PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified` —— 生产路径逐点核对 UTC+8：`bucketize`（aggregate.ts:66-103）、`BarChart.tsx:216-238`、`prepareHeatmapData`（chart-data.ts:496-500）、`prepareBarDataFromBuckets` 日轴（chart-data.ts:324-328）全部 UTC+8；store `+28800000`（token-stats-store.ts:426-445）一致；f007 边界脚本验证 5 例正确。
- AC-002：`re_verified` —— `TZ=America/New_York` + vitest env 覆盖下直接 `npx vitest run`：renderer token-stats 108 全过、全仓 token-stats 417 全过；`TZ=Asia/Shanghai` 下同套测试同样全过；非 UTC+8 用例（Date.UTC 参考）TZ 无关。红/绿一致达成。
- AC-003：`re_verified` —— `token-stats.ts:114` 与 `reader-utils.ts:4-6` 注释均为「UTC+8 日期」，与 `calendar_date_of` 实现一致。达成。

coverage = 3 / 3

verdict: PASS
