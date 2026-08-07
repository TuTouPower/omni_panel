# Task review t255（reviewer_focus: 通用）

- task：`t255_session_summary_head_read`
- spec：`docs/tasks/t255_session_summary_head_read/spec.md`
- diff_anchor：`72781fdfc6aefb20693062d292261ea31b33e7e4`
- target：`git diff 72781fdfc6aefb20693062d292261ea31b33e7e4`
- round：1
- reviewed_at：2026-08-07 22:45 UTC+8

## Findings

### t255_gen_f001 - 首条 user JSONL 行跨/超 64KB 边界时被截断返回空摘要（多字节 utf-8 边界未处理）

- 严重度：important
- 锚点：AC1（摘要显示内容与现状一致）；输入=首条 user 消息为单行 ≥64KB 的会话文件
- 位置：`src/main/core/session-history/head-read.ts:20-24`
- 问题：`read_head` 用 `readSync(fd, buf, 0, max_bytes, 0)` 在 64KB 字节边界硬截断后 `toString("utf-8")`。若首条 user 消息的 JSONL 行**起点在窗口内但整行超出 64KB**（长粘贴/长提示，单行 >64KB 现实可行），该行被截成残缺 JSON → `JSON.parse` 失败 → `extract_*_first_user` 返回空串；旧实现整文件读能正常解析并返回文本。截断点若落在多字节字符中间，`toString("utf-8")` 还会在该位置产出 U+FFFD。spike s020 采样统计的是首条 user 消息的字节**起始偏移**（"记录其字节偏移"），未验证整行包含在窗口内，"1997/2000=100%" 不覆盖此场景。
- 建议：截断后回退到最近完整 UTF-8 边界（`Buffer` 用 `StringDecoder` 收尾），并对窗口末行不完整 JSON 明确处置（读至下一换行补全该行，或作为已知限制在 spec 风险节写明）。最小修法至少消除 U+FFFD 污染。

### t255_gen_f002 - AC2 字节上界断言耦合 readSync 实现，无法防回退到整文件读

- 严重度：minor
- 锚点：AC2（读取字节数不超过上限）；测试可信度
- 位置：`tests/unit/main/core/session-history/head-read.test.ts:25-34, 63-78`
- 问题：AC2 测试经 mock `node:fs.readSync` 累计 `len` 断言上界。若 `read_head` 实现被改写为 `readFileSync`（整文件读，违反 AC2），mock 不触发 → `fs_spy.total_bytes_read` 恒 0 → `0 <= SUMMARY_HEAD_BYTES` 与 `0 < big.length/10` 均通过 → AC2 假绿。当前实现正确（readSync 64KB），断言对现行实现有效，但只认 readSync 这一种 API。
- 建议：同时 spy `readFileSync` 断言其未被 first_user 路径调用，或直接对 `read_head` 单测返回字符串字节长度 ≤ `SUMMARY_HEAD_BYTES`。

## 结论

- 前轮 finding 复核：Round 1 无前轮。
- 本轮新发现：2 条（1 important，1 minor）
- 未进表的提示：`docs/spikes/s020_summary_head_window/report.md` 只采样 win claude，WSL/kimi/grok 命中率未实测——spec 已声明为低风险，非本次发现。常量命名 `SUMMARY_HEAD_BYTES` 符合代码库既有 UPPER_CASE 惯例。
- 总体判断：实现正确（readSync 限量 64KB、缺失/失败返空、first_user 行解析逻辑与 max_lines 签名保持原语义、全量/增量提取路径 untouched），现有 first_user 测试与新 8 测试全部通过（extractor 46 passed），全量单测 240 文件/2576 用例通过。遗留 1 条 important（UTF-8 边界/超行截断导致 AC1 类输入空摘要，spike 方法学未覆盖），故本轮 FAIL；若按已知限制处置并写入 spec 风险节可复评。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-07 23:10 UTC+8)

### t255_gen_f003 - U+FFFD 测试名不副实：fixture 文件过小，从未切断多字节字符，StringDecoder 修复无回归保护

