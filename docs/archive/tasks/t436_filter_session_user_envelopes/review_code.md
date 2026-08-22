# Task review t436（reviewer_focus: 代码）

- task：`t436_filter_session_user_envelopes`
- spec：`docs/tasks/t436_filter_session_user_envelopes/spec.md`
- diff_anchor：`6f5843180e701266a9accfe363b7a6730932eb7e`
- target：`git diff 6f5843180e701266a9accfe363b7a6730932eb7e`
- round：1
- reviewed_at：2026-08-23 01:57 UTC+8
    reviewed_scope: c2a54e4a9d5647a5

## Findings

### t436_code_f001 - 空 inner 的 user_query 未走 query 分支，标签泄漏到展示文本

- 严重度：important
- 锚点：依赖与约束「可保留 user 文本规则」第 2 条（含 `<user_query>` 时只展示闭合 inner；标签外信封丢弃）；可观测展示错误
- 位置：`src/main/core/session-history/normalize_user_text.ts:45-53`（`extract_user_query_inners`）、`:82-85`（`normalize_user_display_text` 调用点）
- 问题：`extract_user_query_inners` 在匹配到 `<user_query>` 但各段 inner trim 后皆空时返回 `null`，与「无标签」不可区分，随后落入 `strip_envelope_blocks` 路径；而 `user_query` 不在 `STRIP_ENVELOPE_TAGS`，标签留在 leftover。独立复现：
    - `"<user_query></user_query>"` → `{ keep: true, text: "<user_query></user_query>" }`
    - `"<user_query>  </user_query><skill_information>x</skill_information>"` → `{ keep: true, text: "<user_query>  </user_query>" }`
    - `"<user_query></user_query>\nreal"` → 保留含标签的整段
        按规则 2，含 `user_query` 时应只取 inner；inner 全空应丢弃（空展示），不得把 XML 标签交给气泡/标题。
- 建议：检测「是否出现过 user_query 闭合标签」与「非空 inner 列表」分开；有标签且 inner 全空 → `{ keep: false }`；有非空 inner → 照现拼接。勿在无非空 inner 时 fallthrough 到 strip/leftover。

## 结论

- 本轮新发现：1 条（important）
- 未进表的提示：
    - 文件过大（本 task 触及且净增）：`src/main/core/token-stats/claude-reader.ts` 657 行（≥400 minor 阈值，本 task +6/−1 量级净增）；`src/main/core/token-stats/kimi-reader.ts` 462 行（同上，本 task 净增）。未达 800 important。`normalize_user_text.ts` 101 行，未超标。
    - 圈复杂度：`normalize_user_display_text` / `strip_envelope_blocks` / `unwrap_slash_command` 均远低于 CC≥10 提示线。
    - `extract_opencode_first_user` 的 `LIMIT 50`：若前 50 条 user text part 全为信封-only，首条可保留 user 会漏（AC-004 场景仅 1 条 reminder，实网极少）。属实现上限，非当前 AC 缺口。
    - 空 `<command-name>`（名称 trim 空）时 `unwrap_slash_command` 返回 null，leftover 可残留标签（如 `"<command-name></command-name> leftover text"`）；规则 3 对空名语义不如规则 2 清晰，未升格为 finding。
    - token-stats → session-history 的 `normalize_user_text` 跨模块引用与 spec「实施共用」一致；既有 main 层跨目录 import 先例，不另开架构 finding。
    - 安全：归一只做展示字符串变换，无拼接执行/注入面；正则作用于单条消息文本，未见新增敏感落盘。
