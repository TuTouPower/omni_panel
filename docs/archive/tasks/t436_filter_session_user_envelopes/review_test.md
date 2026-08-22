# Task review t436（reviewer_focus: 测试）

- task：`t436_filter_session_user_envelopes`
- spec：`docs/tasks/t436_filter_session_user_envelopes/spec.md`
- diff_anchor：`6f5843180e701266a9accfe363b7a6730932eb7e`
- target：`git diff 6f5843180e701266a9accfe363b7a6730932eb7e`
- round：1
- reviewed_at：2026-08-23 16:40 UTC+8
    reviewed_scope: c2a54e4a9d5647a5

## Findings

（本轮无 finding）

## 结论

- 改测方向复核：无。测试 diff 均为追加新 `describe`/`it` 或插入新用例；既有断言未改期望、未删 expect、未弱化。AC-007 裸 fixture 期望（`帮我看看这个文件` / `hello grok` / `hello kimi` / `你好`）原样保留。
- 本轮新发现：0 条
- 未进表的提示：
    - AC-005 title 路径未单测「首条为 local-command-stdout / 信封-only」跳过（`normalize_user_text.test.ts` 与 history AC-002 已覆盖同一 `normalize_user_display_text`；属可再加 case）。
    - AC-004 opencode 全量断言了 id/text/`first_user`，未显式 `role`（可补 `["user","assistant"]`）。
    - AC-005/006「仍受既有 120 字截断」本 task 未新增专测；实现仍走 `truncate_title`（既有路径）。
    - 有意不测（真实磁盘 e2e、renderer、summaries 80 字、未知新标签）未当缺口。
- 总体判断：七条 AC 均有触达生产实现的 fixture/临时文件断言；危险模式未命中；无 blocking。
- 系统性 follow-up：无

### 危险模式扫描

- 恒真断言 / 删反转 expect / 注释断言 / 弱化旧断言：未命中（新断言均为精确 `toBe`/`toEqual`；`sessions.some(...title === "Real title")` 因同 `it` 内多 session 文件并存，仍校验 summary 标题存在）。
- `.skip` / `.only`：未命中。
- 测试文件新增 `eslint-disable` / `@ts-ignore`：未命中（reader 文件顶既有 disable 不在本 diff）。
- mock 误用：新用例直接调 `extract_*` / `scan_*` / `normalize_user_display_text`，fixture 或临时 jsonl/db；未 mock 被测逻辑。claude 既有 `vi.mock("node:fs")` 仅计数 `readFileSync`，非本 task 引入。
- 阈值掩盖 / 条件跳过弱化 / 程序赋值冒充交互 / 存在即通过：未命中。
- 删测试：未命中。

### AC 覆盖与可信

|AC|覆盖证据|可信|
|---|---|---|
|AC-001|`grok-extractor.test.ts` envelopes 全量+增量；fixture `grok/envelopes.jsonl`|断言 role/text/id/`first_user`/增量 `toEqual` 全量尾部|
|AC-002|`claude-code-extractor.test.ts` envelopes；fixture `claude_code/envelopes.jsonl`|同上；slash 展开精确串|
|AC-003|`kimi-extractor.test.ts` envelopes；fixture `kimi/wire-envelopes.jsonl`；旧 append_message assistant 用例保留（t425）|断言 role/text/`first_user`/增量|
|AC-004|`opencode-extractor.test.ts` envelopes 临时 sqlite|断言 id/text/`first_user`/增量|
|AC-005|`claude-reader.test.ts` 两则 t436 title|跳过 isMeta/interrupted、slash 展开、summary 优先；走真实 `scan_session_jsonls`|
|AC-006|`kimi-reader.test.ts` t436 title|跳过 reminder、全丢弃回退 basename|
|AC-007|四端既有裸 fixture 单测未改期望|回归锚定仍在|

### AC 复验方式

- AC-001：`re_verified` — 核对 fixture 行形态与 `grok-extractor.test.ts` AC-001 断言及增量 `toEqual` 尾部。
- AC-002：`re_verified` — 核对 `envelopes.jsonl` 含 isMeta/stdout/interrupted/slash/plain/assistant，断言 id/text/`first_user`。
- AC-003：`re_verified` — 核对 `wire-envelopes.jsonl` 与 kimi envelopes 用例；旧 `append_message` assistant 用例仍在 diff 外保留。
- AC-004：`re_verified` — 核对 `build_envelope_db` reminder→hi→assistant 与增量断言。
- AC-005：`re_verified` — 核对 claude-reader 新用例断言 title，并对照 `claude-reader.ts` 调用 `normalize_user_display_text`。
- AC-006：`re_verified` — 核对 kimi-reader 新用例 title/fallback。
- AC-007：`re_verified` — diff 无改动旧 expect；裸文本断言仍在各 extractor 原用例。

