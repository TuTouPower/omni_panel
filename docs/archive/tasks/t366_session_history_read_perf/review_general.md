# Task review t366（reviewer_focus: 通用）

- task：`t366_session_history_read_perf`
- spec：`docs/tasks/t366_session_history_read_perf/spec.md`
- diff_anchor：`6217a964dd61ed4e91bd61180929708e10be4811`
- target：`git diff 6217a964dd61ed4e91bd61180929708e10be4811`
- round：1
- reviewed_at：2026-08-14 12:20 UTC+8

## Findings

### t366_gen_f001 - AC-002 未达成：claude/kimi 增量仍整文件 readFileSync，无新增轮询反增为 2 次全量读（回归）

- 严重度：important
- 锚点：AC-002「claude/kimi 增量只读新增字节，不全量读盘」
- 位置：`src/main/core/session-history/claude-code-extractor.ts:117-146`、`src/main/core/session-history/kimi-extractor.ts:142-171`
- 问题：spec 范围项 2 给的两种机制（`openSync/readSync` 只读剩余字节，或 `statSync` 比较后仅读增量）均未实现。全部分支仍是整文件 `readFileSync`：
  - 新增路径（每次 write，正是背景「每次 write 触发全量磁盘 IO」的抱怨对象）：`claude-code-extractor.ts:141-146` 整文件读，磁盘 IO 与 t366 前完全相同，无任何减少。
  - 无新增轮询（文件尾带换行、游标==size 的稳态）：`claude-code-extractor.ts:117-140` 先整文件读一次算 partial，`partial===""`（`claude-code-extractor.ts:129` 不命中）落到 `:141` 再整文件读第二次 = **2 次全量读**，比 t366 前 1 次更差（回归）。
  - 早退分支（partial 为完整 JSON）：`:120` 已整文件读，仅省掉空尾重 parse，磁盘读不减。
  - 注释 `claude-code-extractor.ts:115` / `kimi-extractor.ts:140`「无新增字节时零磁盘读（只 statSync）」与事实不符：该分支内必然整文件读。
  - 实测（tsx 打点 readFileSync）：trailing-newline 无新增轮询 = 2 次；grew 1 行 = 1 次；半行驻留无新增 = 2 次。kimi 同 claude。
  - 附带正确性小瑕疵：早退分支 `size<=offset` 由 statSync 决定，但 partial 用 readFileSync 的 buffer 算；statSync 与 readFileSync 之间若文件被写长，早退返回空且游标不变，新字节顺延到下一轮才检出（瞬时延迟，游标未推进，可自愈，非丢数据）。
- 建议：按 spec 范围项 2 选其一落地——用 `openSync`/`readSync` 从 `cursor.offset` 只读剩余字节；或 size>offset 时也只用 `read` 读 `size-offset` 增量再拼 head。半行特判所需「offset 前内容」可用窄读（如只读 offset 附近一行范围）判定，不必整文件读。修正注释使其与真实读行为一致。

### t366_gen_f002 - AC-003 测试不区分新旧实现：55 条 assistant 被 INNER JOIN 剔除，旧 SQL 同样返回「你好」

- 严重度：important
- 锚点：AC-003；测试可信与覆盖（危险模式恒真断言最低 important）
- 位置：`tests/unit/main/core/session-history/opencode-extractor.test.ts:302-321`
- 问题：`FIRST_USER_PARTS_QUERY` 是 INNER JOIN（`opencode-extractor.ts:91` JOIN message m ON m.id = p.message_id）。测试在 `:308-317` 只插入 55 条 part（`message_id=msg_asst_N`），未插入对应 message 行，55 条全部被 JOIN 剔除（fixture 的 message 表仅 msg_user_1/msg_assistant_1 两行）。已实测：旧 SQL（无 role 过滤、LIMIT 50）对该数据同样返回「你好」，测试在旧代码上也会绿。注释 `:319`「旧 LIMIT 50 恰好截断在此处」不成立——剔除来自 JOIN，非 LIMIT 截断。该测试无法阻止 role 过滤被回退。
- 建议：为 55 条 assistant part 补插入 `role="assistant"` 的 message 行，使 JOIN 命中；此时旧 SQL 会返回「助手 0」、新 SQL 返回「你好」，测试才真正区分修复。生产 SQL 修复本身正确（`opencode-extractor.ts:94` 加 role='user' 过滤 + `:96` LIMIT 1），不涉及生产代码改动。

### t366_gen_f003 - claude/kimi 新增早退块无测试，spec 声明「断言续读字节量」未落实

