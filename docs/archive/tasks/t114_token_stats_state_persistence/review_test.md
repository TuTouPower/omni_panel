# Task review t114（reviewer_focus: 测试）

- task：`t114_token_stats_state_persistence`
- spec：`docs\tasks\t114_token_stats_state_persistence\spec.md`
- diff_anchor：`095ac2230fc27f9668dacdfeec079c01864cf6a2`
- target：`git diff 095ac2230fc27f9668dacdfeec079c01864cf6a2`
- round：2
- reviewed_at：2026-07-26 01:36 UTC+8

## Findings

### t114_test_f001 - AC3「不产生重复 records」未被行为测试覆盖

- 严重度：important
- 位置：`tests/unit/main/core/token-stats/collector-state.test.ts:122-159`（`save then load round-trips scan state`）；spec AC3
- 问题：spec AC3「恢复后不产生重复 records（store 无重复行）」要求验证端到端行为链条：load_state 恢复 entry（records=[]）→ collect() 调用 reader → reader 在 mtime 未变时复用 entry 不重发 records → store 不收到重复行。测试只断言 `claude_file?.facts.records` 被恢复为 `[]`（line 152），仅证明内部字段被重置，**无法证明 reader 在 mtime 未变时会复用 entry 而不重新产出 records**。`records=[]` 本身不构成「无重复」的证据——若 reader 实际重新扫了文件并再次产出 records，store 仍会收到重复行，此测试照过。
- 建议：新增用例：load_state 恢复 mtime 后调用 `collect()`，配置 mock reader 在 mtime 命中时不返回 records、在 mtime 变化时返回新 records，断言 store 收到的 records 调用次数/内容与预期一致（命中文件 0 records、变化文件 N records）。

### t114_test_f002 - AC1「不全量重扫」未被行为测试覆盖

- 严重度：important
- 位置：`tests/unit/main/core/token-stats/collector-state.test.ts`（整个文件，缺集成用例）；spec AC1
- 问题：spec AC1「collector 重启后不再全量重扫，仅扫 mtime 变化文件」是**行为**要求，必须通过 collect() 调用观察 reader 行为来验证。本文件 5 个用例全是白盒字段断言（mtimes/daily/costs 等 Map 内容），没有任何用例调用 `collect()` 后断言 `scan_session_jsonls` / `scan_kimi_wire_jsonls` / `read_costs_jsonl` / `read_opencode_sessions` 接收到的已有 mtime 集合与 state 一致，也没断言「未变文件不被重扫」。即使 load_state 完全没恢复 mtime，这些测试也会通过。
- 建议：新增集成用例：load_state 恢复已知 mtime 后 collect()，断言 mock_scan_jsonls 被调用时收到参数中的 `known_mtimes` 与 state 内容一致（reader 据此跳过未变文件）；或断言只对新增/变化文件产出 records。

### t114_test_f003 - `save_state("")` no-op 测试「no file created」断言恒真

- 严重度：important（危险模式——恒真断言作为 AC 证据）
- 位置：`tests/unit/main/core/token-stats/collector-state.test.ts:174-182`
- 问题：用例调用 `save_state("")`，源码 `if (!state_path) return;` 直接返回，**完全没接触 `tmp_file`**。而 `tmp_file` 在 `beforeEach` 已被 `fs.unlinkSync` 清除（不存在），所以 `expect(fs.existsSync(tmp_file)).toBe(false)` 与 `save_state("")` 是否真的 no-op 无任何因果关系——无论 save_state 实现如何，该断言恒为 true。注释 `// no file created` 暗示这是验证目标，但它验证不了。`resolves.toBeUndefined()` 那行算有效（验证不抛错），但「no file created」这条 AC 证据失效。
- 建议：spy `writeJsonAtomic`（或 `fs.promises.writeFile`），断言在 `state_path=""` 时未被调用；或传入一个真实存在的临时路径，调用 `save_state("")` 后断言该路径仍未被创建。

### t114_test_f004 - `load_state` corrupt 与 missing 用例断言覆盖不全

- 严重度：minor
- 位置：`tests/unit/main/core/token-stats/collector-state.test.ts:161-172`
- 问题：
    - corrupt 用例只断言 `jsonl_states.size === 0` 与 `costs_state.size === 0`，漏了 `kimi_states` 与 `opencode_max_updated`。
    - missing 用例只断言 `jsonl_states.size === 0`，漏了另外 3 个 Map。
    - 回退路径在源码 `load_state` 中对 4 个 Map 都 `clear()` 并按字段恢复，恢复失败时 4 个 Map 都应保持空。
- 建议：4 个 Map 全部补 size 断言，避免漏掉某个 Map 因解析残留数据未清空的情况。

### t114_test_f005 - round-trip 用例未验证 daily Map 内容

