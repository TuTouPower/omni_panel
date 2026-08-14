# Task review t379（reviewer_focus: 代码）

- task：`t379_config_token_stats_schema`
- spec：`docs/tasks/t379_config_token_stats_schema/spec.md`
- diff_anchor：`7e2f7e2add166ad98028a07c8e95c0d883dbc39d`
- target：`git diff 7e2f7e2add166ad98028a07c8e95c0d883dbc39d`
- round：1
- reviewed_at：2026-08-15 03:09 UTC+8

## Findings

### t379_code_f001 - config-store t379 集成用例假绿：load() 命中缓存，未触达 parse_config 的 strip 修复路径

- 严重度：important
- 锚点：AC-001 证据用例（save→load 保留 tokenStats）无法证明修复生效
- 位置：`tests/integration/config/config-store.test.ts:911-929`
- 问题：`config-store.ts` 的 `load()` 优先返回 `cached_config`（`config-store.ts:427-431`），而 `doSave` 在写盘后把传入对象原样写入缓存（`config-store.ts:235`）。本用例对同一 store 实例先 `save(with_token_stats)` 再 `load()`，`load()` 直接返回内存缓存对象，全程未经过 `parse_config` / `load_uncached`——而 strip 丢失正是发生在该解析路径（`config-store.ts:127-144`，zod object 默认剥未知键）。因此该断言在 schema 未补 `tokenStats` 时也必然通过，是假绿测试；AC-001 的「load 不丢块」证据实际落在 `config-schema.test.ts` 新增的 `parse` 用例上，store 集成用例并未触达被修路径。
- 建议：对齐本文件既有「强制重读磁盘」先例（`config-store.test.ts:353-354` 用 fresh store 命中 `load_uncached`）：save 后新建 `createConfigStore(configPath)` 实例再 `load()`，使断言真正走磁盘解析；或直接 `readFile` + `parse_config` 断言。

### t379_code_f002 - pollIntervalMinutes schema 严于 AppConfiguration 类型，越界值整份 config 拒绝

- 严重度：minor
- 锚点：行为缺陷——含 `tokenStats.pollIntervalMinutes < 1` 或非整数的 config 由「静默 strip + 默认值运行」变为「整份 safeParse 失败 → 回退备份 / 拒绝启动」
- 位置：`src/main/core/config/types.ts:122`
- 问题：类型 `AppConfiguration.tokenStats.pollIntervalMinutes?: number`（`src/shared/types/config.ts:96`）允许任意数，schema 却约束 `z.number().int().min(1)`，比类型更严且无 preprocess 兜底。`parse_config` / `import-config.ts:56` / `config-ipc.ts:183` 都是整份 `safeParse`：一旦该值非法，整份 config 校验失败（load 走备份恢复甚至拒绝启动）。同文件 `refreshIntervalSecondsSchema`（`types.ts:18-34`）恰恰为同一风险——「历史损坏配置不导致整份 config 被丢弃」——做了 preprocess clamp；tokenStats 子对象是手写/导入输入，无此保护。修复前该值只被静默丢弃、应用照常以默认 10 分钟运行。
- 建议：二选一——要么给 `pollIntervalMinutes` 加 preprocess clamp（对齐 refreshInterval 先例），要么把 `AppConfiguration` 类型同步收紧为 `number` 且标注约束（int ≥1），消除类型与 schema 形态差异。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条
- 未进表的提示：
  - 文件过大（降级规则）：`tests/integration/config/config-store.test.ts` 930 行（测试 ≥600 阈值），t379 净增 20 行；仅结论段列出，未进 finding 表。
  - 范围外观察——全仓类型↔schema 顶层字段已完全对齐（脚本比对 `AppConfiguration` 与 `appConfigurationSchema` 键集，无其它「类型有 schema 无」的假字段，嵌套键均在各自子对象 schema 内）。
  - 范围外观察——`node_modules` 在 worktree 中为 untracked 未忽略（仓库卫生问题，非本 diff 引入）。
  - 边缘提示——`build_token_stats_config` 的 `poll_interval_ms` 无上限，极端手写值 >35791 分钟会使 Node `setInterval` 溢出退化为 1ms 轮询；t379 让该值首次可被持久化 honor，属消费端既有短板，未作 finding。
  - 复杂度：无函数达到阈值。