- 严重度：minor
- 锚点：spec `docs/tasks/t366_session_history_read_perf/spec.md:52` 可测试性声明「extractor 单测断言续读字节量、opencode 首条 user 提取边界」
- 位置：`claude-code-extractor.ts:117-140`、`kimi-extractor.ts:142-165`、`grok-extractor.ts:153-157`
- 问题：本 diff 未给 claude/kimi 新增任何测试，早退/半行特判块零覆盖；grok/claude/kimi 均无断言读取字节量或「不再重 parse 前缀」的测试。AC-001 的「不再每轮全量重 parse 前缀」仅由 id 一致性用例（`grok-extractor.test.ts:91-113` 走 valid_count 快路径、`115-140` 走旧 cursor 回退）间接验证——若删掉 valid_count 优化恒回退重 parse，这些测试仍绿，AC-001 核心行为无门禁。
- 建议：为 claude/kimi 补「无新增时 readFileSync 调用数 / 读取字节量」断言（vitest spy 可行），并给 grok 补 valid_count 快路径不重 parse 的调用计数断言，落实 spec 声明。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：3 条
- 未进表的提示：无
- 总体判断：AC-002 未达成（无新增稳态 2 次全量读、grew 路径全量读不变，spec 范围项 2 两种机制均未实现），AC-003 测试不具判别力，均属未解决 important → FAIL
- 系统性 follow-up：建议后续 task（slug 建议 `claude_kimi_incremental_bounded_read`）按范围项 2 落地 claude/kimi 增量有界读；无既有 tid

verdict: FAIL

## Round 2 (2026-08-14 12:33 UTC+8)

- task：`t366_session_history_read_perf`
- spec：`docs/tasks/t366_session_history_read_perf/spec.md`
- diff_anchor：`6217a964dd61ed4e91bd61180929708e10be4811`
- target：`git diff 6217a964dd61ed4e91bd61180929708e10be4811`
- round：2
- reviewed_at：2026-08-14 12:33 UTC+8
- 测试可运行：`npx vitest run tests/unit/main/core/session-history` 9 文件 147 passed / 1 skipped 全绿（含 claude 新增零读测试、grok 旧 cursor 回退测试、opencode 前 55 条 assistant 测试）。

## Findings

本轮新 finding 无（f002 修复引入的注释事实错误并入 f002 复核说明）。

## 结论

- 前轮 finding 复核（以 diff 与实跑为准，不采信处置自述）：

    - **f001（important，AC-002 早退仍全读）——部分修复，AC-002 核心行为仍未达成。**
      - 已消除部分：早退分支改 `statSync(file).size` 比较，`size <= cursor.offset` 时 `return { messages: [], cursor }`，该路径纯 statSync 零 `readFileSync`（`claude-code-extractor.ts:109-120`、`kimi-extractor.ts:134-145`）。Round 1「无新增稳态 2 次全量读」回归消除（现 0 次），`:115` 注释修正为与事实一致。
      - 半行驻留/完整尾行不破坏：半行驻留时 offset 停在行首 < size，不早退、走下方半行容错重读（游标不推进、不丢记录）；完整尾行时 offset==size 早退空、不重发。既有 t365 两用例（半行写入 / 完整末行无尾换行）全绿。**早退纯 statSync 零读已实证**：`.scratch/f003_mock_check.test.ts` 独立 mock 校验，无新增增量 read_count 保持 0。
      - **仍存在**：grew 路径（`size > offset`）仍整文件 `readFileSync`（`claude-code-extractor.ts:121-126`、`kimi-extractor.ts:146-151`），只消费尾部，磁盘 IO 与 t366 前相同。AC-002「claude/kimi 增量只读新增字节，不全量读盘」字面未达成；spec 范围项 2 的两种机制（`openSync/readSync` 只读剩余字节、statSync 比较后仅读增量）均未实现，仍只做了 statSync 早退。
      - 实际影响放大：`subscription-service.ts:180` claude-local 走 `fs.watch`（仅 change 事件调 `handle_change`）、其余走 2s mtime 轮询（`subscription-service.ts:223-234` 仅 mtime 变化调 `on_change`）——增量提取器**只在文件真实变化时被调用**，无新增早退在生产流程中几乎不可达，每次真实调用都是 grew 全量读。背景抱怨「每次 write 触发全量磁盘 IO」在 watch 模式下仍是每次 write 一次全量读。早退收益仅限合并单次 write 的重复 fs.watch 事件（次要）。AC-002 主诉未解决。

    - **f002（important，opencode 测试不区分新旧实现）——未修复，测试仍无判别力。**
      - 修复补插 55 条 `role="assistant"` 的 message 行使 JOIN 命中（`opencode-extractor.test.ts:302-333`），但 55 条在 fixture 的 user part **之后**插入：fixture `build_fixture` 先插 `prt_u1`（`opencode-extractor.test.ts:102-109`，rowid 最低），55 条 assistant part 随后插入（rowid 更高）。`ORDER BY p.rowid ASC` 下 user part 排最前，旧 SQL（无 role 过滤、LIMIT 50）返回前 50 条含 `prt_u1` =「你好」，新 SQL 亦「你好」。
      - 实证（`.scratch/f002_repro.mjs` 复刻 fixture + 55 条插入）：old SQL 50 行首条文本「你好」、new SQL 1 行「你好」，两 SQL 返回相同 → 测试仍无法检测 role 过滤被回退。
      - 注释「旧 LIMIT 50 恰好截断在此处」（`opencode-extractor.test.ts:304-305`）与事实不符：截断来自 rowid 顺序（user part 在前 50 内），非 LIMIT 对 assistant 的截断。Round 1 建议「补 message 行使 JOIN 命中」已照做，但未解决 rowid 顺序——要真区分，55 条 assistant 必须 rowid 先于 user part（如独立新库先插 55 条 assistant 再插 user part，或 user part 最后插入）。

    - **f003（minor，测试缺口）——部分修复，claude 零读断言已落实且真拦截，kimi 仍未补、grok 快路径仍无直接断言。**
      - claude：新增「无新增时增量零磁盘读」测试（`claude-code-extractor.test.ts:122-141`），`vi.mock("node:fs")` 包 `readFileSync` 计数。**mock 真拦截提取器已实证**：`.scratch/f003_mock_check.test.ts` 三用例——全量 extract 计数>0（拦截生效）、无新增早退计数=0（真零读）、grew 读盘计数>0。零读断言非恒真。
      - kimi：仍无新增测试，早退块零覆盖（Round 1 建议 claude/kimi，kimi 未补）。
      - grok：新增「旧 cursor（无 valid_count）回退重 parse 前缀」测试（`grok-extractor.test.ts:115-141`）验证回退路径 id 延续全量空间（正确，全绿）；但 Round 1 建议的「valid_count 快路径不重 parse」直接断言仍缺——新增测的是回退路径，非快路径跳过重 parse。

