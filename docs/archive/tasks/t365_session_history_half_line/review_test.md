# Task review t365（reviewer_focus: 测试）

- task：`t365_session_history_half_line`
- spec：`docs/tasks/t365_session_history_half_line/spec.md`
- diff_anchor：`75b3cb1924e7368909560338d10a4701954e8ac3`
- target：`git diff 75b3cb1924e7368909560338d10a4701954e8ac3`
- round：1
- reviewed_at：2026-08-14 11:50 UTC+8

## 验证

`npx vitest run tests/unit/main/core/session-history` → 9 files 通过（142 passed | 1 skipped），claude-code-extractor 11、kimi-extractor 15、grok-extractor 15 全绿。新增三测试（claude 半行、kimi 半行、kimi UTF-8）均在列并通过。

## Findings

### t365_test_f001 - kimi UTF-8 测试未真构造「多字节中间截断」，注释与数据不符

- 严重度：minor
- 锚点：AC-002（UTF-8 截断场景）测试覆盖弱于测试名/注释所声称
- 位置：`tests/unit/main/core/session-history/kimi-extractor.test.ts:142-164`（注释 :146）
- 问题：:146 注释「写入中断在 UTF-8 多字节中间」与实际数据不符。half_line（:147-148）以完整字符 `中文`（6 字节完整序列）结尾，writeFileSync 后文件末字节落在字符边界，`extract_kimi_code` 返回的 cursor.offset 天然字符对齐。增量回退逻辑只在 cursor 落非字符边界（半行截断在多字节序列中间）时才有「subarray 自非字符边界解码乱码」的专项风险，该场景未被构造。真 mid-char 截断下旧实现 `subarray(cursor.offset)` 解码产生 U+FFFD 乱码、整行丢失，测试对旧实现仍可区分（toHaveLength(1) 失败），但 UTF-8 专项修复路径的触发条件（cursor 非字符对齐）未真正建立，测试实际验证的是「回退到行边界重读」这一通用路径，非 AC-002 的 UTF-8 专项。
- 建议：以 Buffer 截断构造真 mid-char 场景——`Buffer.from(half_line,'utf-8').subarray(0, bytes.length-1)` 写盘（去掉末字符末 1 字节），使 cursor 落多字节中间，再断言补全后 text 完整且不乱码。或将注释降级为「半行含多字节字符」。

### t365_test_f002 - kimi 新增两测试均未断言 id，AC-002「字节 id 不错位」的 id 对齐面未直接验证

- 严重度：minor
- 锚点：AC-002（字节 id 不错位）
- 位置：`tests/unit/main/core/session-history/kimi-extractor.test.ts:112-164`；对照 `src/main/core/session-history/kimi-extractor.ts:36`、`grok-extractor.test.ts:91-113`
- 问题：kimi 消息 id 为字节 offset 派生（`kimi:${line_start_offset}`，kimi-extractor.ts:36）。两个新增测试只断言 text（:135-136、:159-160），不断言 id。若增量实现的 base_offset 传错（例如 scan_lines 收到 cursor.offset 而非回退后的 line_start），消息仍在且 text 正确，两测试全绿，但同一物理行的增量 id 与全量 id 不一致——下游 merge_tail 按 id 去重会把补全消息当重复丢弃（grok p050 测试注释明示该风险）。grok 参考测试（grok-extractor.test.ts:91-113）显式断言增量 id 与全量 id 命名空间不冲突，claude/kimi 半行测试未移植该断言。
- 建议：kimi 两测试补一条断言——对补全后的文件 `extract_kimi_code` 全量重提取，断言增量返回消息的 id 与全量末尾同物理行消息 id 相等（同 grok 的 id 命名空间校验）。

### t365_test_f003 - claude/kimi 无 grok f001 等价用例（完整末行无尾换行：增量不重发、游标推进到文件末尾）

- 严重度：minor
- 锚点：新移植游标推进逻辑的覆盖扩展（非 AC 违约）
- 位置：`tests/unit/main/core/session-history/claude-code-extractor.test.ts:79-107`、`kimi-extractor.test.ts:112-164`；对照 `grok-extractor.test.ts:157-185`
- 问题：t365 新增半行测试补全后的文件均以 `\n` 结尾（claude :97、kimi :129），增量读取时尾部为空、只命中 new_offset 的「tail 空 → 前进」分支；「tail 为完整 JSON 但无尾换行 → 前进不重发」分支（新移植逻辑 kimi-extractor.ts:167-183）在 claude/kimi 全测试文件（含既有「增量追加新行」用例，其 append 均带尾换行）无任何覆盖。grok 以独立用例 f001（grok-extractor.test.ts:157）覆盖该分支。此为可选覆盖扩展，AC-001/002/003 核心行为均已测。
- 建议：如需对齐 grok 覆盖，为 claude/kimi 补 f001 等价用例：完整末行无尾换行 → 增量返回空、游标推进到文件末尾。

## 结论

- 前轮 finding 复核：round 1，无。
- 改测方向复核：无。diff 仅新增三个 it 块，未改任何既有断言预期，无「迁就实现」改测。
- 本轮新发现：3 条（全 minor）。
- 未进表的提示：claude 侧 id 为 uuid（非字节派生），无字节 id 对齐风险；claude 半行测试已断言精确 `ids=[u2,u3]`，id 集合与长度覆盖充分。kimi 半行测试未断言 id 同 f002。
- 总体判断：三个新增测试全绿、真区分旧实现（旧实现 subarray(cursor.offset) 跳过补全半行 → 断言失败）、触达生产逻辑、断言可观察行为，无危险模式命中；AC-001/002/003 核心行为（半行不丢记录、UTF-8 消息不丢、等价 grok 半行测试）均已验证，仅 3 条 minor 覆盖强化建议，无未解决 important/critical。
- 系统性 follow-up：无。

## 审查问题回应

- (1) 半行测试真区分旧实现？是。半行 content「半行前半」在 cursor 之前，旧实现 `subarray(cursor.offset)` 自半行中段续读，补全行整体丢失 → `expect(texts).toContain("半行前半半")` 与 `expect(ids).toEqual(["u2","u3"])` 均失败。新实现回退到 line_start 重读完整行 → 通过。claude/kimi 两半行测试均成立。
- (2) UTF-8 测试真验证截断处理？部分。对旧实现可区分（丢整行 → toHaveLength(1) 失败），但 cursor 落字符边界，真 mid-char 截断（subarray 自非字符边界解码乱码）未被构造，UTF-8 专项路径未真正触发；且 id 未断言。见 f001/f002。
- (3) ids=[u2,u3] 真验证去重？部分。该断言验证增量结果精确 id 集合与长度——若重读半行产生 u2 重复发射或丢 u3，toEqual 失败。但 u2 全量提取时是不完整行（未发出），重读不构成跨调用重复，seen-set 去重分支未被行为触发，属惰性但可观察层已约束。
- (4) 覆盖「尾部完整行无尾换行」？否。grok 以 f001（grok-extractor.test.ts:157）覆盖；claude/kimi 无等价用例，且既有测试 append 均带尾换行，该分支全仓未覆盖。见 f003。

verdict: PASS
