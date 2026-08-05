# Task review t209（reviewer_focus: 通用）

- task：`t209_session_history_extractors`
- spec：`docs/tasks/t209_session_history_extractors/spec.md`
- diff_anchor：`1a48081f48a32c3641c71c2d12a5d2c166ad71cb`
- target：`git diff 1a48081f48a32c3641c71c2d12a5d2c166ad71cb`
- round：1
- reviewed_at：2026-08-05 13:19 UTC+8

## Findings

### t209_gen_f001 - JSONL 三端增量 AC5 核心场景（追加内容）未覆盖

- 严重度：important
- 锚点：违反 AC5「四端增量提取：给定一个全量提取后的游标/offset，对追加内容做增量提取，结果与全量重提取的尾部一致，不重发已提取消息」——只覆盖「不重发」，未覆盖「对追加内容做增量提取，结果与全量重提取的尾部一致」
- 位置：`tests/unit/main/core/session-history/claude-code-extractor.test.ts:34-40`、`tests/unit/main/core/session-history/grok-extractor.test.ts:43-48`、`tests/unit/main/core/session-history/kimi-extractor.test.ts:74-85`
- 问题：三端的增量用例都只断言「未追加新内容 → 增量返回空」，即只验证「不重发已提取消息」。没有任何用例构造「文件追加新 JSONL 行后调用 incremental」的场景，因此 `extract_*_incremental` 的核心行为（按 byte offset 续读追加字节、解析新行、产出新消息、新 cursor 推进）从未被测试触达。`extract_claude_code_incremental` 中 `buf.subarray(cursor.offset).toString("utf-8")` 这条关键路径在测试里从未跑过非空内容；`extract_grok_incremental` / `extract_kimi_code_incremental` 同样。spec 上下文区测试策略声明「不 mock 文件系统，用临时目录写 fixture 文件后真实读取」，但实际三端增量用例都用固定 fixture 且不追加，与策略不符。
- 建议：参考 opencode 测试 `it("增量：新增 part 后只返回新增")` 的写法，为 claude/grok/kimi 各补一个用例：在临时目录复制 fixture → 全量提取得到 cursor → 追加一行合法 JSON → 增量提取 → 断言增量 messages 等于「全量重提取」尾部新增部分，且 cursor.offset 推进到新文件末尾。

### t209_gen_f002 - claude_code 全量提取 timestamp 双重解析冗余

- 严重度：minor
- 锚点：行为缺陷（无害冗余，但暗示复制粘贴未清理）
- 位置：`src/main/core/session-history/claude-code-extractor.ts:46` 配合 `:81` 与 `:49-56`
- 问题：`record_to_message` 在 `:41-45` 已经解析 `timestamp` 字段并填入返回对象（含 `null` 兜底）；全量循环 `:81` 又把 `msg.timestamp ?? parse_ts(rec)` 重新计算一次。`parse_ts` 函数与 `record_to_message` 内的 timestamp 解析逻辑完全重复。增量路径 `:122` 不做这层兜底，行为不对称。
- 建议：删除 `:81` 的兜底与 `parse_ts` 函数，直接用 `record_to_message` 返回的 msg；或把 timestamp 解析统一抽到一个 helper 由 `record_to_message` 调用。

### t209_gen_f003 - kimi 字符 offset 与字节 offset 单位混合，全量/增量对同一行 id 不一致

- 严重度：minor
- 锚点：实现合理但 id 语义注释 misleading（不违反 AC，AC5 只要求不重发）
- 位置：`src/main/core/session-history/kimi-extractor.ts:55-80`、`:139`
- 问题：`scan_lines(content, base_offset)` 中 `base_offset` 是字节（来自 `cursor.offset`，即 `statSync().size`），但循环里 `line_start` 是 `content`（已是 UTF-8 解码后的字符串）的字符 index，`line_start_offset = base_offset + line_start` 把字节数与字符数相加。注释 `:60-62` 自己承认「含多字节字符时行内 offset 可能略偏」。后果：全量（base=0）和增量（base=字节 offset）对同一物理行得到的 id 不同。当前 fixture 全 ASCII，测试无法暴露；一旦 fixture/真实 wire.jsonl 含中文等非 ASCII 字符，全量与增量的同名行 id 不一致——虽然游标保证不重发，但下游若用 id 做去重/比对会误判。
- 建议：要么用 Buffer + byteLength 计算真实字节起始，要么注释明确「id 仅保证单次提取内唯一，不保证跨全量/增量一致」并删除「跨全量/增量一致」的描述。

