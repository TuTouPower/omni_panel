# Task review t425（reviewer_focus: 测试）

- task：`t425_fix_kimi_session_history_assistant`
- spec：`docs/tasks/t425_fix_kimi_session_history_assistant/spec.md`
- diff_anchor：`3c57b9a1646fab30587e2e0fd4f62c75c2ad5cde`
- target：`git diff 3c57b9a1646fab30587e2e0fd4f62c75c2ad5cde`
- round：1
- reviewed_at：2026-08-16 15:26 UTC+8

## Findings

### t425_test_f001 - AC-003 测试注释行数计数与实际 fixture 不符

- 严重度：minor
- 锚点：测试代码注释事实错误（非 AC 违反，不影响断言可信）
- 位置：`tests/unit/main/core/session-history/kimi-extractor.test.ts:293-294`
- 问题：注释写「干扰事件总行数 11（loop 行 8 + turn.prompt 1 + 非 JSON 1 + metadata 1？）——实际只产出 4 条消息」。实际 `wire-loop.jsonl` 共 12 行，其中 `append_loop_event` 7 行（content.part text ×2 + think + tool.call + tool.result + step.begin + step.end），另 metadata 1、append_message user 2、turn.prompt 1、非 JSON 1。注释中「11」「loop 行 8」均与文件实际不符（注释自身带「？」表不确定），维护者按注释核对计数会被误导。断言本身（`toHaveLength(4)` + 逐项 `not.toContain`）正确，不影响通过。
- 建议：按 fixture 实际行数修正注释，或删除计数注释只留「共产出 4 条消息，其余全部过滤」。

### t425_test_f002 - AC-001「非空 text」过滤分支无测试样例触达

- 严重度：minor
- 锚点：AC-001 明文「非空 `text`」；实现 `src/main/core/session-history/kimi-extractor.ts:61-62` 过滤空串与非字符串
- 位置：`tests/fixtures/session-history/kimi/wire-loop.jsonl`（fixture 无空 text 样例）+ `kimi-extractor.test.ts` t425 describe
- 问题：实现仅保留 `typeof text === "string" && text !== ""`，AC-001 的「非空」限定是该过滤分支的契约来源，但 fixture 中所有 `part.type=text` 均为非空字符串，空 text / 非字符串 text 的跳过行为无任何断言触达（`loop_event_to_message` 返回 null 的路径）。属于「还可以再加一个 case」类扩展，不阻断。
- 建议：`wire-loop.jsonl` 追加一行 `{"type":"context.append_loop_event","time":...,"event":{"type":"content.part","part":{"type":"text","text":""}}}`（可再附一行非字符串 text），在 AC-003 测试中并入「不产生消息」断言。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：无。diff 对既有测试文件仅新增 `loop_fixture` 常量与一个 describe 块（8 个新 it），未修改 t209 任何既有断言；`wire.jsonl` 旧 fixture 未改动。
- 本轮新发现：2 条（均为 minor，无 blocking）
- 未进表的提示：
  - t425 新增的 AC-004 测试未断言 `inc.cursor.offset` 向前推进；t209 既有增量测试已覆盖 append_message 形态的 cursor 推进，增量机制与事件类型无关共享，属可选扩展，不进 finding。
  - AC-003 对 tool 载荷的负向断言只查文本不含「foo.txt / file content」；当前 fixture 中 tool.call/tool.result 若未来以其它字段（如 tool.name 单独成消息）泄漏需同步扩大断言，当前无证据。
- 总体判断：测试可信（无 mock、直接读真实 fixture 触达生产函数、断言可观察输出）、5 条 AC 全覆盖、危险模式扫描与改测方向复核均无命中；仅 2 条 minor，不阻断。
- 系统性 follow-up：无（已查 `task.py list`，无等价已存在 task）

### AC 复验方式

- AC-001：`re_verified`。重跑 `pnpm exec vitest run tests/unit/main/core/session-history/kimi-extractor.test.ts`（22/22 passed）；独立探针直接调用 `extract_kimi_code(wire-loop.jsonl)` 输出 roles `["user","assistant","assistant","user"]`、texts 与断言数组逐一相等，timestamp 取顶层 time。
- AC-002：`re_verified`。既有 t209 测试（diff 未改动该断言）验证 `wire.jsonl` 的 `append_message role=assistant` 仍产出 "hi, what can I do?"；探针复跑 `wire.jsonl` 输出含该 assistant 文本，兼容无回归。
- AC-003：`re_verified`。探针确认 think/tool 载荷零泄漏（leak=false）且消息数 4；测试断言 `toHaveLength(4)`（强正证据）+ 逐项 `not.toContain` 负向。
- AC-004：`re_verified`。探针在已有 cursor 后追加 content.part text 行：增量仅 1 条、id 与全量尾部 id 一致（id match=true）、四字段（id/role/text/timestamp）全等（fields equal=true）、不重发；重跑两个 AC-004 测试通过。
- AC-005：`re_verified`。探针 `extract_kimi_code_first_user(wire-loop.jsonl)` 返回 "hello kimi"，未把 content.part 当 user；重跑测试通过。