- 本轮新发现：0 条
- 未进表的提示：
  - kimi `scan_lines` 单 slice 复用（`kimi-extractor.ts:50-53`）语义与旧等价（同内容、同字节计账，少一次切片分配），正确。
  - `types.ts` valid_count 可选字段向后兼容（旧 cursor 缺字段走回退重 parse），正确。
- 总体判断：f003 已实质修复（claude 零读断言真拦截）；f002 完全未修（测试仍恒真、注释事实错误）；f001 部分修复（早退真零读、回归消除）但 AC-002「只读新增字节」在 grew 主路径未实现、生产流程中早退几乎不可达。两 important 未解决 → FAIL
- 系统性 follow-up：沿用 Round 1 建议后续 task（slug 建议 `claude_kimi_incremental_bounded_read`）按范围项 2 落地 grew 有界读；无既有 tid

verdict: FAIL

## Round 3 (2026-08-14 12:47 UTC+8)

- task：`t366_session_history_read_perf`
- spec：`docs/tasks/t366_session_history_read_perf/spec.md`
- diff_anchor：`6217a964dd61ed4e91bd61180929708e10be4811`
- target：`git diff 6217a964dd61ed4e91bd61180929708e10be4811`
- round：3
- reviewed_at：2026-08-14 12:47 UTC+8
- 测试可运行：`npx vitest run tests/unit/main/core/session-history` 9 文件 147 passed / 1 skipped 全绿（含 claude 零读测试、opencode 前 55 assistant 新库测试、grok 旧 cursor 回退测试）。

## 前轮 finding 复核（以 diff 与实测为准，不采信处置自述）

### f001（important，AC-002 grew 仍全量读）——已修复，AC-002 达成。

- **bounded read 真只读增量**：`claude-code-extractor.ts:124-136` / `kimi-extractor.ts:149-161` 改为 `openSync` + `readSync(fd, buf, 0, read_len, read_start)`，窗口 `[cursor.offset - min(offset,4096), statSync-size)`，单次 `readSync`，读盘 ≤ 4096 + 增量字节。**实证**（临时 mock readSync 捕获位置/长度，跑后删除）：1MB 文件 append 一行后仅 1 次 `readSync`，`pos = offset - 4096`、`len = 4096 + 增量`，窗口不含文件头；增量消息「NEW」正确提取。无新增早退纯 `statSync`（`:118-120` / `:143-145`），本轮 mock 复测 `readFileSync` 计数 0。
- **半行容错相对偏移自洽**：`rel_offset = cursor.offset - read_start`（`:138` / `:163`），`nl_before`/`line_start`/`partial`/`parse_start` 全为相对 `read_start`；`abs_new_offset = new_offset + read_start`（`:195` / `:212`）。与 anchor 版逐行比对语义同构：anchor 整文件 `buf` 下同逻辑用绝对 offset，新代码在窗口内同逻辑用相对 offset，窗口首字节即 `read_start`，转换唯一正确。cursor 恒停行边界（`new_offset` 取尾行换行后 `tail_start` 或 `buf.length`），故 `nl_before` 落在 `rel_offset-1`，back_read=4096 生产路径不 bind；超长（>4096）半行仅防御路径可达，退化安全（不回退、不丢）。游标单调、无新增不再反增读次数，Round 1「2 次全量读」回归消除。
- **kimi 字节 id 对齐**：`scan_lines(tail_text, read_start + parse_start)`（`kimi-extractor.ts:187`）base 为绝对字节，窗口内逐行累计与全量同一物理行 id 一致。既有 kimi 用例（id 稳定 `kimi-extractor.test.ts:48`、增量==全量尾部 `:79`、UTF-8 截断字节 id 不错位 `:142`）全绿。

