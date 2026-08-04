---
tid: "t197"
slug: "grok_token_stats_collect"
title: "grok token-stats 数据采集（updates.jsonl 增量扫描入库）"
status: "done"
branch: "t197_grok_token_stats_collect"
worktree: ""
review_level: "full"
diff_anchor: "3b2804f68bcd5f5fc5ebe70ffad5ab82cacc72c4"
depends_on: ""
conflicts_with: ""
note: "参考 cc-switch session_usage_grokbuild.rs；读 WSL grok updates.jsonl turn_completed 事件入 token-stats"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## Step 1 探索结论（UNVERIFIED-SPIKE 全部核实，真实 WSL 数据）

`.scratch/*.cjs` 探测真实 `~/.grok/sessions`（260 个 updates.jsonl）：

- 布局固定两层：`sessions/<enc_cwd>/<session_id>/updates.jsonl`（深度直方图全部为 2）。session_id = 文件父目录名；enc_cwd = 再上一层目录名（URL-encoded，如 `%2Fhome%2Ftestuser%2F...`）。
- `turn_completed` 事件 1055 条，**全部**带 `prompt_id`（message_id 直接用 prompt_id，稳定可幂等）。全部带 root `timestamp`（秒，无 >1e12 的 ms 值）→ `timestamp * 1000` 换算。
- **本 CLI 版本无 `_meta` 字段**（0 条）——cc-switch 用的 `_meta.eventId`/`agentTimestampMs` 不可用，message_id 用 prompt_id，时间用 root timestamp。
- 23 条事件缺 usage（跳过不计）；其余 1032 条 `totalTokens == inputTokens + outputTokens` 全成立；`reasoningTokens <= outputTokens` 全成立。
- `modelUsage` 单 key 1030 条、双 key 2 条 → model 取 modelUsage 单 key，多 key 时按排序 join `+`；token 分量用顶层 usage（已是本轮总量）。
- 无 message 事件、无 user 文本 → title 无法从用户文本派生，回退 enc_cwd 解码后 basename（镜像 kimi 的 workDir basename 语义）。
- 无 `archived_sessions` 目录；`\\wsl.localhost` UNC 从 Node 可读（已多次验证）。

## Step 2-4 实施与验证

- 新建 `src/main/core/token-stats/grok-reader.ts`：`scan_grok_updates(sessions_dir, env, prev)`，镜像 kimi-reader 的 mtime 增量 + dirty 会话重统计 + store REPLACE 幂等。逐事件按面值入账，`reasoningTokens ⊂ outputTokens` 不单独记账；`prompt_id` 去重（同一 prompt 可能多行）。`directory`/`title` 从 enc_cwd 解码派生（title=解码后 basename），镜像 kimi 的 workDir basename 语义。
- 枚举扩展：`tokenStatsSourceSchema` + records/dashboard `agent` 枚举加 `"grok"`（4 处 filter 类型、dashboard agent schema、store row cast、local-api 4 处 cast）。
- collector 接线：`{ key: "grok_wsl", source: "grok", kind: "grok_jsonl", env: "wsl", wsl: true }`，仅 WSL、受 `wsl_enabled` 门控；`grok_sessions_path` 走 `\\wsl.localhost\<distro>\home\<user>\.grok\sessions`；`grok_states` 进 scan-state 持久化。AC5：reader 返回 `missing` 标志，collector 对缺失目录 warn 一次（防每 poll 刷屏），不阻断其它 source。
- 顺手修一处 t196 引入的 lint 错误：t196 把 `handleConnectorRefreshAll` 改为同步后，`local-api/server.ts` 仍 `await` 它，`pnpm lint` 门禁必挂，去掉 `await`。
- 门禁：`pnpm check`（typecheck+lint+format+deadcode+arch）全绿（2 个未改文件的 prettier 基线漂移除外，非本 task 引入）；`pnpm test` 2109 通过，仅 refresh-service / grok_oauth 集成测试在并发负载下偶发超时（单独跑全绿，与 t196 同类既有 flaky，与 token-stats 无关）。
- 黑盒（真实 WSL grok 数据，`.scratch/grok_reader_blackbox.ts`）：255 sessions / 259 daily / 1032 records（1055 事件 − 23 无 usage），sample session `grok-4.5` calls=150，title/directory 从 enc_cwd 正确解码，时间戳秒→毫秒换算正确，`missing:false`。