- 严重度：minor
- 位置：`tests/unit/main/core/token-stats/collector-state.test.ts:154`
- 问题：只断言 `claude_file?.facts.daily instanceof Map` 为 true，**未验证 Map 的 key/value 是否正确恢复**。serialize 时 daily 被 `Object.fromEntries` 拍平，deserialize 时再转回 Map——如果任一方向丢字段、改 key、value 错配，测试仍通过。结合 AC3（statistics 不重复）和后续 manager 聚合依赖 daily 正确性，这是真实风险。
- 建议：补一条精确内容断言，例如：
    ```ts
    expect(claude_file?.facts.daily.get("2026-07-10|claude-x")).toEqual({
        date: "2026-07-10",
        model: "claude-x",
        calls: 1,
    });
    ```

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：5 条（3 important / 2 minor）。
- 总体判断：5 个用例覆盖了序列化/反序列化字段、损坏/缺失回退、空路径不抛错，但 spec AC1「不全量重扫」与 AC3「不产生重复 records」两条**行为型 AC 缺集成测试**——现有用例全是白盒字段断言，无法证伪（即使实现完全不调用 reader 也会通过）。另命中一处恒真断言危险模式。修复 f001–f003 后才能视为测试轴可信。

verdict: FAIL

## 范围外提示（不进 finding 表）

- 测试文件首行 `/* eslint-disable @typescript-eslint/no-unsafe-return, ... */` 全文件禁用多条类型规则，属于「静默错误」危险模式语法命中。调查后判定：与同目录既有 `collector.test.ts` 同样模式（项目惯例），且仅禁用类型规则、不直接掩盖测试失败或行为覆盖，故不单列 finding。建议后续将 `as any` 收敛到具体行级 `// eslint-disable-next-line`，或为测试辅助函数补类型定义，减少类型 bug 漏网面。

## Round 2 (2026-07-26 01:36 UTC+8)

### 前轮 finding 复核

#### t114_test_f001 / t114_test_f002（important，AC3 / AC1 缺集成测试）— 已修

新增用例 `restored state is passed to reader on next collect (incremental resume)`（`tests/unit/main/core/token-stats/collector-state.test.ts:215-257`）：

1. 首次 `configure(make_config(""))` + `collect()` 后断言 `jsonl_states.get("claude_jsonl_win")?.mtimes.get("proj/f1.jsonl") === float_mtime`，证明 reader 返回的 mtime 真的进入 collector 状态；
2. `save_state(tmp_file)` → `reset_config()` → `load_state(tmp_file)` 模拟重启；
3. 第二次 `configure(make_config(""))` 前，`mock_scan_jsonls` 改为 `mockImplementation`，在实现体内断言入参 `state.mtimes.get("proj/f1.jsonl") === 1785000286795.3518`（浮点严格 `===`）；
4. 末行 `expect(mock_scan_jsonls).toHaveBeenCalled()` 防止 mock 未触发导致 expect 空走。

该用例提供行为证据：collector 把恢复的 mtime 真实传递给 reader。reader 看到 mtime 后是否跳过未变文件本身是 reader 契约（reader 单测覆盖），但 collector 层「传递状态」的职责被行为级证明，AC1 / AC3 在 collector 端的行为链条已闭合——非恒真、非白盒字段凑数、非弱化形式的「修」。

#### t114_test_f003（important，恒真断言）— 已修

原「`tmp_file` 不存在 → 断言不存在」恒真已删除，改为 `save_state with empty path is a no-op (does not overwrite existing file)`（`collector-state.test.ts:208-213`）：预写 `tmp_file` 内容为 `"pre-existing"`，调用 `save_state("")` 后断言 `fs.readFileSync(tmp_file, "utf8") === "pre-existing"`。与 `save_state` 实现的 `if (!state_path) return` 严格对应，真实行为证据。

#### t114_test_f004（minor，corrupt / missing 漏断言）— 已修

- corrupt 用例（`187-197`）补全 4 个 Map size 断言，并 pre-populate `costs_state` / `jsonl_states`，证明 `load_state` 在 JSON 解析失败时主动 `clear()`（不是「未填」的假象）。
- missing 用例（`199-206`）同样补全 4 个 Map size 断言。

#### t114_test_f005（minor，daily Map 内容）— 已修

- round-trip 用例新增 `claude_file?.facts.daily.get("2026-07-10|claude-x")` 深等于 `{ date: "2026-07-10", model: "claude-x", calls: 1 }` 的精确内容断言（`176-180`）。
- mtime 改为浮点字面量 `1785000286795.3518` 并用 `.toBe()` 严格相等（`171`），消除原 Round 1 integer-mtime 路径下浮点精度被掩盖的风险。
- 另新增独立用例 `serialize_state keeps float mtime for strict equality round-trip`（`132-143`）专测序列化阶段 mtime 保持浮点，与 code reviewer Round 1 的 `t114_code_f001`（去 `Math.round`）配套。

### 本轮新发现

无。

### 总体判断

Round 1 五条 test finding 全部真修，证据类型从「白盒字段 / 恒真断言」升级为「跨函数行为证据」（reader 收到恢复的 mtime、save_state 真不触磁盘、load_state 真清 4 Map、daily Map 内容深等）。无「修成另一种弱化形式」的情况。本轮扫描未发现新危险模式或新覆盖缺口。

verdict: PASS