- 严重度：minor
- 锚点：f001 的 U+FFFD 修复可信度；测试「窗口边界不落多字节字符中间，不产出 U+FFFD」未触达其声称路径
- 位置：`tests/unit/main/core/session-history/head-read.test.ts:126-136`
- 问题：该测试 fixture 仅 `claude_line("user", "你好")`（约 50 字节）单行小文件，`window_end = min(max_bytes, raw.length)` 取整文件长度，窗口/READ_CAP 边界从未切断任何多字节字符，`not.toContain("�")` 恒真，不触达 StringDecoder 的残缺尾字节丢弃路径（head-read.ts:49-51）。该路径仅在文件 > READ_CAP 且余量内无换行时触发，尚无测试覆盖。代码本身正确（scratch 实测 READ_CAP 切断中文字符返回无 U+FFFD 且字节数 < READ_CAP），但此测试不保护该回归。
- 建议：构造长单行 user（中文字符填满，使 READ_CAP 恰好切断某字符中间），断言返回值无 U+FFFD 且字节数 < READ_CAP。

## 结论（Round 2）

- 前轮 finding 复核：
    - t255_gen_f001（important）：**修不彻底**。两部分：①U+FFFD 多字节污染——已修（StringDecoder 丢残缺尾字节，head-read.ts:49-51；scratch 实测 READ_CAP 切断中文字符时返回 69631 字节且无 U+FFFD）。②跨窗口/超行长截断——仅修一半：首条 user 行起始在 64KB 窗口内、行尾在 READ_CAP(68KB) 内时已补全解析（新测试「user 行起点在窗口内但整行跨窗口边界」验证 + scratch 实测 FULL TEXT）；但首条 user 行超 READ_CAP 仍被单次 readSync 硬截断 → JSON.parse 失败 → 空摘要（scratch 实测 user_text 5000B 起始于 65286、行尾 70330 > 69632 → 返回空串），即 f001 标题所述「跨/超 64KB 边界被截断返回空摘要」在超 READ_CAP 输入上仍复现。补全逻辑只搜已读入的 READ_CAP 缓冲，无二次 readSync（head-read.ts:30,38-44）。该残余限制未按 Round 1 复评条件写入 spec 风险节（spec.md 风险与回退仅覆盖「首条 user 位置靠后」，未覆盖「行超上限」）。
    - t255_gen_f002（minor）：**已修**。readFileSync mock 计数 spy（head-read.test.ts:36-40）+ 断言 `readFileSync_calls === 0`（:83）能捕获回退整文件读；AC2 上界断言改 ≤READ_CAP（:82），大文件 2MB 单测通过。
- 本轮新发现：1 条（minor f003）
- 未进表的提示：`head-read.ts:9-11` 注释「补读该行剩余部分到下一个换行符」与实际单次 readSync（余量仅 READ_CAP 内 4KB）不符，无二次读；`head-read.ts:45-47` `last_nl = -1` 为死赋值；spec 上下文区「头部读取上限取 64KB」与代码实际读取量 READ_CAP=68KB 略有出入（4KB 补全余量），非 AC 违背，处置为改 spec 措辞。
- 总体判断：f001 未彻底消除——首条 user 单行超 READ_CAP 仍返回空摘要（AC1 回归，与 f001 标题同类），且残余限制未按 Round 1 要求在 spec 风险节写明；仍有未解决 important → FAIL。typecheck / lint（改动文件）通过；head-read + claude extractor 相关单测 20 passed。
- 系统性 follow-up：无

verdict: FAIL

## Round 3 (2026-08-07 22:58 UTC+8)

### t255_gen_f003 - U+FFFD 测试 fixture 仍未切断多字节字符（Round 2 修不彻底，升格 important）

- 严重度：important
- 锚点：测试可信度——恒真断言；StringDecoder 回归路径无保护
- 位置：`tests/unit/main/core/session-history/head-read.test.ts:126-139`
- 问题：新 fixture `"x".repeat(65535) + claude_line("user", "你好")` 声称「窗口边界落在中文字符中间字节」（注释 :127-128），字节级验证为假。`claude_line("user","你好")` 共 47 字节，`你好` 位于行偏移 37 → 文件偏移 65572-65577；`window_end = min(65536, 65582) = 65536`，切在行字节 1（`"` 0x22，ASCII），距 `你好` 首字节还有 36 字节。`read_head` 返回 `"x"*65535 + "{"`（无换行、无 U+FFFD——边界未切多字节故天然无 U+FFFD），`extract_claude_code_first_user` 确定性返回 `""`，`expect(["你好",""])` 的「你好」分支恒死。即便删除 StringDecoder 改回 `toString`，该测试也不变红——StringDecoder 截断丢尾字节路径仍零回归保护。fixture 差 37 字节（JSON 包装前缀长），恰好等于未计及 `你好` 前 `{"type":"user","message":{"content":"` 的长度。
- 建议：filler 改 `"x".repeat(65498)`（`你好` 首字节落文件偏移 65535，被 65536 边界切断第一字节），断言改「返回值无 U+FFFD 且 `Buffer.byteLength(text) < READ_CAP`」；或至少重命名测试为「窗口截断残缺 JSON 行返回空串」以如实描述所测行为。

