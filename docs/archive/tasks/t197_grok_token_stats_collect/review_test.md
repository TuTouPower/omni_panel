# Task review t197（reviewer_focus: 测试）

- task：`t197_grok_token_stats_collect`
- spec：`docs/tasks/t197_grok_token_stats_collect/spec.md`
- diff_anchor：`3b2804f6`
- target：`git diff 3b2804f6`
- round：1
- reviewed_at：2026-08-04 03:15 UTC+8

## Findings

### t197_test_f001 - AC5「不可读」分支未实现且无测试：目录存在但不可读 / updates.jsonl 读失败时静默无 warn

- 严重度：important
- 锚点：AC5「grok 目录或 `updates.jsonl` 缺失/不可读时，该 source 静默跳过并 warn 日志，不阻断其它 source 采集」
- 位置：`src/main/core/token-stats/grok-reader.ts:387-404`（`missing` 只在 `existsSync` 为 false 或抛错时置位）；`:440-446`（`readFileSync` 抛错 `continue` 静默跳过）；测试 `tests/unit/main/core/token-stats/grok-reader.test.ts:321-332`（仅覆盖「目录不存在」）
- 问题：实现与测试只覆盖 AC5 的「缺失」分支，未覆盖「不可读」分支，且该分支行为与 AC 不符：
    - 目录存在但 `readdirSync` 抛错（权限受限 / UNC 挂载异常）：`collect_update_files` 捕获后返回空（`grok-reader.ts:96`），`missing` 保持 false，collector 不 warn。
    - `updates.jsonl` 存在但 `readFileSync` 抛错：`grok-reader.ts:442-445` 静默 `continue`，不置 `missing`、无 warn。
    - 失败场景：`.grok/sessions` 目录存在但不可读，或单个 `updates.jsonl` 不可读 → grok 数据静默缺失，无 warn 日志，用户无从得知采集失败。违反 AC5 明示的「缺失/不可读 → warn」。
    - 无对应测试：现有测试只验证不存在的目录（`tolerates a missing sessions directory`）与 collector 的 warn-once，均未触达不可读路径。
- 建议：reader 在 `readdir` / `readFileSync` 失败时将结果标记 `missing`（或对文件级失败单独置标志），collector 沿用现有 warn-once 逻辑；补一个不可读目录/文件的测试（临时目录下用文件路径顶替目录、或 mock fs 抛错）验证 `missing:true` 与 warn 触发。

### t197_test_f002 - grok 路径构建器无直接单测，仅靠 collector 测试的 toContain 弱断言

- 严重度：minor
- 锚点：覆盖（非 blocking）
- 位置：`tests/unit/main/core/token-stats/collector.test.ts:569-571`
- 问题：`grok_sessions_path` / `grok_base` 是新增路径构建器，但本文件「path builders」describe 块对 claude/opencode/kimi 路径均有精确等于断言（`collector.test.ts:157-212`），grok 只在 mock 调用断言里用 `toContain("wsl.localhost")` + `toContain(".grok\\sessions")` 间接验证。若路径拼错 distro 或 user 段（如漏 `Ubuntu-22.04`），该断言仍通过。grok 路径恰是新增逻辑，缺乏与既有路径同级的精确断言。
- 建议：在 path builders 块补 `grok_sessions_path(wsl_config)` 精确等于 `\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.grok\\sessions` 的断言。

## 结论

- 改测方向复核：无。diff 中三处既有测试文件的修改全部为加法（新增 mock、新增 grok 断言、`record()` helper 类型扩展、`wsl_enabled=false` 用例补 `expect(mock_scan_grok).not.toHaveBeenCalled()`），无删除/反转/弱化既有断言，无「把旧测试预期改成新实现输出」的迁就式改测。
- 本轮新发现：2 条（f001 important、f002 minor）
- 未进表的提示：
    - AC3 无「真实 reader → collector → store」端到端入库去重测试：测试策略提到的 collector 集成测试（临时目录布局）以 reader 级 temp-dir 单测 + mocked collector + 通用 store REPLACE 测试组合覆盖，各层机制均有直接测试，可选补端到端用例，不构成缺口。
    - AC5 缺失分支的「临时缺失不强制整量重扫」（reader 返回 `new_state: prev`）未断言，`tolerates a missing sessions directory` 只断言空结果与 `missing:true`。
    - `local-api/server.ts` 移除 `await` 属 t196 lint 修复，超出本 task 测试范围；`handleConnectorRefreshAll` 同步语义已有 `tests/unit/ipc/connector-ipc.test.ts:185` 覆盖，行为无变化。