coverage = 5 / 5

补充门禁复验：`pnpm test` 全量 276 files / 3341 tests passed（9 skipped，exit 0）；`pnpm typecheck` 通过。

reviewed_scope: 9db7edbb9905b489

verdict: PASS

## Round 2 (2026-08-16 15:40 UTC+8)

- diff_anchor：`3c57b9a1646fab30587e2e0fd4f62c75c2ad5cde`（不变，工作区未提交改动为被审 diff）
- round：2
- reviewed_at：2026-08-16 15:40 UTC+8

## Findings（本轮新发现）

### t425_test_f003 - AC-003 测试注释求和仍比实际干扰行少 1（f001 修不彻底）

- 严重度：minor
- 锚点：注释事实错误（非 AC 违反，不影响断言可信）
- 位置：`tests/unit/main/core/session-history/kimi-extractor.test.ts:294-296`
- 问题：f001 修复后注释分项已与 fixture 一致（step.begin/step.end/tool.call/tool.result 各 1 + think 1 + 空 text content.part 1 + turn.prompt 1 + 非 JSON 1 + metadata 1，共 9 项），但求和仍写「= 8 行不产出消息」。实测 `wire-loop.jsonl` 13 行 − 4 条产出 = 9 行干扰（逐行核对：metadata、think、空 text、tool.call、tool.result、step.begin、step.end、turn.prompt、非 JSON 各 1），分项合计也是 9。注释求和 8 与自身分项及文件实际均矛盾，维护者按注释核对仍会被误导 1 行。
- 建议：第三行求和改为「= 9 行不产出消息」。

## 结论（Round 2）

- 前轮 finding 复核（以 diff 为准）：
  - `t425_test_f001`（注释计数不符）：**修不彻底**。注释已从「11/8」改为分项 9 项（与 fixture 完全一致），但求和残留「= 8 行」错误（应为 9）。剩余错误登记为 `t425_test_f003`，同为 minor。
  - `t425_test_f002`（空 text 过滤分支无样例触达）：**已消除**。fixture 新增第 6 行 `{"event":{"type":"content.part","part":{"type":"text","text":""}}}`（`wire-loop.jsonl:6`），AC-001 注释明示分支触达，AC-003 `toHaveLength(4)` 强断言 + 独立探针确认空 text 零泄漏（leak=0）。
  - 实现侧重构（`message_id` / `timestamp_from` 抽取，`kimi-extractor.ts:21-32`）语义等价：`event_to_message` 返回字段与原实现逐项一致（id 公式、timestamp 容错逻辑均未变），未引入行为差异。
- 改测方向复核：无。对既有测试文件仅新增 `loop_fixture` 常量与 t425 describe 块（8 个新 it），t209 既有断言与 `wire.jsonl` 旧 fixture 均未改动。
- 本轮新发现：1 条（`t425_test_f003`，minor）
- 危险模式扫描：无命中。无恒真/弱化/条件跳过断言，无 `.skip`/`.only`/`@ts-ignore`，无 mock（测试直接读真实 fixture 触达生产函数），无阈值掩盖，无删断言/删测试，`toHaveLength(4)` 为强正证据。
- 未进表的提示：
  - AC-004 增量测试未断言 `inc.cursor.offset` 推进（t209 既有增量测试已覆盖 append_message 形态 cursor 推进，机制与事件类型无关共享）——与 Round 1 同，仍为可选扩展。
  - 空 text 的非字符串形态（如 `"text":123`）未加样例，f002 原建议为「可再附」，非强制。