- 总体判断：schema 修复本身正确且对齐（字段/形态与 `AppConfiguration` 精确一致；`build_token_stats_config` 默认 10min×60000 与 `tokenStatsConfigSchema` 默认 600000ms 衔接无误；load/save/import 三路径均不再 strip，schemaVersion 兼容因全 optional 无碍）。但 AC-001 指定的 store 集成证据为假绿（f001，未解决 important），需按建议修正后方可整合。

reviewed_scope: 7ef416c92d6e3cb3

verdict: FAIL

---

## Round 2（f001/f002 修复后复核）

- reviewed_at：2026-08-15 03:13 UTC+8
- 核对方式：`git diff 7e2f7e2add166ad98028a07c8e95c0d883dbc39d`（工作区）+ `npx vitest run tests/unit/config/config-schema.test.ts tests/integration/config/config-store.test.ts`（45 passed）+ 逐行读 cold-store 测试与 schema 改点

### 前轮 finding 复核

- **t379_code_f001（important）— 已消除。** 测试改 `cold_store = createConfigStore(configPath)` 后 `load()`：新实例闭包 `cached_config = null`，`load()` 走 `load_uncached()`（`config-store.ts:289`）→ `readFile` + `parse_config` → `appConfigurationSchema.safeParse`，正是 zod strip 发生路径（`config-store.ts:127-144`）。断言 `reloaded.tokenStats` 只在 schema 含 `tokenStats` 时成立；schema 剥离时 `parse` 输出为 `undefined`，`toEqual` 失败。与同文件既有先例对齐（`:754` 附近 "new store instance re-reads disk (cold cache)"，同 `config-store.test.ts` 内 `:353-354` fresh_store 模式）。假绿消除，AC-001 证据成立。
- **t379_code_f002（minor）— 基本消除，留一极端边缘。** `pollIntervalMinutes` schema 由 `z.number().int().min(1)` 改为 `z.number().int()`（`types.ts:122`），历史配置中的 0/负整数不再触发整份 `safeParse` 失败——原 finding 的实操担忧（越界值毁整份 config）已解除。残留：`.int()` 仍拒绝非整数分钟值（类型 `number` 允许 `2.5`），极端手写/导入浮点分钟仍会整份拒。考虑 `build_token_stats_config` 以 `×60000` 转 ms、下游 `tokenStatsConfigSchema.poll_interval_ms` 本就需要 `int().positive()`，整数分钟是语义正域；且全仓无 tokenStats 写入方，浮点历史值现实概率极低。不升级为 finding，标为 scope 外观察。

### 本轮新发现

- 0 条

### 结论

- 前轮 finding 复核：f001 已消除；f002 基本消除（残留 `.int()` 与类型 `number` 的浮点差异，见上，属极端边缘 minor）
- 本轮新发现：0 条
- 未进表的提示：
  - 残留 minor 观察——`pollIntervalMinutes: z.number().int()` 仍比类型 `number` 严（拒非整数）。如需完全对齐可去 `.int()` 或收紧类型为 `number` 并注明语义约束；因下游 ms 消费端需整数、无写入方、概率极低，不阻塞。
  - 文件过大（降级规则）：`tests/integration/config/config-store.test.ts` 930 行（≥600 阈值），t379 净增 23 行；仅结论段列出。
  - 范围外观察——全仓类型↔schema 顶层字段已完全对齐，无其它「类型有 schema 无」假字段（沿用 Round 1 脚本比对结论）。
- 总体判断：两处修复均到位且经实测验证（45 测试全绿，mutation 真删 schema 后 cold-store 用例挂）。无未解决 critical/important，仅有 minor 及极端边缘残留，可 PASS。

reviewed_scope: ecde02d931b15fc2

verdict: PASS