- 总体判断：四端 extractor 与 Claude/Kimi title 已接入共用归一；AC-001～007 场景在代码路径上对齐且相关单测全绿。但共享 `normalize_user_display_text` 在「存在空 inner 的 user_query」时违反规则 2 并泄漏标签，属 blocking。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — 对照 `grok/envelopes.jsonl` 与 `grok-extractor.ts` 的 `normalize_user_display_text` 接入；跑通 `grok-extractor.test.ts` envelopes 全量/增量。
- AC-002：`re_verified` — 对照 `claude_code/envelopes.jsonl` 与 `claude-code-extractor.ts` `is_meta`/归一；跑通 envelopes 用例（slash 展开、丢 isMeta/stdout/interrupted）。
- AC-003：`re_verified` — 对照 `kimi/wire-envelopes.jsonl` 与 `kimi-extractor.ts`；reminder-only 丢弃、content.part assistant 保留路径仍在。
- AC-004：`re_verified` — 对照 `opencode-extractor.ts` `row_to_message` 归一与 `FIRST_USER_PARTS_QUERY` LIMIT 50；跑通 envelopes 全量/增量。
- AC-005：`re_verified` — 对照 `claude-reader.ts:334-343` 在 `first_user_text === null` 时跳过不可保留 user，summary 仍优先 `title ?? first_user_text`；相关 title 单测通过。
- AC-006：`re_verified` — 对照 `kimi-reader.ts:188-200` 与 `resolved_title = title ?? basename`；reminder 跳过与全丢弃回退 basename 单测通过。
- AC-007：`re_verified` — 既有裸文本断言未改；七个相关测试文件 134 tests 全绿，含四端原 fixture 期望。

coverage = 7 / 7

verdict: FAIL

## Round 2 (2026-08-23 02:00 UTC+8)

- task：`t436_filter_session_user_envelopes`
- spec：`docs/tasks/t436_filter_session_user_envelopes/spec.md`
- diff_anchor：`6f5843180e701266a9accfe363b7a6730932eb7e`
- target：`git diff 6f5843180e701266a9accfe363b7a6730932eb7e`
- round：2
- reviewed_at：2026-08-23 02:00 UTC+8
    reviewed_scope: 22e3b3e72f575a9a

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
    - `t436_code_f001`：**已消除**。`extract_user_query_inners` 现返回 `{ present, text }`，有闭合 `<user_query>` 且 inner 全空时 `normalize_user_display_text` 直接 `{ keep: false }`，不再 fallthrough 到 `strip_envelope_blocks`。独立复现：`"<user_query></user_query>"`、`"<user_query>  </user_query><skill_information>x</skill_information>"`、`"<user_query></user_query>\nreal"` 均 `keep:false`；混有非空 inner 时只保留非空段（`a` / `b`）。单测 `drops empty user_query without leaking tags (t436_code_f001)` 通过。
- 本轮新发现：0 条
- 未进表的提示：
    - Round 1 已列项仍成立：`claude-reader.ts` 657 / `kimi-reader.ts` 462 超 400 行 minor 阈值（本轮修复未再堆大）；`extract_opencode_first_user` LIMIT 50；空 `<command-name>` unwrap 失败时标签可残留 leftover。
    - 本轮修复引入的「有 `user_query` 标签且 inner 全空则整条丢弃（含标签外 leftover）」与规则 2 优先路径一致，非回归。
    - 安全 / 契约 Breaking / 性能 / 健壮性：本轮 diff 增量仅归一分支修正，未见新注入面、公开签名变更或资源问题。
- 总体判断：f001 blocker 已按建议修干净；AC-001～007 路径仍对齐，相关 7 文件 135 tests 全绿；无未解决 critical / important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified` — grok envelopes fixture + `normalize_user_display_text` 接入；`grok-extractor.test.ts` 通过。
- AC-002：`re_verified` — claude envelopes + isMeta/slash 归一；`claude-code-extractor.test.ts` 通过。
- AC-003：`re_verified` — kimi wire-envelopes + reminder 丢弃；`kimi-extractor.test.ts` 通过。
- AC-004：`re_verified` — opencode `row_to_message` 归一 + LIMIT 50 first_user；`opencode-extractor.test.ts` 通过。
- AC-005：`re_verified` — `claude-reader.ts:334-343` 跳过不可保留 user，summary 优先；title 相关单测通过。
- AC-006：`re_verified` — `kimi-reader.ts:188-199` 跳过信封-only，全丢弃回退 basename；相关单测通过。
- AC-007：`re_verified` — 既有裸文本断言未改；七文件 135 tests 全绿。

coverage = 7 / 7

verdict: PASS
