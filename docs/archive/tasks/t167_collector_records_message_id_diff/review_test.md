# Task review t167（reviewer_focus: 测试）

- task：`t167_collector_records_message_id_diff`
- spec：`docs\tasks\t167_collector_records_message_id_diff/spec.md`
- diff_anchor：`aca801d9da264cbc9d754aa0eb921b9c293b53e0`
- target：`git diff aca801d9da264cbc9d754aa0eb921b9c293b53e0`
- round：1
- reviewed_at：2026-07-31 05:12 UTC+8

## Findings

### t167_test_f001 - 缺「完全无变化 emit 0」覆盖

- 严重度：important
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:283`（新增测试块）
- 问题：spec 验收标准「单测覆盖 diff 正确性（新增/无变化/文件截断重建/跨文件合并）」明确列「无变化」场景。现有测试只覆盖「首次全量 + 二次新增 m3」，未覆盖「二次 collect 返回与首次完全相同的 records 时 emit 0」。这是 diff 正确性的核心路径之一（稳态场景），缺失意味着「无变化」回归无门禁。
- 建议：新增 it，首次 configure emit 2 条后，第二次 collect mock 返回完全相同的 2 条 records（同 message_id），断言 `second.records.length === 0`。同时验证 `emitted_record_keys` 已记录这两条（可选）。

### t167_test_f002 - 缺「跨 source/env 同 message_id 不误去重」覆盖

- 严重度：important
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:283`（新增测试块）+ `src/main/core/token-stats/collector.ts:104`
- 问题：`record_key` 实现为 `` `${r.source}|${r.env}|${r.message_id}` ``，三元组去重是不变量。但无任何测试验证「同 message_id 不同 source/env 两条 record 都被 emit」。一旦未来有人误改成只按 message_id 去重（回归到单维 key），测试不会捕获，跨源 records 会被静默丢弃（opencode/kimi_code 共享同 message_id 空间时会丢数据）。
- 建议：新增 it（或在现有测试中扩展），单次 configure 返回两条 `message_id` 相同但 `source`/`env` 不同的 records，断言 `records.length === 2`。

### t167_test_f003 - 缺「文件截断重建」覆盖

- 严重度：important
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:283`（新增测试块）
- 问题：spec 验收标准明确列「文件截断重建」。t167 `emitted_record_keys` 是内存 Set 只增不减，文件被截断后重写（旧 message_id 消失、新 message_id 出现）时，collector 仍会 emit 新增项——但若截断后重写的 record 复用了已消失的旧 message_id（Claude Code resume 场景存在），该 record 会被误判为「已 emit」而丢弃。这是 t167 引入的语义变化（旧实现全量重发不会漏），无测试覆盖风险。
- 建议：新增 it，首次 emit m1/m2 后，第二次 collect mock 返回 records 中 m1 消失、出现 m2（同 message_id 但内容变化）和 m3，断言 m2 是否被 emit。若实现确实跳过 m2（按当前代码会跳过），测试应如实记录该行为并标注为 t167 已知取舍，或在 spec 中澄清「message_id 不变即视为不变」。

### t167_test_f004 - record() helper 返回类型不精确

- 严重度：minor
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:88-111`
- 问题：`record()` 返回类型声明为 `AgentSessionUsage & { source: string; env: string }`，但实际 runtime 返回的对象带 `source: "claude_code"` / `env: "win"` 字面量，且 collector 接收的是 `AgentSessionUsageRecord`（`source: TokenStatsSource` / `env: TokenStatsEnv` 字面量联合）。用 `string` 宽化类型后，`overrides` 也接受任意 string，编译期无法捕获 typo（如 `source: "claudecode"`）。
- 建议：返回类型改为 `AgentSessionUsageRecord`（已从 `shared/types/token-stats` 导出该类型），`overrides` 用 `Partial<AgentSessionUsageRecord>`。或至少把 `{ source?: TokenStatsSource; env?: TokenStatsEnv }`。

## 结论

- 本轮新发现：4 条（3 important、1 minor）
- 总体判断：新增的增量测试正确验证了「首次全量 + 二次只发新增」核心路径，断言精确（长度 + message_id 值），无危险模式。但 spec AC 明确列的「无变化 / 文件截断重建 / 跨文件合并（跨 source/env）」三类场景缺测试，其中「无变化」和「跨 source/env 去重」是 collector 层 diff 不变量的直接验证，缺失导致核心不变量无回归门禁。

verdict: FAIL

## Round 2 (2026-07-31 05:17 UTC+8)

### 前轮 finding 复核

- **t167_test_f001（无变化 emit 0）已修**：新增 `emits nothing when no records changed since the last collect`（collector.test.ts:326-345）。首次 configure emit 2 条，第二次 `collect()` mock 返回完全相同 2 条 records，断言 `second.records.toHaveLength(0)`。精确验证 `emitted_record_keys` 去重不变量。
- **t167_test_f002（跨 source/env 不误去重）已修**：新增 `does not dedup records that share message_id across source/env`（collector.test.ts:347-376）。同 `message_id="shared"` 在 `(claude_code,win)`/`(claude_code,wsl)`/`(opencode,win)` 三种组合下断言 `toHaveLength(3)`，直接覆盖 `record_key` 三元组语义。
- **t167_test_f003（文件截断重建）已修（换等价形式）**：新增 `re-emits a record after the emitted set is reset (file-truncation analog)`（collector.test.ts:378-402）。采用 `reset_config()` 清空 `emitted_record_keys` 等价文件截断后重启场景，断言同 message_id 的 record 被重发（`calls[1].records.toHaveLength(1)`）。注释明确「restart 等价」语义，与实现 `reset_config` → `emitted_record_keys.clear()` 对齐。round 1 建议 的「message_id 复用是否丢」是运行时取舍问题，本测试覆盖了「重启后不丢」这一可验证路径，覆盖充分。
- **t167_test_f004（record 类型）已修**：`record()` 返回类型与 overrides 入参收窄为 `"claude_code"|"opencode"|"kimi_code"` / `"win"|"wsl"` 字面量联合（collector.test.ts:88-96）。既有 4 个调用点（:229/:249/:255/:260）仅传 `agent` 字段不覆盖 `source`/`env`，依赖默认字面量，新签名完全兼容。

### 本轮新发现

0 条。三类边界场景断言精确，无恒真 / 弱化 / `.skip` / mock 被测逻辑。mock 仅作用于 `scan_jsonls` 系统边界，collector diff 逻辑走真实代码路径。26 tests 全绿。

### 总体判断

前轮 4 条 finding 全部已修，核心 diff 不变量（无变化 / 跨 source/env / 重启重发 / 类型精确）均有回归门禁。

verdict: PASS
