---
tid: "t114"
slug: "token_stats_state_persistence"
title: "token-stats collector 扫描状态落盘"
status: "done"
branch: "t114_token_stats_state_persistence"
worktree: ""
review_level: "full"
diff_anchor: "095ac2230fc27f9668dacdfeec079c01864cf6a2"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t114_token_stats_state_persistence

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-26 start。diff_anchor `095ac22`（t113 HEAD），分支 `t114_token_stats_state_persistence`。
- collector 是模块级状态 + 函数式（无 class、无 DI），状态 Map（costs_state/opencode_max_updated/jsonl_states/kimi_states）模块级。utilityProcess 子进程，无 electron `app` 访问。
- state_path 注入：`TokenStatsConfig` 加可选 `state_path`（z.default("")）；主进程 `build_token_stats_config` 填 `getTokenStatsStatePath()`（`<dataRoot>/token-stats-scan-state.json`，`paths.ts` 新增 helper）。空值禁用持久化（测试用）。
- 序列化设计：`SerializedScanState` 把 4 个 Map 序列化为 Record；`SessionScanState`/`KimiScanState` 的 files entry 序列化时丢弃 `facts.records`（store 已 REPLACE 入库）、`daily` Map 转 Record；mtime `Math.round`（避免 JSON number 浮点精度导致全量误判）。`deserialize_bucket` 反向恢复，records 恢复为 `[]`（mtime 未变时 reader 复用 old entry 不重发，防重复）。
- 时机：`collect()` 末尾 `if (config.state_path) void save_state(state_path)`（fire-and-forget，不阻塞下一轮）；`configure` 改 async，首次 config 时 `await load_state(cfg.state_path)` 后再 `collect()`；ipc message handler 改 `void configure(...).then(() => start_interval())`。
- 损坏/缺失回退：`load_state` 用 try/catch（readFile ENOENT 静默；JSON.parse 失败 warn + 返回；deserialize 失败 clear + warn），任何异常均回退空状态（等价全量重扫，不崩溃）。
- 验证：`pnpm test` 1727 passed / 167 files；`pnpm typecheck` 仅 4 pre-existing 错误（write-json.test.ts:23 t111 遗留；oauth_device_form.test.tsx TS4111 t112 遗留）；改动文件 ESLint 0 错误。
- 测试：`collector-state.test.ts` 5 用例（serialize 丢弃 records + daily 拍平；save/load round-trip 含 mtime/session_id/records=[]/daily Map 恢复 + costs/opencode；损坏文件回退；缺失文件回退；空 state_path no-op）。`collector.test.ts`/`manager.test.ts` base_config 加 `state_path: ""`。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round 1 (2026-07-26 01:32 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                 | fix_ref                                                           |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| t114_code_f001 | critical  | 已修   | 删除 `round_mtime`（Math.round），mtime 改纯浮点 round-trip，保证 reader 严格 `===` 比较在重启后仍命中（否则全部误判 dirty，AC1 失效）                                    | src/main/core/token-stats/collector.ts:131-136                    |
| t114_code_f002 | minor     | 已修   | `deserialize_bucket` 去泛型，返回通用 `{ mtimes, files }` 结构，调用点 `as unknown as SessionScanState`/`KimiScanState` 显式 cast（JSON 反序列化无法精确推断 facts 形状） | src/main/core/token-stats/collector.ts:142-170; load_state 调用点 |
| t114_code_f003 | minor     | 遗留   | collector.ts 净增 ~170 行（总 ~510），超 400 阈值。抽 serde 到独立 `scan-state.ts` 需移动 + 改 collector/测试 import，跨文件重构；后续独立 task 处理。                    | src/main/core/token-stats/collector.ts                            |
| t114_test_f001 | important | 已修   | 补集成测试「restored state is passed to reader on next collect」：configure→collect→save→reset→load→collect，断言 reader 收到恢复的 mtime（增量恢复证据）                 | tests/unit/main/core/token-stats/collector-state.test.ts:217-252  |
| t114_test_f002 | important | 已修   | 同 f001 集成测试覆盖「mtime 未变 reader 复用 state 不重复产出 records」的 state 传递链；records 丢弃在 serialize/drops 与 round-trip 用例已断言 facts.records=[]          | tests/unit/main/core/token-stats/collector-state.test.ts          |
| t114_test_f003 | minor     | 已修   | `save_state("")` no-op 测试改：预写 tmp_file 内容，save_state("") 后断言内容未被覆盖（消除恒真）                                                                          | tests/unit/main/core/token-stats/collector-state.test.ts:203-208  |
| t114_test_f004 | minor     | 已修   | corrupt/missing 用例补断言 4 个 Map 全空（之前只查 jsonl_states）                                                                                                         | tests/unit/main/core/token-stats/collector-state.test.ts:185-201  |
| t114_test_f005 | minor     | 已修   | round-trip 用例补 daily Map 内容断言（`get("2026-07-10\|claude-x")` 深等于 `{date,model,calls}`）+ mtime 浮点精确相等                                                     | tests/unit/main/core/token-stats/collector-state.test.ts:155-173  |

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t114_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t114` 查，不在此记。

### 验收标准勾选

- [x] collector 重启后不再全量重扫，仅扫 mtime 变化文件。
- [x] state 文件损坏时静默回退空状态，不崩溃。
- [x] 恢复后不产生重复 records（store 无重复行）。
- [x] `pnpm test` 全绿。

### Reviewer verdict

- Round 1 code：FAIL（f001 critical round_mtime 破坏浮点 ===；f002 minor 类型强转；f003 minor 超 400 行）
- Round 1 test：FAIL（f001/f002 important 白盒断言无行为证据；f003 恒真；f004/f005 漏断言）
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- `t114_code_f003`：collector.ts 净增 ~170 行（总 ~510），超 400 阈值；抽 serde 到独立 `scan-state.ts` 需跨文件重构 + 改测试 import，后续独立 task 处理。

### 结果摘要

- collector 扫描状态（costs_state/opencode_max_updated/jsonl_states/kimi_states）持久化到 `<dataRoot>/token-stats-scan-state.json`：`TokenStatsConfig.state_path` 注入；`serialize_state` 丢弃 facts.records（store 已入库）、daily Map 转 Record、mtime 纯浮点（保 reader 严格 ===）；`load_state` 损坏/缺失静默回退空（clear 前置）；`collect` 末尾 fire-and-forget `save_state`；`configure` async 首次 `load_state` 后 collect。
- 测试：collector-state.test.ts 7 用例（含集成测试 configure→collect→save→reset→load→collect 验证 reader 收到恢复 mtime）。`pnpm test` 1729 passed / 167 files；`pnpm typecheck` 仅 4 pre-existing（write-json t111 + oauth_device_form TS4111 t112）；改动文件 ESLint 0 错误。