- 总体判断：AC1-AC6 全部有直接测试且全部通过（本机复跑 4 个相关测试文件 117 用例全绿），mock 边界正确（仅 mock reader/外部边界，reader 与 store 均触达真实实现）；仅 f001 一条 important（AC5 不可读分支无实现无测试）未解决。
- 系统性 follow-up：无

verdict: FAIL

## Round 2（2026-08-04 03:20 UTC+8）

### 前轮 finding 复核

- **t197_test_f001：修不彻底，仍 important。** 实现已补两块，但只有一块有测试：

    1. 目录级不可读（`grok-reader.ts:387-412`：`existsSync` 为 true 时再试 `readdirSync`，抛错 → `missing=true` 整体跳过）——已实现，并有新测试覆盖：`grok-reader.test.ts:334-341`「treats an unreadable sessions path (a file, not a dir) as missing (t197 AC5)」用文件路径触发 ENOTDIR，断言 `missing=true` 与空结果。此分支实修。
    2. 文件级不可读（`grok-reader.ts:429-459`：`statSync`/`readFileSync` 抛错 → `file_unreadable=true` 跳过该文件仍采集其它，返回值 `missing: file_unreadable`，`grok-reader.ts:501`）——**已实现但零测试**。协调者修复说明声称的行为「跳过该文件仍采集其它 + missing 触发 collector warn-once」没有任何测试证据：
        - grep 全测试目录，`file_unreadable` 仅命中实现、无测试命中；ENOTDIR 测试走顶部提前返回（`grok-reader.ts:403-412`），不触达逐文件循环，`missing: file_unreadable` 与「部分采集 + missing」返回路径未被任何用例执行。
        - collector 侧既有「warns once when the grok dir missing」整块 mock 掉 `scan_grok_updates` 返回 `missing:true`，验证的是 collector 对 missing 标志的 warn-once，不验证真实 reader 文件级错误的传播。
        - 该分支另藏可观测缺陷：`readFileSync` 失败时 `mtimes` 已先写入（`grok-reader.ts:439`）而 `files` 未写入，下次扫描 mtime 未变 → `prev.mtimes.get(file) === stat.mtimeMs` 命中且 `old_entry` 为 undefined → `continue`（`grok-reader.ts:442-447`）——一次性不可读的 `updates.jsonl` 在 mtime 变化前被永久跳过，数据不再入账。AC5 明示的「`updates.jsonl` 不可读」子句无测试且此行为无人验证。

    - 建议：补 reader 测试，让某会话 `updates.jsonl` 的 `readFileSync` 确定性失败（`vi.spyOn(fs, "readFileSync")` 对特定路径抛错；文件系统属系统边界，可 mock）且另一会话可读；断言可读会话记录正常产出、`result.missing === true`。若「暂不可读永久跳过」非预期，同时修 mtimes 记录时机（失败时不落 mtimes，留待下轮重试）。

- **t197_test_f002：已消除。** `collector.test.ts:215-219` 新增「builds WSL grok sessions path (t197)」精确断言 `\\\\wsl.localhost\\Ubuntu-22.04\\home\\testuser\\.grok\\sessions`，与 claude/opencode/kimi 路径断言惯例一致；`grok_sessions_path` 已入 import（`collector.test.ts:49`）。原 toContain 弱断言保留在 mock 调用场景（校验传给 reader 的参数），非路径构建器证据，无碍。

### 本轮新发现

无（残余 f001 即本轮唯一 blocking 项）。

### 验证

本机复跑 3 个相关测试文件 50 用例全绿（grok-reader 13、collector 29、collector-state 8；新增 ENOTDIR 与路径精确断言用例均通过）。

