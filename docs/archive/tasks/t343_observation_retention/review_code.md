# Task review t343（reviewer_focus: 代码）

- task：`t343_observation_retention`
- spec：`docs/tasks/t343_observation_retention/spec.md`
- diff_anchor：`26c2a611ec87d7dbddfdb567e2abe46717a9080b`
- target：`git diff 26c2a611ec87d7dbddfdb567e2abe46717a9080b`
- round：1
- reviewed_at：2026-08-13 17:06 UTC+8
  reviewed_scope: 8ceba0e6e64d0baf

## Findings

### t343_code_f001 - retention 预算读启动快照 currentConfig，运行时修改 cacheMaxMb 不生效（AC-002 半接入）

- 严重度：important
- 锚点：AC-002「cacheMaxMb 设置被读取并影响留存预算」；观察到的差距——设置只在启动时被读取，运行时 UI 修改不进入留存预算，可能按旧（更小）预算过度删行。
- 位置：`src/main/index.ts:995`（读取点），`src/main/index.ts:227/247/294/298`（currentConfig 全部赋值点，均在启动期），对照 `src/main/index.ts:936`（运行时保存只更新 currentConfigSnapshot）。
- 问题：`retention_prune` 闭包每次触发读 `currentConfig.cacheMaxMb`，但 `currentConfig` 是 `app.whenReady` 启动期快照，启动后（config 保存路径 `save_config` 只做 `currentConfigSnapshot = next`，index.ts:936）从不重新赋值；留存定时器 24h 持续用同一旧值。场景：启动时 cacheMaxMb 小（如 50MB → max_rows=102400 起）、数据量大导致收紧生效；用户运行时在 data_section（data_section.tsx:43 `save_config({...config, cacheMaxMb: mb})`）调大缓存上限，期望保留更多历史——下一次每日 prune 仍按启动时小预算收紧，继续删除用户当前配置明确要求保留的行，形成相对当前配置的数据过度删除（数据删除不可逆）。index.ts:990 注释「cacheMaxMb 读取自 config（data_section 已暴露 UI）」暗示应跟随 UI，实现却违背该意图。
- 建议：改为读运行时快照，一行改动：`run_retention_prune(observationStore, currentConfigSnapshot.cacheMaxMb, Date.now())`（闭包定义于 index.ts:993，晚于 currentConfigSnapshot 声明，可捕获最新绑定）；或注入 `get_config: () => currentConfigSnapshot.cacheMaxMb` 由 retention 侧按需读取。

### t343_code_f002 - retention 将 cacheMaxMb=0 视为「不限制」与 config schema min(1) 矛盾，0 分支生产不可达且 UI「不限制」触发下次启动 schema 校验失败

- 严重度：minor
- 锚点：AC-002 接入路径的语义一致性问题；非本 diff 引入根因，但本 diff 的注释与分支显式声明了 0=不限制。
- 位置：`src/main/core/observation/observation-retention.ts:10,20`，对照 `src/main/core/config/types.ts:87`（`cacheMaxMb: z.number().int().min(1).max(10000).optional()`）、`src/renderer/views/settings-view/sections/data_section.tsx:38`（「不限制」→ `save_config({...config, cacheMaxMb: 0})`）、`src/main/core/config/config-store.ts:133`（load 时 `appConfigurationSchema.safeParse`）。
- 问题：retention_params 注释与 `!cache_max_mb || cache_max_mb <= 0` 分支声明「0/未设为不限制」，与 UI 的「不限制」选项一致；但 config schema 下限是 1，0 被 schema 拒绝。save 路径（enqueueSave）不校验可把 0 落盘，下次启动 load 的 safeParse 因 cacheMaxMb=0 失败 → 整份 config schema 不匹配 → 走备份恢复（config-store.ts:313）。即「不限制」选项会污染 config 合法性，而 retention 的 0 分支在合法配置下永远不可达（未设置时是 undefined，走日期阈值，语义正确）。
- 建议：为让 AC-002 的接入语义闭环，把 schema 下限放宽为 `.min(0)`（使 UI「不限制」可持久化、retention 0 分支可达）；否则删除/改写 retention 的 0=不限制注释与分支，并修复 UI 存 0 导致 load 失败的前置问题。此为 pre-existing schema/UI 张力，建议随本 task 一并处置或登记 follow-up。

