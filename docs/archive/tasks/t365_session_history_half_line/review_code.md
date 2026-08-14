# Task review t365（reviewer_focus: 代码）

- task：`t365_session_history_half_line`
- spec：`docs/tasks/t365_session_history_half_line/spec.md`
- diff_anchor：`75b3cb1924e7368909560338d10a4701954e8ac3`
- target：`git diff 75b3cb1924e7368909560338d10a4701954e8ac3`
- round：1
- reviewed_at：2026-08-14 11:50 UTC+8

## Findings

### t365_code_f001 - kimi UTF-8 截断测试未真正截断在多字节中间，且未断言 id 对齐

- 严重度：minor
- 锚点：AC-002 + spec 测试策略「补 UTF-8 多字节截断用例断言 id 对齐」
- 位置：`tests/unit/main/core/session-history/kimi-extractor.test.ts:142-160`
- 问题：用例名与注释声称「写入中断在 UTF-8 多字节中间」（:146），但 fixture `half_line` 以完整字符 `"text":"中文` 结尾（:148），截断落在字符边界而非多字节字符中间——`partial` 检测路径里 `buf.subarray(line_start, cursor.offset).toString()` 遇尾字节残缺产生 U+FFFD 的分支实际未触达。且断言仅 `toHaveLength(1)` + `text === "中文测试"`（:159-160），未按 spec 测试策略断言「字节 id 不错位」。
- 验证：我以字节级真·截断（`Buffer.subarray(0, len-1)` 去掉 `文` 尾字节，再补 0x87 + 后续）实测：`extract_kimi_code_incremental` 正确产出 `中文测试`、id 与全量一致。代码本身无缺陷，纯测试覆盖缺口。
- 建议：fixture 用 `Buffer` 字节截断制造真·多字节中间断点；断言补 `expect(inc.messages[0]?.id).toBe(re_full.messages.slice(-1)[0]?.id)`（对齐 grok-extractor.test.ts:115 测试的 id 断言强度）。

### t365_code_f002 - claude/kimi 增量 `seen` Set 为不触发的防御逻辑，注释表述与实际机制不符

- 严重度：minor
- 锚点：行为缺陷评估（重点问题 1：跨调用重发风险）
- 位置：`src/main/core/session-history/claude-code-extractor.ts:132-148`、`src/main/core/session-history/kimi-extractor.ts:157-164`
- 问题：注释「重读半行可能重发已提取消息——按 uuid/id 去重」成立的前提（同一消息跨调用被重发、需局部去重）在稳态 append-only 下不成立。游标单调推进且只停在两类位置：(a) `new_offset = buf.length`（尾部必为完整行或空，下一调用 `partial` 为完整 JSON→不回退）；(b) `new_offset = tail_start`（驻留行从未成功发出）。两条路径都不产生跨调用重发，窗口内 id 又唯一，故 `seen` 每次调用都空转、永不触发。它也不提供真正的跨调用去重（Set 每调用新建），若未来文件重写/非单调游标导致重发，真实兜底是上游窗口按 id 去重而非本 Set。
- 验证：`claude 半行驻留后补全→连续两次增量`（第二次追加 `a3` 仅返回 `a3`）与 `kimi 完整 JSON 无尾换行→推进末尾→下次仅返回新行` 两个实测均无重发。
- 建议：保留无妨（成本 O(1)/行，防未来回归）；建议修正注释，避免宣称其承担跨调用去重职责。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮 Round 1，无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - `extract_claude_code_incremental` / `extract_kimi_code_incremental` 近似圈复杂度约 10（base + kind 判断 + try/catch + partial 非空 + JSON 校验 try/catch + !complete + seen + tail 非空 + JSON 校验 try/catch + !complete），处于提示阈值附近，但为 grok 已存在逻辑的逐字节移植（`grok-extractor.ts:117-174`），未新增分支，不单独出 finding。
  - 文件规模：claude-code-extractor.ts 174 行、kimi-extractor.ts 189 行，均远低于 400 行阈值。
  - 范围外观察：grok 测试（grok-extractor.test.ts:113-146）额外断言 id 空间一致性、游标推进到 EOF 且下次增量不重读；claude 测试以 `ids=["u2","u3"]` 等价断言，kimi 测试仅断言文本。强度差异已并入 f001，不重复出。
- 总体判断：三端半行容错移植与 grok 完全一致（rollback 块、tail-park 块逐字节相同），AC-001/002/003 实现全部落地且实测正确；无未解决 critical/important，仅 2 条 minor（测试保真度 + 注释精确性）。PASS。
- 系统性 follow-up：无

verdict: PASS