## 结论（Round 3）

- 前轮 finding 复核：
    - t255_gen_f001（important）：**同意接受取舍，已文档化**。spec.md 风险节新增「固有边界（接受取舍）」（`git diff` spec.md 末行）+ head-read.ts:12-14 头注释，两者一致且指向明确；取舍本身合理——限量读取与整文件读的本质差异，扩大窗口违背 AC2 初衷，spike s020 采样首条 user 命中 64KB 99.85%（1997/2000），超 READ_CAP 单行在真实会话概率极低。附注（非阻断）：spike 记录的是首条 user 行**起始偏移**非行长度，spec「行远小于此」为合理推断而非直接采样；「1997/2000=100%」系取整。
    - t255_gen_f002（minor）：**已修**。`readFileSync` spy（test :36-41）+ `readFileSync_calls === 0`（:83）+ AC2 上界 ≤READ_CAP（:82）完好。
    - t255_gen_f003（minor，Round 2）：**修不彻底，升格 important**。fixture 未切断多字节字符，测试对 StringDecoder 路径仍恒真（详见上方 finding）；实施侧声称「真切断」与字节级事实不符。
- 本轮新发现：0 条（f003 为前轮复核，非新 finding）
- 未进表的提示：head-read.ts:50 `last_nl = -1` 死赋值仍在（Round 2 已提示，非本轮新）；head-read.ts:9-10「补读该行剩余部分到下一个换行符」与实际单次 readSync 不符，现由 12-14 行固有边界说明补充，可接受。
- 总体判断：f001 残余已按 Round 1 复评条件文档化为接受取舍（处置充分）；f002 已修；f003 修不彻底——fixture 字节计算差 37 字节，测试对其声称的 StringDecoder 截断路径恒真，仍有未解决 important → FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 4 (2026-08-07 23:10 UTC+8)

### t255_gen_f003 - U+FFFD 测试仍双重空转，StringDecoder 回归路径零保护（Round 3 修不彻底，仍 important）

- 严重度：important
- 锚点：测试可信度——恒真断言；f001 解码修复无回归保护
- 位置：`tests/unit/main/core/session-history/head-read.test.ts:126-138`（filler 行 :129）
- 问题：fixture 改 `"x".repeat(65496)` 后仍不触达 StringDecoder 截断丢尾字节路径，两处独立原因，字节级实测证实：
    1. **字节计算仍差 2 字节**。`claude_line("user","你好")` = 47B，`你` 行偏移 37 → 文件偏移 65533。`你` 的 E4 BD A0 占 65533-65535，全在窗口（0..65535）内；`window_end=65536` 切在 `好` 首字节 E5（偏移 65536，被窗口排除）——干净的多字节边界。node 实测 `raw[65533..65537] = [228,189,160,229,165]`（E4 BD A0 + E5 A5），`subarray(0,65536)` 含完整 `你`、切掉整个 `好`；`read_head` 输出在有/无 StringDecoder 下字节级一致（均无 U+FFFD）。任务描述「E4 BD A0 跨 65535/65536」与字节事实不符（`你` 不跨 65536）。正确 filler 为 65498：`你` 首字节落 65535，窗口 0..65535 仅含残缺 E4，无 decoder 时 `toString` 产出 U+FFFD（node 实测 `plain toString contains U+FFFD: true`）。
    2. **断言层面结构性失效**。测试经 `extract_claude_code_first_user` 断言，该场景截断的残缺 JSON 行 `JSON.parse` 失败 → 恒返 `""`。node 实测 65496 / 65498 两种 filler 在有/无 StringDecoder 下 extractor 输出均为 `""`，`not.toContain("�")` 恒真。decoder 产出的 U+FFFD 只出现在 `read_head` 返回串的尾部残缺段，永远无法进入 extractor 成功解析的 user 文本——经 extractor 断言在结构上不可能触达 decoder 路径。
- 建议：filler 改 65498，且断言直接指向 `read_head` 返回值：`expect(read_head(file)).not.toContain("�")`（无 decoder 时该断言变红），可加 `Buffer.byteLength(text) < SUMMARY_HEAD_BYTES`（有 decoder 65535 < 65536，无 decoder 含 EF BF BD 为 65538 ≥ 65536，亦区分）；或改多行 fixture（窗口内 last_nl≥0、末行超 READ_CAP 截断 mid-char）使 read_head 尾部残缺由 decoder 丢弃。

