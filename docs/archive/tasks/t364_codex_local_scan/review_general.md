# Task review t364（reviewer_focus: 通用）

- task：`t364_codex_local_scan`
- spec：`docs/tasks/t364_codex_local_scan/spec.md`
- diff_anchor：`345e739dea95c2ba34c9c02ca533ba109b8c9f20`
- target：`git diff 345e739dea95c2ba34c9c02ca533ba109b8c9f20`
- round：1
- reviewed_at：2026-08-14 11:30 UTC+8

reviewed_scope: 9d12dd1ceab0214b

## Findings

### t364_gen_f001 - AC-001/AC-002 跳过测试断言恒真，未验证「跳过」本身

- 严重度：important
- 锚点：AC-001 / AC-002（「超大/非目标扩展名文件被跳过」）；spec 测试策略声明「断言……超大文件被跳过」
- 位置：`tests/integration/connector/codex-connector.test.ts:193`、`tests/integration/connector/codex-connector.test.ts:224`
- 问题：
  - `skips oversized session files`（:193）断言 `expect(result.observations.some((o) => o.raw_label)).toBe(true)`。normal.jsonl 必然产出观测，该断言相对 size 过滤恒真。若删除 `connectors/codex/connector.ts:76` 的过滤，huge.jsonl 内嵌的有效会话（total_tokens 500）会并入 → gpt-5 的 used 由 500 变 1000，但 `some(...)` 仍为 true，测试照常通过。故该测试无法检测 AC-001「跳过超大文件」回归。
  - `skips non-jsonl files in session dirs`（:224）同理。notes.txt 内容为 `not a session file`，非合法 JSONL；即使删除 `connectors/codex/connector.ts:58` 的 `.jsonl` 过滤，read+parse 也会因 `JSON.parse` 失败而无产出，`some(...)` 仍 true。故该测试无法检测 AC-002 扩展名过滤回归。
  - 两条测试只验证正向路径（正常 .jsonl 仍产出），未验证负向路径（被跳过文件确实未贡献）。`handoff.json` `ac_evidence` 引用这两条测试作为 AC-001/AC-002 跳过行为的证据，该证据不成立。
- 建议：
  - AC-001：断言精确用量，如 `expect(result.observations[0]?.used).toBe(500)`（huge 若被解析则 used=1000），或断言 observations 长度为 1。
  - AC-002：让 notes.txt 携带可产出观测的合法会话（独立 model 名），并断言该 model 的观测不存在。

### t364_gen_f002 - MAX_FILE_BYTES 名不副实：比较的是字符数非字节数

- 严重度：minor
- 锚点：无 AC 违例
- 位置：`connectors/codex/connector.ts:8`、`connectors/codex/connector.ts:76`
- 问题：常量名 `MAX_FILE_BYTES` 暗示字节上限，实际比较 `content.length`（UTF-16 码元，即字符数）。含多字节字符（如 codex 会话内 CJK 文本）的 5M 字符文件，UTF-8 字节可达 ~15-20MB。功能上可接受——被约束的 parse 成本正比于字符数而非字节数，且 `ctx.files` 仅 read/list 无 stat 元数据可做 read 前过滤；行 7 注释已写明「字符」。仅命名误导后续维护者。
- 建议：改名 `MAX_FILE_CHARS` 或在注释强化「字符数」。

## 结论

- 前轮 finding 复核：首轮，无
- 本轮新发现：2 条（1 important / 1 minor）
- 未进表的提示：
  - 超大文件 read 仍全读后才按 size 丢弃（`connector.ts:71` read → `:76` 判断），单文件 read 内存无法 read 前过滤。这是 spec「风险与回退」明示接受的降级方案（「或先用 size 上限跳过超大文件作为最小改动」），不判 blocking；若线上出现极大会话文件，采集内存仍会瞬时上涨。
  - 5MB 阈值未对照真实 codex 会话大小验证，超长 tool 输出会话可能被静默丢弃致用量低估，且跳过路径无日志（文件内也无任何 ctx.log 调用）。属阈值合理性观察，未达 blocking 阈值。