- 总体判断：前轮 2 minor 中 f002 已真修，f001 修不彻底但残留仅为注释求和 1 行之差（minor，不影响断言可信）；无未解决 critical / important。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001：`re_verified`。重跑 `pnpm exec vitest run tests/unit/main/core/session-history/kimi-extractor.test.ts`（22/22 passed）；独立探针输出 roles `["user","assistant","assistant","user"]`、texts 与断言数组逐一相等、timestamps 与断言一致。
- AC-002：`re_verified`。diff 未触碰 `wire.jsonl` 与 t209 既有断言（`event_to_message` 重构语义等价），t209 兼容测试含于 22/22 全绿中。
- AC-003：`re_verified`。探针 count=4、空 text 泄漏 0；`toHaveLength(4)` + 逐项 `not.toContain`（思考内容/foo.txt/file content）负向断言。
- AC-004：`re_verified`。两个测试通过：增量仅 1 条、id 与全量尾部一致、timestamp 正确、id 序列唯一（探针 ids `["kimi:83","kimi:212","kimi:491","kimi:1325"]` 无重复）；fixture 末行带换行，追加行独立解析无拼接问题。
- AC-005：`re_verified`。探针 `extract_kimi_code_first_user` 返回 "hello kimi"，未把 content.part 当 user。

coverage = 5 / 5

reviewed_scope: 8207a5ef505a0afe

verdict: PASS

## Round 3 (2026-08-16 15:48 UTC+8)

- diff_anchor：`3c57b9a1646fab30587e2e0fd4f62c75c2ad5cde`（不变，工作区未提交改动为被审 diff）
- round：3
- reviewed_at：2026-08-16 15:48 UTC+8

## Findings（本轮新发现）

无（0 条）。f003 修复仅改注释文本，未引入新断言或新代码路径。

## 结论（Round 3）

- 前轮 finding 复核（以 diff 为准）：
  - `t425_test_f003`（AC-003 注释求和残留 8 vs 实际 9，minor）：**已消除**。`kimi-extractor.test.ts:294-296` 求和行已改为「= 9 行不产出消息」，与自身 9 项分项一致；逐行核对 `wire-loop.jsonl` 共 13 行：4 条产出（2 append_message user + 2 content.part text）+ 9 条干扰（metadata、think、空 text content.part、tool.call、tool.result、step.begin、step.end、turn.prompt、非 JSON 各 1），分项与文件实际完全对得上。
  - `t425_test_f001`（注释计数不符）：随 f003 同一注释一并消除。
  - `t425_test_f002`（空 text 过滤分支无样例触达）：保持已消除。`wire-loop.jsonl:6` 空 text content.part 仍在，AC-001 注释（`kimi-extractor.test.ts:275-276`）明示分支触达，AC-003 `toHaveLength(4)` 强断言持续覆盖。
  - 实现侧重构（`message_id` / `timestamp_from` 抽取）自 Round 2 复核后无变更，语义等价结论保持。
- 改测方向复核：无。Round 2→3 之间实现侧改动仅 AC-003 注释求和一行（294-296），零断言变更、零删改测试，无「迁就实现」改测。
- 本轮新发现：0 条。
- 危险模式扫描（重扫当前 diff）：无命中。`toHaveLength(4)` 强正证据 + roles/text 逐项 `toEqual` + 逐项 `not.toContain` 负向；无恒真/弱化/条件跳过/删断言/注释断言/`.skip`/`.only`/`eslint-disable`/`@ts-ignore`/mock 误用/阈值掩盖。
- 未进表提示：
  - 前两轮报告「8 个新 it」为计数误差，实测 t425 describe 共 6 个 `it`（test:273/286/292/304/330/338），不影响任何结论。
  - AC-004 增量测试未断言 `inc.cursor.offset` 推进（t209 既有增量测试已覆盖 append_message 形态，机制共享）——与 Round 1/2 同，仍为可选扩展，不进 finding。
- 总体判断：唯一残留 minor（f003 注释求和）已真修且核验无误；本轮无新 finding；测试 22/22 全绿，无未解决 critical / important。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- 指纹复验：当前 diff 复算指纹 `3d9587d0d5314557`，与 prompt 注入一致（Round 2 后唯一 diff 变更为注释求和行）。
- AC-001：`re_verified`。断言未动（Round 2 独立探针 + 本轮重跑 22/22 全绿）；roles/texts/timestamp 逐项 `toEqual`。
- AC-002：`re_verified`。`wire.jsonl` 与 t209 既有断言 diff 未触碰，22/22 全绿含兼容测试。
- AC-003：`re_verified`。`toHaveLength(4)` + 4 个 `not.toContain` 负向断言未变，本轮重跑通过。
- AC-004：`re_verified`。两个增量测试断言未变，本轮重跑通过（Round 2 探针已证 id/timestamp/不重发）。
- AC-005：`re_verified`。`toBe("hello kimi")` 断言未变，本轮重跑通过。

coverage = 5 / 5

reviewed_scope: 3d9587d0d5314557

verdict: PASS
