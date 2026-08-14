# Task review t379（reviewer_focus: 测试）

- task：`t379_config_token_stats_schema`
- spec：`docs/tasks/t379_config_token_stats_schema/spec.md`
- diff_anchor：`7e2f7e2add166ad98028a07c8e95c0d883dbc39d`
- target：`git diff 7e2f7e2add166ad98028a07c8e95c0d883dbc39d`
- round：1
- reviewed_at：2026-08-15 03:12 UTC+8

## Findings

### t379_test_f001 - config-store 集成用例命中内存缓存，未触达 schema parse，mutation 不敏感

- 严重度：important
- 锚点：AC-001「tokenStats 配置经 load/save 后不再被 strip 丢失」；测试验证的是从未损坏的行为，无法抓回归
- 位置：`tests/integration/config/config-store.test.ts:911-929`（t379 用例）
- 问题：用例同一 store 实例先 `save` 再 `load`。`doSave` 设 `cached_config = config`（`src/main/core/config/config-store.ts:235`），`load()` 命中缓存直接返回同一对象（`config-store.ts:427-432`），全程不经过 `load_uncached` → `parse_config` → `appConfigurationSchema.safeParse`——strip 丢失 bug 就住在这个 parse 路径。`expect(reloaded.tokenStats).toEqual(with_token_stats.tokenStats)` 对同一引用做相等断言，恒真。
  - 实证（reviewer 于 `.scratch/` 建临时用例，已清理）：向 `tokenStats.wslEnabled` 塞违反 schema 的字符串值，同一 store save→load 后该块原样返回（命中缓存、无重解析）；换新 store 实例（冷缓存）才触发磁盘重解析。结论：该用例在「schema 无 tokenStats」状态下也会绿。
  - 本文件自有注释与既有用例已明示此坑：`config-store.ts:351`「t195: load 命中内存缓存，不重读磁盘。用新实例模拟重启重读」；`config-store.test.ts:754`「new store instance re-reads disk (cold cache)」即正确范式。
  - 连带影响：`handoff.json` 声称「mutation 验证：真删 schema 后 t379 用例挂」对 config-schema 用例成立、对 config-store 用例不成立——该句只对一半。
  - 注：AC-001 的 parse 保留行为仍由 config-schema 用例（`tests/unit/config/config-schema.test.ts:191-210`）正确覆盖（mutation 敏感：schema 删字段 → `.parse` strip 未知键 → `parsed.tokenStats` undefined → `toEqual` 挂）。故本 finding 是「集成用例存在但验证假行为」，非「AC-001 完全无测试」。
- 建议：`save` 后用新 store 实例 `load`（冷缓存走磁盘→parse→schema），对齐 `config-store.test.ts:754` 既有模式；或直接断言落盘原始 JSON 含 `tokenStats` 后经新实例读回保留。

### t379_test_f002 - AC-002 第二分句 build_token_stats_config 读取持久化值无直接覆盖，声明测试策略未完整兑现

- 严重度：minor
- 锚点：AC-002「含 tokenStats 的配置导入后该块保留，build_token_stats_config 读取到持久化值」；spec 测试策略声明「断言 load 后字段保留**且 build_token_stats_config 读取到**」
- 位置：`src/main/index.ts:434-442`（`build_token_stats_config` 闭包，未导出）
- 问题：AC-002 两个可观察行为——(a) 导入保留、(b) build_token_stats_config 读到持久化值。(a) 由 config-schema t379 用例经同一 schema（import 走 `appConfigurationSchema.safeParse`，`src/main/cli/import-config.ts:36-39`）间接覆盖；(b) 无任何测试断言。spec「测试策略」明言要测「build_token_stats_config 读取到」，实际只测了 load 保留（且 f001 已证该断言未触达 parse）。值链「parse 保留 tokenStats → cfg.tokenStats 存在 → `cfg.tokenStats?.wslEnabled ?? true` 读到持久化值」中，读取半是平凡属性访问，无独立失败模式，故判 minor 而非 blocking。
- 建议：最小修复在 f001 基础上让 store 层冷缓存 load 保留 tokenStats，即闭环 AC-002 值链；如要对读取半直接断言，需把 `build_token_stats_config` 提取为可测纯函数（架构变更，超出本 task 测试整改范围，可留待后续）。

## 结论

- 前轮 finding 复核（Round N≥2）：N/A（首轮）
- 改测方向复核：无。diff 仅新增两条用例，未改动任何既有测试，无「迁就实现」改测；import-config 8 用例原样保持。
- 本轮新发现：2 条
- 未进表的提示：
  - `tests/unit/main/cli/import-config.test.ts` 未新增「导入含 tokenStats 配置保留」用例；import 与 schema 测试共用同一 `appConfigurationSchema`，机制已由 config-schema t379 用例覆盖，属「还可再加 case」级，不阻断。
  - tokenStats 子对象字段全 optional，未覆盖「部分字段（如仅 wslEnabled）parse」的 edge case，同样属可选扩展。
- 总体判断：config-schema t379 用例正确、mutation 敏感，AC-001 parse 保留已真实覆盖；但 config-store 集成用例命中内存缓存、验证从未损坏的假行为，对 AC-001 store 层持久化与 handoff 的 mutation 声明均不成立，须整改（f001）。f001 为未解决 important，判 FAIL。
- 系统性 follow-up：无新建 task 必要；f001/f002 均属本 task 测试整改范围内。

verdict: FAIL

reviewed_scope: 7ef416c92d6e3cb3

## Round 2 (2026-08-15 03:13 UTC+8)

### 前轮 finding 复核

- t379_test_f001（important）：**已消除**。用例改为 `save` 后用新 store 实例 `cold_store = createConfigStore(configPath)` 冷缓存 load（`tests/integration/config/config-store.test.ts:929-931`），走磁盘 re-parse（`load_uncached` → `parse_config` → `appConfigurationSchema.safeParse`），不再命中内存缓存。对齐本文件 `:754`「new store instance re-reads disk (cold cache)」先例，注释已说明动机。断言仍为全字段 `toEqual`，无弱化、无删除。
  - 独立 mutation 实测（reviewer）：临时删除 `types.ts` 的 tokenStats schema 块后，仅此用例挂（`1 failed | 30 passed`，`received: undefined`——tokenStats 被 strip）；恢复后 45 全绿。mutation 敏感性成立，handoff「真删 schema 后 t379 用例挂」现对两条用例均成立。
- t379_test_f002（minor）：**维持 minor**。f001 修复后 store 层冷缓存用例已闭环 AC-002 值链的「parse 保留」半；`build_token_stats_config` 读取半（`index.ts:434-442`）仍无直接断言，但为平凡属性访问、无独立失败模式，维持 minor 不阻断。用户确认维持。

### 改测方向复核

无。f001 修复为新增断言路径（冷缓存 load），未迁就实现、未反转/删除/弱化断言；import-config 8 用例与 config-schema t379 用例未动。

### 本轮新发现

0 条

### 未进表的提示

无

### 总体判断

f001 已修且 mutation 敏感性经独立实测确认；f002 为可接受 minor。无未解决 critical / important。

verdict: PASS

reviewed_scope: ecde02d931b15fc2