## Round 1 finding 修复记录

Round 1 后按 code/test reviewer 意见补 AC5「不可读」处理与路径单测：

- `scan_grok_updates` missing 判定扩展：`existsSync` 之外，目录存在但 `readdirSync` 抛错（如 sessions_dir 实为文件 → ENOTDIR）也置 `missing=true` 整体跳过；单文件 `statSync`/`readFileSync` 失败置 `file_unreadable=true` 跳过该文件（仍采集其它可读文件），返回值 `missing: file_unreadable` 触发 collector warn-once。collector warn 逻辑未动。
- 新增测试：grok-reader「treats an unreadable sessions path (a file, not a dir) as missing (t197 AC5)」（ENOTDIR 分支）；collector.test 新增「builds WSL grok sessions path」精确断言（替换原 toContain 弱断言）。
- 门禁复验：token-stats 12 文件 213 用例全绿；`pnpm check` 全绿；全量 `pnpm test` 2111 通过，仅 refresh-service / file-vault 集成测试并发负载下偶发超时（单独跑全绿，pre-existing flaky，与本 task 无关）。

## Round 2→3 finding 修复记录

Round 2 后按 test reviewer 意见补 AC5「文件级不可读」分支测试与行为修复：

- **mtime 记录时机修复**：`scan_grok_updates` 逐文件循环改为「读+解析成功后才落 mtime」；`statSync`/`readFileSync` 失败不落 mtime、置 `file_unreadable=true` 继续——一次性不可读的 `updates.jsonl` 下轮重试而非 mtime 不变永久跳过。未变更文件（prev.mtime === stat.mtime）与 parse 失败（garbage）仍落 mtime（跳过重读，与 kimi 一致）。
- **文件级分支测试**：`grok-reader.test.ts` 用 `vi.mock("node:fs")` 部分 mock（仅 `readFileSync` 对指定路径抛错、其余委托真实 fs，文件系统属允许 mock 边界）新增两用例：①一个 updates.jsonl 不可读 → `missing=true`、可读会话记录正常产出；②不可读文件下轮重试（首次 `mtimes` 未提交、恢复可读后重新入账）。
- 门禁复验：token-stats 12 文件 215 用例全绿；typecheck/lint/deadcode/arch 全绿；format:check 仅剩 2 个非本 task 的 prettier 基线漂移文件。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 3 (2026-08-04 03:40 UTC+8)

| finding_id     | severity  | status | rationale                                         | fix_ref                                             |
| -------------- | --------- | ------ | ------------------------------------------------- | --------------------------------------------------- |
| t197_code_f001 | minor     | 已修   | missing 判定扩展 + file_unreadable 触发 warn-once | grok-reader.ts:387-412                              |
| t197_test_f001 | important | 已修   | 文件级不可读分支补测 + mtime 时机修复防永久跳过   | grok-reader.ts:427-477, grok-reader.test.ts:362-403 |
| t197_test_f002 | minor     | 已修   | grok_sessions_path 精确断言                       | collector.test.ts:215-219                           |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：`token-stats-store.test.ts`「stores and queries source=grok rows across all three tables」写读 grok 行，三表查询通过，无约束/类型错误。
    - AC2：`grok-reader.test.ts` fixture 断言 input/output/cache_read 正确映射、reasoning 计入 output 不单记；黑盒真实 WSL 数据 255 sessions/259 daily/1032 records 入库路径验证。
    - AC3：reader mtime 增量 + store `INSERT OR REPLACE` 幂等；`grok-reader.test.ts`「skips unchanged files via mtime and re-merges on change」覆盖。
    - AC4：`collector-state.test.ts`「restored grok state is passed to the grok reader on next collect」+ save/load round-trip 含 float mtime。
    - AC5：`grok-reader.test.ts` missing/ENOTDIR/文件级不可读+重试三用例；`collector.test.ts`「warns once when grok dir missing」验证 warn-once 且不阻断其它 source。
    - AC6：records `agent="grok"` 断言（reader + collector + store 三处）。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：FAIL
- Round 3 code：PASS
- Round 3 test：PASS

### 结果摘要

grok token-stats 采集闭环：reader/collector/scan-state/store 全部接线，真实 WSL 数据黑盒验证通过，AC1-AC6 全绿。