### t209_gen_f004 - opencode readonly 测试不触达生产代码

- 严重度：minor
- 锚点：AC7「提取过程对源文件只读（… opencode 用 readonly: true）」覆盖弱点（不是完全缺失，生产代码确实用了）
- 位置：`tests/unit/main/core/session-history/opencode-extractor.test.ts:288-298`
- 问题：`it("readonly 模式打开：写入应失败")` 自建一个 `new Database(fixture.db_path, { readonly: true, ... })` 连接并验证写入抛错，全程不调用 `extract_opencode` / `open_db`。若生产代码 `opencode-extractor.ts:47` 删除 `readonly: true`，该测试仍通过——测试验证的是 better-sqlite3 库行为，不是被测代码。AC7 的可观察行为是「opencode 提取器用 readonly 打开」，本测试不构成对该行为的断言。
- 建议：要么删除该用例（生产代码 readonly 已是简单事实，靠检视足够），要么改造为通过 `extract_opencode` 的副作用验证（例如 spy/wrap `Database` 构造器断言 options.readonly === true），或至少在用例注释中说明此为 better-sqlite3 readonly 行为的回归保护、不替代对生产代码的断言。

## 结论

- 前轮 finding 复核：N/A（Round 1）
- 本轮新发现：4 条（1 important、3 minor）
- 未进表的提示：
    - opencode 增量 `extract_opencode_incremental` 在 cursor=null/类型不匹配时退化为全量，spec 未规定此行为也未禁止；行为可接受，不出 finding。
    - grok 增量返回的 `grok:0` 等 id 与全量 id 命名空间重叠，由 byte_offset 游标保证不重发，注释 `grok-extractor.ts:97` 已说明，可接受。
    - claude_code AC1 测试对 timestamp 只断言 `<=` 弱序（`claude-code-extractor.test.ts:22`），未严格校验具体值；属覆盖弱点但未达 blocking。
- 总体判断：JSONL 三端增量 AC5 的「追加内容」核心场景完全未测，属 AC 关键覆盖缺口（important）；其余为冗余/语义/测试触达问题（minor）。critical 无，important 1 条未解决 → FAIL。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-05 13:28 UTC+8)

### 前轮 finding 复核

- **f001（important）已消除**。三端均补追加用例：
    - claude `claude-code-extractor.test.ts:81-107`：mkdtemp+copyFileSync+appendFileSync 一行新 user → `extract_claude_code_incremental` 返回 1 条且 `toEqual(re_full.messages.slice(-1))`（含 id/role/text/timestamp 全字段），并断言 `inc.cursor.offset === re_full.cursor.offset` 且 `>` 旧 offset。真正触达 `buf.subarray(cursor.offset).toString("utf-8")` 续读路径。
    - grok `grok-extractor.test.ts:67-90`：同结构，appendFileSync user 行 → `toHaveLength(1)`、`toEqual(tail)` 但仅比较 `{role,text}`（grok 增量 id 切片从 0 起，见 f003/结论历史提示）。
    - kimi `kimi-extractor.test.ts:99-124`：同结构，追加 `context.append_message` user 行 → `inc.messages.toEqual(tail)` 全字段比较（含 id），验证 f003 字节 id 修复在全量/增量间确实一致。
      三端 cursor.offset 前进、新行解析、与全量尾部一致均被验证。AC5 追加场景覆盖到位。