### t343_code_f003 - 收紧循环遇空 1 天窗口即 break，稀疏数据下提前停止致预算未达成

- 严重度：minor
- 锚点：行为缺陷（预算收紧不彻底）；AC-001 无直接冲突，属于超预算降级路径的边界不完善。
- 位置：`src/main/core/observation/observation-retention.ts:48`
- 问题：收紧循环 `while (count > max_rows && cutoff < now_ms)` 内 `if (additional === 0) break;`。`additional === 0` 仅表示窗口 `[(cutoff-1d), cutoff)` 无行，不代表 `[cutoff, now)` 无行；当数据存在时间空隙（如近 3 天 + 90 天前两簇、中间空窗），首段空窗即 break，`count` 仍 > `max_rows`，表继续超预算。循环本身有 `cutoff < now_ms` 上限（≤90 步）保证终止，break 属多余且过早。
- 建议：删除该 break（`cutoff < now_ms` 已保证终止）；若确需提前退出，改为 `if (additional === 0 && count === deps.count_observations())` 无意义——直接删 break 即可，最坏多跑 90 步 DELETE。

## 结论

- 前轮 finding 复核：本轮为首轮，无。
- 本轮新发现：3 条（1 important + 2 minor）。
- 未进表的提示：
    - 文件过大：`src/main/index.ts` 1371 行（本 task 净增 27），超过实现源码 important 阈值 800；但为 Electron 主进程入口一体化文件、未产出可观测缺陷，按降级规则仅提示。`observation-retention.ts`（60 行）、`observation-retention.test.ts`（99 行）均远低于阈值。
    - 复杂度：`run_retention_prune` 手算 CC≈4（1 基 + 1 if(max_rows) + 1 while + 1 if(additional)），未达提示阈值。
    - 范围外观察：AC-001「每日定时触发」仅有单测（run_retention_prune 纯函数），index.ts 的 setInterval 接线无集成测试——属测试 reviewer 职责，此处只提示。
    - 另：`retention_timer.unref()` 与 before-quit `clearInterval` 均正确；闭包块内 `retention_timer = null` 与声明处重复初始化，无害。
- AC 复验方式：
    - AC-001（prune 有生产调用方，启动+每日定时，删早于阈值行）：`re_verified`——index.ts:1004 启动即调 `retention_prune()`、index.ts:1005 setInterval 24h；observation-retention.ts:39 `deps.prune(older_than_ms)` 且 `older_than_ms = now - 90d`（:19）；observation-store.ts:216 DELETE `observed_at < ?`。已核实接线与阈值语义。
    - AC-002（cacheMaxMb 被读取并影响预算）：`re_verified`（部分）——index.ts:995 传入 `currentConfig.cacheMaxMb`，retention_params 折算 max_rows（observation-retention.ts:21）并驱动收紧循环；但存在 f001 运行时失效问题。
    - coverage = 2 / 2（AC-002 为部分复验，f001 即其失效面，无 trust_prior 项）。
- 总体判断：AC-001 完整落地，AC-002 启动期接入成立但运行时失效（f001），且存在 0 语义矛盾（f002）与收紧循环边界（f003）；f001 为未解决 important → FAIL。
- 系统性 follow-up：建议标题「config schema cacheMaxMb 下限放宽至 0，闭合『不限制』UI 持久化」，slug `cache_max_mb_allow_zero`；阻断性：minor（pre-existing，非本 task 阻塞）。

verdict: FAIL

## Round 2 (2026-08-13 17:20 UTC+8)

reviewed_scope: 2e32009b3e15a5fb

### 前轮 finding 复核（以 git diff 26c2a611 为准）

