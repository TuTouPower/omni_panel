---
tid: "t209"
slug: "session_history_extractors"
title: "会话历史四端消息内容提取器"
status: "done"
branch: "t209_session_history_extractors"
worktree: ""
review_level: "single"
diff_anchor: "1a48081f48a32c3641c71c2d12a5d2c166ad71cb"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- SPIKE s015 实测四端字段路径（d017）：claude_code 复用现有 jsonl reader + 决策 2 过滤；opencode SQLite message.role+part text；kimi wire.jsonl 的 context.append_message；**grok 正文在 chat_history.jsonl（非 updates.jsonl）、无 timestamp**。
- 统一模型 types.ts：HistoryMessage{id,role,text,timestamp:null 允许}、ExtractCursor（byte_offset | sqlite_rowid）。
- 四端提取器派 subagent 并行实现（边界独立），整合后 lint/typecheck 统一修。
- kimi id：原字节/字符混合（f003），改纯字节 Buffer.byteLength 累计，全量/增量同物理行同 id。
- claude 全量 parse_ts 冗余（f002），删，timestamp 单点解析于 record_to_message。
- opencode readonly 测试无效覆盖（f004），删。
- build-info.ts 是 generated（gitignore），worktree 手生成。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-05 13:20 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                                                                                 | fix_ref                                                                        |
| ------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| t209_gen_f001 | important | 已修   | 三端 JSONL 增量「追加后 == 全量尾部」未测。给 claude/grok/kimi 各补追加测试（mkdtemp 复制 fixture→全量取 cursor→appendFileSync 追加合法行→增量 == 全量尾部、cursor 推进） | tests/unit/main/core/session-history/{claude-code,grok,kimi}-extractor.test.ts |
| t209_gen_f002 | minor     | 已修   | claude 全量 parse_ts 冗余兜底且与增量不对称。删 parse_ts 函数与兜底，全量直接 push(msg)                                                                                   | src/main/core/session-history/claude-code-extractor.ts                         |
| t209_gen_f003 | minor     | 已修   | kimi id 字节/字符混合单位致全量/增量不一致。scan_lines 改纯字节累计（Buffer.byteLength），全量/增量同物理行产出同 id                                                      | src/main/core/session-history/kimi-extractor.ts                                |
| t209_gen_f004 | minor     | 已修   | opencode readonly 测试自建连接不触达 extract_opencode（无效覆盖）。删该用例，readonly 由代码审查保证                                                                      | tests/unit/main/core/session-history/opencode-extractor.test.ts                |

### Round 2 (2026-08-05 13:25 UTC+8)

零 finding（general PASS）。Round 1 四条均已修且复核消除。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：四端提取器 32 测试（claude 7/opencode 10/kimi 9/grok 7，含 f001 三端增量追加场景）；fixture 驱动，opencode 动态建 sqlite（readonly）、其余 JSONL；AC1-7 覆盖。`pnpm test` 2226 passed，typecheck/lint 绿。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A

`single`：

- Round 1 general：FAIL
- Round 2 general：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