- **f002（minor）已消除**。`claude-code-extractor.ts` 已删 `parse_ts` 及全量循环里二次兜底，timestamp 仅由 `record_to_message` 一次解析；增量路径同样使用 `record_to_message`，对称。
- **f003（minor）已消除**。`kimi-extractor.ts:55-80` `scan_lines` 改纯字节累计：`bytes_before` 起始为 `base_offset`（字节），每行用 `Buffer.byteLength(content.slice(line_start, match.index + 1), "utf-8")` 累加；`process_line` 收到的 `line_start_offset` 全程字节单位。全量 base=0 与增量 base=cursor.offset 对同一物理行产出相同 id。kimi 测试 `kimi-extractor.test.ts:99-124` 用 `toEqual(tail)` 全字段（含 id）断言通过。
- **f004（minor）已消除**。`opencode-extractor.test.ts` 删除原自建 Database 验证 readonly 行为的无效用例；现 9 个用例全部走 `extract_opencode` / `extract_opencode_incremental` 真实路径。生产代码 `opencode-extractor.ts:42-46` 仍保持 `readonly: true` 无条件打开。

### 本轮新发现

无 finding（clean）。

### Pre-Report Gate 复核

- 三端新增追加用例断言非恒真：通过 `toEqual` 比较真实消息对象、`toBeGreaterThan` 比较字节 offset、`toHaveLength(1)` 比较新增计数；kimi 用例 `toEqual` 含 id 全字段比较，强度足够。
- 全部 32 个用例执行通过（`vitest run tests/unit/main/core/session-history/`，4 文件 32 tests passed）。
- AC1-7 覆盖复核：
    - AC1 claude 裁剪/顺序/timestamp：`claude-code-extractor.test.ts:14-26` 覆盖（含 thinking/tool_use/tool_result/system/summary/subagent-implicit 全剔除）。
    - AC2 opencode SQLite part/message：`opencode-extractor.test.ts` 9 用例覆盖（含 tool part 过滤、role 关联、time_created、非法 JSON 跳过、库不存在/空库）。
    - AC3 kimi wire.jsonl：`kimi-extractor.test.ts` 9 用例覆盖。
    - AC4 grok chat_history.jsonl：`grok-extractor.test.ts` 8 用例覆盖（spec 仍写 `updates.jsonl`，属 spec drift，见结论）。
    - AC5 增量 == 全量尾部：四端均已覆盖（opencode 走 rowid 增量；JSONL 三端走 byte offset）。
    - AC6 边界（空/截断/非 JSON）：claude broken.jsonl、grok 非 JSON 行、kimi 非 JSON 行、空文件、opencode 空 message.data JSON 跳过均有用例。
    - AC7 只读：opencode 生产代码 `readonly: true`（`opencode-extractor.ts:44`）；JSONL 端全用 `readFileSync`，无写操作；测试均不写源 fixture，临时目录写后清理。

### 未进表的提示

- spec 契约区 AC4 仍写「grok fixture（`updates.jsonl`）」，与实际 fixture `chat_history.jsonl` 及上下文区 d017/s015 结论不一致——属 spec 过时，按共享规则处置为改 spec，不计 FAIL。建议后续 edit spec 修正。
- grok 增量 id 切片从 0 起（`grok-extractor.ts:108` 注释明示），与全量同名空间存在重叠；由 byte_offset 游标保证不重发，且 spec 上下文区已声明 grok 无稳定 id 源。不构成 AC 违反。
- `kimi-extractor.ts:84-92` scan_lines 对「末行无尾换行」用 `if (line_start < content.length)` 单独处理；正常追加场景前段均以 `\n` 结尾，行为正确。无 finding。
- `opencode-extractor.ts:175-179` cursor=null 时退化为全量查询并返回 `sqlite_rowid` 游标，spec 未规定但行为合理。

### 总体判断

四条前轮 finding 全部按 diff 实证已消除；本轮无新 critical/important/minor。AC1-7 全覆盖且测试触达真实路径，断言强度足够。

### 系统性 follow-up

无。

verdict: PASS