## 结论（Round 4）

- 前轮 finding 复核（以 diff 与实测为准）：
    - t255_gen_f001（important）：**已文档化为接受取舍**。spec 风险节「固有边界（接受取舍）」与 head-read.ts:12-14 头注释一致、指向明确；取舍合理（限量读取本质差异、spike s020 命中 99.85%、超限单行现实概率极低）。不再 blocking。
    - t255_gen_f002（minor）：**已修**。`readFileSync` spy（test :36-41）+ `readFileSync_calls === 0`（:83）+ AC2 上界 ≤READ_CAP（:82）完好。
    - t255_gen_f003（important，Round 3）：**修不彻底**。fixture 65496 仍使切点落在干净多字节边界（`你` 完整在窗口内，切掉 `好` 整个字符），且断言经 extractor（恒返 `""`）在结构上无法观测 decoder 行为；删除 StringDecoder 改回 `toString` 该测试依旧通过（node 实测）。StringDecoder 丢尾字节路径仍零回归保护。
- 本轮新发现：0 条（f003 为前轮复核）
- 未进表的提示：head-read.ts:50 `last_nl = -1` 死赋值仍在（Round 2 已提示，非新）；补全逻辑 `last_nl >= 0` 前置条件使「首行即跨窗口的 <READ_CAP 短行」不触发补全（无前序换行），落入接受取舍家族，边缘性低，不列 finding；f003 fixture 用无换行 filler 使 last_nl=-1，与真实会话多行结构不符，加剧上述断言失效。
- 总体判断：f003 未消除——测试对其声称的 StringDecoder 截断路径仍双重恒真（fixture 字节差 2 + extractor 断言结构性失效），仍有未解决 important → FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 5 (2026-08-07 23:07 UTC+8)

### t255_gen_f003 复核（前轮 important）——已修，fixture 字节与断言均触达真实路径

- 结论：**已修**，不再 blocking。
- 证据（node 实测，非 implementer 自述）：
    1. **fixture 65498 字节级正确**。`claude_line("user","你好")`=47B，`你` 首字节 E4 落文件偏移 65535；`window_end = min(65536, 65545) = 65536`，窗口 0..65535 含残缺 E4、排除 BD A0。实测 `raw[65535..65540]=[228,189,160,229,165,189]`。`plain toString` 产 U+FFFD=true；`StringDecoder.write` 产 U+FFFD=false（输出 65535B < 窗口 65536B，残缺 E4 被丢弃）。「窗口边界切断多字节字符」名副其实。
    2. **断言直接测 read_head 返回值**（test :132-134）。`const text = read_head(file); expect(text).not.toContain("�")`——不再经 extractor（extractor 对残缺 JSON 恒返 "" 的结构性恒真已消除）。删除 StringDecoder 改回 `toString` 时该断言变红（U+FFFD 实测=true），StringDecoder 丢尾字节路径获得真实回归保护。

## 结论（Round 5）

- 前轮 finding 复核（以 diff 与实测为准）：
    - t255_gen_f001（important）：**已文档化为接受取舍**。spec 风险节「固有边界（接受取舍）」+ head-read.ts:12-14 头注释一致、指向明确；取舍合理（限量读取本质差异、spike s020 命中 100%、超限单行现实概率极低）。不再 blocking。
    - t255_gen_f002（minor）：**已修**。`readFileSync` spy（test :36-41）+ `readFileSync_calls === 0`（:83）+ AC2 上界 ≤READ_CAP（:82）完好。
    - t255_gen_f003（important，Round 3/4）：**已修**。fixture 65498 使 `你` E4@65535 被 65536 窗口截断（naive toString 实测产 U+FFFD），断言改为直接测 `read_head` 返回值 `not.toContain("�")`，无 decoder 时断言变红——测试不再恒真。
- 本轮新发现：0 条（f003 为前轮复核）
- 未进表的提示：head-read.ts:50 `last_nl = -1` 死赋值仍在（Round 2/4 已提示，非新）；head-read.test.ts:127-128 注释与字节事实一致；f001/f002 处置无新问题。
- 总体判断：全部前轮 blocker（f001 已作接受取舍文档化、f003 已修）经 diff/实测消除，无新 blocking；head-read 10 tests + session-history 9 files/121 tests 本地复跑通过（背景自述全量 2578 passed、e2e 35 passed、打包 smoke 4 passed、typecheck/lint 过）。无未解决 critical/important → PASS。
- 系统性 follow-up：无

verdict: PASS