coverage = 7 / 7

verdict: PASS

## Round 2 (2026-08-23 01:59 UTC+8)

- round：2
- reviewed_at：2026-08-23 01:59 UTC+8
    reviewed_scope: 22e3b3e72f575a9a

## Findings

（本轮无 finding）

## 结论

- 前轮 finding 复核：Round 1 无 test finding（PASS / Findings 空）；无待消除 blocker。相对 Round 1，本轮 diff 仅新增 `normalize_user_text.test.ts` 中 `drops empty user_query without leaking tags (t436_code_f001)` 三断言，以及生产侧 `extract_user_query_inners` present/空 inner 分路径；既有 AC-001～007 用例与断言未改、未删、未弱化。
- 改测方向复核：无。无迁就实现的旧断言改写；新增用例锚定 code finding 复现输入，期望为规则 2 语义（有 `<user_query>` 且 inner 全空 → `keep: false`），非把泄漏标签写进期望。
- 本轮新发现：0 条
- 未进表的提示：无新增。Round 1 可选扩展（AC-005 local-command 跳过专测、opencode 显式 role、120 字截断专测）仍属可再加 case，非缺口。
- 总体判断：七条 AC 覆盖仍在且相关 135 tests 全绿；空 `user_query` 回归测直接调用生产 `normalize_user_display_text`，精确 `toEqual({ keep: false })` 覆盖 code review 三例，可信。无 blocking。
- 系统性 follow-up：无

### 危险模式扫描

- 恒真断言 / 删反转 expect / 注释断言 / 弱化旧断言：未命中（diff 无 `- expect`；新断言为精确 `toEqual`/`toBe`）。
- `.skip` / `.only`：未命中。
- 测试文件新增 `eslint-disable` / `@ts-ignore`：未命中。
- mock 误用：新用例未 mock；直接测生产函数。
- 阈值掩盖 / 条件跳过弱化 / 程序赋值冒充交互 / 存在即通过：未命中。
- 删测试：未命中。

### AC 覆盖与可信（本轮复核）

|AC|覆盖证据|可信|
|---|---|---|
|AC-001|`grok-extractor.test.ts` envelopes 全量+增量仍在|role/text/id/`first_user`/增量 `toEqual` 尾部|
|AC-002|`claude-code-extractor.test.ts` envelopes 仍在|slash 展开精确串；丢 isMeta/stdout/interrupted|
|AC-003|`kimi-extractor.test.ts` envelopes 仍在|reminder 丢弃；增量与全量尾部|
|AC-004|`opencode-extractor.test.ts` envelopes 仍在|reminder→hi；增量一致|
|AC-005|`claude-reader.test.ts` 两则 t436 title 仍在|isMeta/interrupted 跳过、slash、summary 优先|
|AC-006|`kimi-reader.test.ts` t436 title 仍在|reminder 跳过、全丢弃 basename|
|AC-007|四端裸 fixture 期望未改|回归锚定仍在|
|规则 2 空 query（f001）|`normalize_user_text.test.ts` 新 it|三输入 → `keep: false`，触达生产实现|

### AC 复验方式

- AC-001：`re_verified` — 核对 grok envelopes 断言仍在；相关测试文件 vitest 全绿。
- AC-002：`re_verified` — 核对 claude envelopes 断言仍在；vitest 全绿。
- AC-003：`re_verified` — 核对 kimi envelopes 断言仍在；vitest 全绿。
- AC-004：`re_verified` — 核对 opencode envelopes 断言仍在；vitest 全绿。
- AC-005：`re_verified` — 核对 claude-reader t436 title 两则仍在；vitest 全绿。
- AC-006：`re_verified` — 核对 kimi-reader t436 title 仍在；vitest 全绿。
- AC-007：`re_verified` — diff 无改旧 expect；裸文本断言仍在。
- 空 user_query（t436_code_f001 测试侧）：`re_verified` — 新 it 三例期望 `keep: false`，与 `normalize_user_text.ts` present/空 inner 分路径一致；`normalize_user_text.test.ts` 10 tests 通过。

coverage = 7 / 7

verdict: PASS