### f002（important，opencode 测试不区分新旧实现）——已修复，真判别。

- 测试改独立新库（`opencode-extractor.test.ts:302-354`）：先插 55 条 assistant（message+part，rowid 1-55）再插 user（rowid 56）。**实证**（`.scratch` 复刻 fixture + 双 SQL 跑 first_user 语义，跑后删除）：旧 SQL（无 role 过滤、LIMIT 50）取 50 行全 assistant，`first_user` JS 侧 `msg?.role === "user"` 过滤后返回 **空串**；新 SQL（`role='user' LIMIT 1`）返回「真实首条」。断言 `toBe("真实首条")` 在旧 SQL 下必失败 → role 过滤回退可被测试拦截，判别力真实（实测方向与 Round 2 建议一致）。
- 注释小瑕疵（不阻断）：`:307`「旧 LIMIT 50 恰好截断在此处…取第 50 条 assistant」不精确——实测旧 SQL 因 JS 侧 role 过滤返回空串而非「助手 49」，判别来自 SQL role 过滤而非 LIMIT 截断。建议下轮修注释措辞。

### f003（minor，claude 零读计数测试）——已修复（claude），kimi/grok 两处 minor 残余。

- **claude mock 真拦截提取器**：`vi.mock("node:fs")` 包 `readFileSync` 计数（`claude-code-extractor.test.ts:8-20`），零读断言 `:134-137`。本轮独立 mock 复测（临时测试跑后删除）：全量 `extract_claude_code` 后 `read_count > 0`（mock 真拦截）、增量 grew 路径 `read_count = 0` 且增量正确提取（bounded read 走 `readSync` 不触 `readFileSync`）。断言非恒真，无新增时早退块已被门禁。
- **kimi 残余**：仍无「零读 readFileSync 计数」断言；行为测试「未追加新内容返回空、cursor 不变」（`kimi-extractor.test.ts:69`）已覆盖行为，且 kimi 早退块与 claude 结构同构（`:143-145`），风险低。Round 2 已标注，本轮未补。
- **grok 残余**：新增测试（`grok-extractor.test.ts:115-141`）测的是**旧 cursor（无 valid_count）回退重 parse** 路径，非 Round 1 建议的「valid_count 快路径不重 parse」直接断言；快路径由既有 id 一致性用例间接覆盖。Round 2 已标注，本轮未补。

## 本轮新发现

0 条。

## 未进表的提示

- **kimi scan_lines 重构（`kimi-extractor.ts:49-54`）**：功能等价、字节计账正确（既有 id/UTF-8 用例全绿）。但 Round 2「少一次切片分配」观察不精确——仍是每行 2 次 slice（`raw_line` + `raw_line.slice(0,-1)`），只是复用变量未复用切片；V8 SlicedString 廉价，收益约零。非 AC、非回归，不阻断。
- **f002 测试注释**：旧 SQL 实际返回空串（非「助手 49」），见 f002 复核；建议措辞修正。
- **bounded read 截断语义**：statSync 与 readSync 间文件被截断会回退 4096 字节重读（JSONL append-only 假设外），与 anchor 一致属范围外，不阻断。

## 结论

- 前轮 finding 复核：f001 已修复（grew 有界读 + 早退零读实证，AC-002 达成）；f002 已修复（新库测试真判别）；f003 已修复（claude mock 真拦截），kimi/grok 各留 minor 残余（无数读计数 / 快路径直接断言）
- 本轮新发现：0 条
- 未进表的提示：kimi scan_lines 仍 2 切片（Round 2 提示修正）；f002 注释措辞；截断重读范围外
- 总体判断：两 important（f001/f002）全部解决且实证；剩余为 minor 残余与注释瑕疵 → PASS
- 系统性 follow-up：无

verdict: PASS