- t343_code_f001（important，retention 读启动快照）：**已消除**。index.ts:992-1000 改为 `create_retention_scheduler({ prune, count_observations, get_cache_max_mb: () => currentConfigSnapshot.cacheMaxMb, now: () => Date.now() })`。`currentConfigSnapshot` 声明于 index.ts:323（`let` 可变绑定），运行时 config 保存更新点 index.ts:804-810（settingsBounds）与 index.ts:934-940（save_config `currentConfigSnapshot = next`）均在 retention 接线（index.ts:989-1000）之前声明、之后存活，闭包按最新绑定读取 → 运行时调 cacheMaxMb 下次触发立即生效。旧读取点 `currentConfig`（启动快照）已移除：index.ts diff 中 `run_retention_prune(observationStore, currentConfig.cacheMaxMb, ...)` 不再存在，替换为 get_cache_max_mb 注入。
- t343_code_f002（minor，cacheMaxMb=0 schema 矛盾）：**遗留登记，非阻断**。`docs/pending/todo/p158_cachemaxmb_zero_schema_contradiction.md` 已建，内容引用 types.ts:87 / data_section.tsx:38 / observation-retention.ts:20，处理状态「未开」。retention.ts 中 0=不限制分支与注释原样保留，属已登记 pending 的 pre-existing 问题。
- t343_code_f003（minor，收紧循环空窗口 break）：**遗留登记，非阻断**。`docs/pending/todo/p159_retention_prune_early_break.md` 已建，内容引用 observation-retention.ts:48 与改进方向，处理状态「未开」。`if (additional === 0) break` 原样保留，属已登记 pending 的边界缺陷（cutoff<now 上限兜底，非数据破坏）。

### 本轮新发现

无新增 blocking。代码质量扫描：

- `create_retention_scheduler`（observation-retention.ts:59-114）：start() 幂等（timer===null 才 setInterval）；stop() 清 timer 置 null；unref 正确；run_now 的 try/catch 包裹 run_retention_prune 及 deps 调用，异常只记录不中断定时器。无资源泄漏、无并发竞态。
- index.ts before-quit 调 `retention_scheduler.stop()`（index.ts:1295-1299）清理正确，`retention_scheduler = null` 置位完整。
- 文件大小：retention.ts 114 行、index.ts 净增 21 行、测试 171 行，均远低于阈值，无提示项。
- 范围外观察（结论提示，不进 finding 表）：集成测试 4 例（start 立即执行 / 24h 周期 / stop 清理 / 异常吞并）均用 fake timers 推进并断言 prune 调用次数，真实有效；但未覆盖「get_cache_max_mb 返回值动态变化 → 预算切换」场景（测试维度，归 test reviewer；f001 的 index.ts 接线为 Electron 主进程，无法单测，已代码级 re_verified）。

### AC 复验方式

- AC-001（prune 生产调用方，启动+每日定时，删早于阈值行）：`re_verified`——index.ts:999 `retention_scheduler.start()` 启动即 run_now；observation-retention.ts:83 `setInterval(run_now, RETENTION_INTERVAL_MS)` 24h；阈值 `now - 90d`（retention.ts:19）；observation-store.ts:216 DELETE `observed_at < ?`。测试集成 4 例验证接线。
- AC-002（cacheMaxMb 被读取并影响预算）：`re_verified`——get_cache_max_mb 动态读 currentConfigSnapshot（index.ts:996），retention_params 折算 max_rows 并驱动收紧（retention.ts:21,41-52）；运行时更新 currentConfigSnapshot 路径已核实（index.ts:804-810, 934-940）。f001 修复闭环。
- coverage = 2 / 2。

### 总体判断

f001（唯一 important blocker）已消除（改读 currentConfigSnapshot），f002/f003 minor 已按流程登记 pending 遗留；无未解决 critical/important。接线提取为可注入 scheduler 模块降低 index.ts 膨胀，测试 4 例真实有效。PASS。

verdict: PASS