- 总体判断：实现正确、范围无偏航、AC 行为达成（`connector.ts:58` list 后扩展名过滤、`:76` read 后 parse 前 size 过滤，位置正确）；但两条新增测试断言恒真，无法验证 AC-001/AC-002 的跳过行为，与 spec 测试策略承诺不符。测试可信缺陷，按模板「恒真断言最低 important」判 blocking。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` —— 代码直查 `connector.ts:76`（read 后、split/parse 前按 `content.length > MAX_FILE_BYTES` continue）+ `skips oversized` 测试通过。注意：测试仅证正向产出，跳过负向断言见 f001。
- AC-002：`re_verified` —— 代码直查 `connector.ts:58`（list 后、read 前按 `.endsWith(".jsonl")` 过滤）+ `skips non-jsonl` 测试通过。注意：测试无法区分过滤生效与否，见 f001。

coverage = 2 / 2

verdict: FAIL

## Round 2 (2026-08-14 11:40 UTC+8)

- task：`t364_codex_local_scan`
- spec：`docs/tasks/t364_codex_local_scan/spec.md`
- diff_anchor：`345e739dea95c2ba34c9c02ca533ba109b8c9f20`
- target：`git diff 345e739dea95c2ba34c9c02ca533ba109b8c9f20`
- round：2
- reviewed_at：2026-08-14 11:40 UTC+8
- 测试可运行：`npx vitest run tests/integration/connector/codex-connector.test.ts` 5 passed（含 2 条新增跳过测试）。跳过断言区分力经临时删过滤变异实跑验证，验证后精确还原（`connector.ts` sha256 与变异前一致），恢复全绿。

## Findings

本轮新 finding 1 条（minor）。

### t364_gen_f003 - 测试注释残留旧常量名 MAX_FILE_BYTES（f002 改名不彻底）

- 严重度：minor
- 锚点：无 AC 违例；f002 修复引入的残留
- 位置：`tests/integration/connector/codex-connector.test.ts:181`
- 问题：f002 已把 `connectors/codex/connector.ts` 的 `MAX_FILE_BYTES` 改名 `MAX_FILE_CHARS` 并同步注释（`:7/:75`），但测试 `:181` 注释仍写 `// > MAX_FILE_BYTES`，引用已不存在的常量名。`5 * 1024 * 1024 + 1` 数值正确，纯注释过期，无功能影响。handoff.json `ac_evidence.AC-001` 文本同样残留 `> MAX_FILE_BYTES`（该文件未入库，不在 diff）。
- 建议：测试注释改 `> MAX_FILE_CHARS`；handoff.json 文本同步。

## 结论

- 前轮 finding 复核（以 diff 与变异实跑为准，不采信处置表）：
    - **f001（important，测试恒真）——已消除。** 两条跳过测试改用灵敏断言，均经删过滤变异实跑验证真区分：
        - AC-001 子项：`codex-connector.test.ts:194` 断言 `result.observations[0]?.used === 500`。变异验证：临时删除 `connector.ts:76` 的 size 过滤后实跑，失败 `expected 1000 to be 500` —— huge.jsonl 内嵌 gpt-5 会话（500）与 normal.jsonl（500）并入同一 `gpt-5|2026-06-14` 聚合键。断言真区分跳过（删除过滤必失败）。
        - AC-002 子项：notes.txt 改为可产出观测的独立 model（txt-model，900 tokens，`codex-connector.test.ts:199-213`），断言 `some(raw_label === "txt-model")` false（`:240`）+ `gpt-5` true（`:241`）。变异验证：临时删除 `connector.ts:58` 的 `.jsonl` 过滤后实跑，失败 `expected true to be false` —— txt-model 观测出现。断言真区分扩展名过滤；Round 1 缺陷正是 notes.txt 内容为非法 JSON（删过滤也解析不出），现内容合法、删过滤必被捕获。
    - **f002（minor，MAX_FILE_BYTES 名不副实）——已消除。** 常量改名 `MAX_FILE_CHARS`（`connector.ts:8`），注释同步（`:7/:75`），用法一致（`:76` `content.length` 即字符数，与 parse 成本正比）。遗留测试注释过期见 f003。
- 本轮新发现：1 条（minor，f003）。
- 未进表的提示：
    - AC-001 断言依赖「huge 首行 `"x"` 无引号串 `JSON.parse` 失败 + 内嵌 valid_session 解析成功」两层事实：删过滤后 huge 仅经内嵌会话并入，`used` 由 500→1000 精确可辨。已由变异实跑证实。
    - Round 1「未进表提示」两点（read 全读后按 size 丢弃的内存瞬时上涨、5MB 阈值未对照真实 codex 会话验证）状态不变，非本 diff 阻断。
    - handoff.json `ac_evidence.AC-001` 文本残留旧常量名，见 f003 建议（文件未入库，不在 diff）。
- 总体判断：f001 两条断言经删过滤变异实跑证实真区分回归，f002 改名到位；仅余测试注释过期的 minor（f003），无未解决 critical/important。
- 系统性 follow-up：无

verdict: PASS