## 结论（Round 2）

- 前轮 finding 复核：f001 修不彻底——文件级不可读分支（AC5「`updates.jsonl` 不可读」子句）实现无测试且存在潜在永久跳过行为，仍为未解决 important；f002 已消除。
- 改测方向复核：无。本轮新增测试均为纯加法，无迁就实现、无删改既有断言。
- 本轮新发现：0 条
- 未进表的提示：collector warn 文案固定为「sessions dir missing」（`collector.ts:305`），文件级不可读时措辞不精确（cosmetic）；AC3 端到端入库去重仍为可选扩展（同 Round 1）。
- 总体判断：f001 目录级分支已修，文件级不可读分支仍零测试且行为未验证，blocking important 未清零。
- 系统性 follow-up：无

verdict: FAIL

## Round 3（2026-08-04 03:36 UTC+8）

### 前轮 finding 复核

- **t197_test_f001：已消除。** 两点均已按建议修复，且修复方式可辩护：
    1. **mtime 记录时机**（`grok-reader.ts:433-476`）：逐文件循环改为「读+解析成功后才落 mtime」——`statSync`/`readFileSync` 失败置 `file_unreadable=true` 且不落 mtime（`:435-440`、`:455-461`），下轮 `prev.mtimes.get(file) === undefined !== stat.mtimeMs` 命中重读路径；未变更文件（`:443-449`）与 parse 失败（`:469-472`）仍落 mtime 保持增量跳过（与 kimi 一致）。永久跳过缺陷已消除，增量语义未破坏（既有「skips unchanged files via mtime」用例仍过）。
    2. **文件级分支测试**（`grok-reader.test.ts:362-403`）：
        - `vi.mock("node:fs")` 部分委托（`:14-25`）：仅 `readFileSync` 对 `read_fail_path.current` 指定路径抛 EACCES，其余经 `importOriginal` 走真实 fs。文件系统属允许 mock 边界，mock 的是失败注入而非被测逻辑，未覆盖其它用例（`current` 置空 + try/finally 复位，无跨用例污染，套件全绿佐证）。
        - 「flags the source unreadable when one updates.jsonl cannot be read, still collecting the rest」（`:362-378`）：断言 `missing=true`、可读会话记录正常产出、坏文件跳过——直接触达 `readFileSync` 失败分支（ENOTDIR 测试走顶部提前返回，不覆盖此路径）。
        - 「retries an unreadable file on the next scan instead of skipping it forever」（`:380-403`）：首次失败断言 `missing=true`、records=0、`new_state.mtimes.has(file)===false`（未落 mtime）；恢复可读后第二次 scan 重新入账 records=1 input=100、`missing=false`——同时验证 mtime 时机修复与重试行为。
        - collector 侧 warn-once 传播（`result.missing → collector warn`）由既有 mocked 用例覆盖，reader 产出 `missing:file_unreadable` 由本组用例直接断言，两段分别测试、接缝为单一布尔标志，分层可接受。
- **t197_test_f002：已消除（维持 Round 2 判定，未回退）。** 精确路径断言仍在 `collector.test.ts:215-219`。

### 本轮新发现

无。

### 验证

本机复跑 4 个相关测试文件 121 用例全绿（grok-reader 15、collector 29、collector-state 8、token-stats-store 69）。协调者声明的 typecheck/lint/deadcode/arch 全绿与测试无关，未重跑。

## 结论（Round 3）

- 前轮 finding 复核：f001 已消除（目录级 ENOTDIR + 文件级部分采集 + 重试防永久跳过，三子项均有实现与直接测试）；f002 维持已消除。
- 改测方向复核：无。本轮改动为纯新增（两个 it 用例 + fs 部分 mock），未删改既有断言。
- 本轮新发现：0 条
- 未进表的提示：collector warn 文案仍为「sessions dir missing」（`collector.ts:305`），文件级不可读时措辞不精确，cosmetic 不阻断；AC3 端到端入库去重仍为可选扩展（同前轮）。
- 总体判断：全部 AC1-AC6 有直接测试且通过，无未解决 critical/important。
- 系统性 follow-up：无

verdict: PASS
