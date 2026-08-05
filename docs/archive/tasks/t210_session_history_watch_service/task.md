---
tid: "t210"
slug: "session_history_watch_service"
title: "会话历史主进程订阅与 watcher 服务"
status: "done"
branch: "t210_session_history_watch_service"
worktree: ""
review_level: "full"
diff_anchor: "0598dab1cf063cdf6941e33dbb0be3eb7798d0dc"
depends_on: "t209"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- t209 SPIKE s015 已确认四端来源路径（grok chat_history.jsonl、opencode SQLite、kimi wire.jsonl、claude_code transcript），SPIKE 结论入 findings。
- 服务层 subscription-service.ts 完成：订阅表、策略选择（win+claude_code→fs.watch，其余 2s 轮询）、增量提取、query 分页、recent_sessions。
- IPC 接线 subagent 在 preload `invoke<void>` 处遇 no-invalid-void-type lint 中断，我接管修复（改 `Promise<undefined>`）。
- Round 1 code review 4 finding（2 important：WSL 会话 resolve 缺配置注入 + 自动探测、OPEN 首次创建定位参数丢失；2 minor：分页游标累计计数在活跃会话翻页错位、on_update 固定推历史窗口）。test review 3 important（route 分权零测试、只读约束零测试、fs.watch 分支零测试）+ 3 minor。
- f001 修复：session-locator 加 effective_wsl_user 自动探测（对齐 collector），main/index.ts 把 tokenStats.wslDistro/wslUser 注入 IPC deps.locator_paths。
- f002 修复：OPEN handler 改 `open_or_focus(loc)`，首次创建经 URL route_query 传初始定位参数（renderer 启动读），已开则内部 send_focus。
- f003 修复：query 分页游标从「累计消息数」改为 `ExtractCursor.pagination` 形态（编码已返回页最早消息 id），追加新消息不挤入更早页。
- f004 遗留 p048（on_update 固定推历史窗口；当前仅历史窗口订阅，无实际推错场景）。
- 测试补齐：route_api 分权、只读约束、fs.watch/pick_strategy、分页追加不重复、unsubscribe_all 行为、IPC locator_paths 注入、controller open_or_focus(loc) 双路径。
- getRendererUrl 重构为 query 数组拼接（支持 route_query 附加参数），既有 first_paint_theme.test 的 `?ou_theme=${theme}#${route}` 字面量断言随实现拆分更新为验证 `ou_theme=${theme}` 与 `#${route}` 两个契约片段（契约未变，仅字面量组合方式变化）。
- Round 2 code review 2 minor：f005 分页游标 id 定位遇空/重复 id 跳段 → 改绝对下标 end_index（append-only 前缀稳定，比 id 更稳）；f006 OPEN 创建窗口期 send_focus 丢失 → did-finish-load 补发初始定位。test review 2 minor：f007 disabled 契约未锁定 → disabled_api 独立 spy + noop 返回值断言；f008 getRendererUrl route_query 零测试 → window_manager.test.ts 补编码用例。另补 opencode sqlite db 经订阅服务轮询用例（真实 better-sqlite3 fixture）。

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

### Round 1 (2026-08-05 15:00 UTC+8)

| finding_id     | severity  | status | rationale                                                                                        | fix_ref                                        |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| t210_code_f001 | important | 已修   | locator 自动探测 wsl_user + main 注入 tokenStats.wslDistro/wslUser 到 IPC deps                   | session-locator.ts:143, src/main/index.ts:362  |
| t210_code_f002 | important | 已修   | OPEN 改 open_or_focus(loc)；首次创建经 URL route_query 传初始定位                                | history-window-controller.ts:42, main/index.ts |
| t210_code_f003 | minor     | 已修   | 分页游标改 pagination 形态按最早消息 id 定位（Round 2 f005 再改为绝对下标）                      | subscription-service.ts:358                    |
| t210_code_f004 | minor     | 遗留   | 订阅方唯一是历史窗口，无实际推错场景；未来内联订阅需按发起窗口路由                               | p048                                           |
| t210_test_f001 | important | 已修   | route_api.test.ts 补 select_session_history_api 分权矩阵                                         | route_api.test.ts                              |
| t210_test_f002 | important | 已修   | 订阅服务测试补只读断言（源文件字节不变、无额外文件）                                             | subscription-service.test.ts                   |
| t210_test_f003 | important | 已修   | watcher.test.ts 补 pick_strategy 矩阵 + fs.watch 分支（change/error/stop/退化轮询）              | watcher.test.ts                                |
| t210_test_f004 | minor     | 已修   | opencode sqlite db 经订阅服务轮询增量（Round 2 补真实 db fixture 用例）                          | subscription-service.test.ts                   |
| t210_test_f005 | minor     | 遗留   | grok locator 命中路径：UNC 路径无法在测试环境构建；spec 可测试性声明豁免，t213 真实 WSL 手动验收 | t213                                           |
| t210_test_f006 | minor     | 已修   | unsubscribe_all 行为断言（追加不再推送）                                                         | subscription-service.test.ts                   |

### Round 2 (2026-08-05 15:20 UTC+8)

| finding_id     | severity | status | rationale                                                               | fix_ref                         |
| -------------- | -------- | ------ | ----------------------------------------------------------------------- | ------------------------------- |
| t210_code_f005 | minor    | 已修   | 分页游标改绝对下标（end_index），空/重复 message id 不再 findIndex 跳段 | subscription-service.ts:377     |
| t210_code_f006 | minor    | 已修   | OPEN 创建窗口期 did-finish-load 补发初始定位，loadURL 未完成不丢定位    | history-window-controller.ts:57 |
| t210_test_f007 | minor    | 已修   | disabled_api 独立 spy + noop 返回值断言，锁定「不碰真实 IPC」           | route_api.test.ts               |
| t210_test_f008 | minor    | 已修   | window_manager.test.ts 补 getRendererUrl route_query URL 编码用例       | window_manager.test.ts          |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 watcher/轮询触发推送增量只含新增：subscription-service.test.ts 轮询策略用例（grok/kimi/claude_code/opencode 四端），watcher.test.ts fs.watch 分支；全绿。
    - AC2 WSL 轮询推送：wsl 轮询用例覆盖；WSL 真实路径 resolve 由 t213 手动验收（UNC 无法自动测，spec 可测试性声明补充）。
    - AC3 QUERY 全量 + 游标分页统一模型：query 全量/分页三页到顶/追加不重复用例。
    - AC4 注销释放句柄：unsubscribe + unsubscribe_all 行为断言（追加不再推送）。
    - AC5 窗口关闭注销全部订阅：controller 单测 closed 释放 + main/index.ts 接线（[deploy] t213 手动验收窗口闭环）。
    - AC6 全程只读：只读断言（源文件字节不变、无额外文件），session-locator 只读扫描实现。
    - AC7 OPEN 幂等：controller 单测（未开 create / 已开复用 / closed 重建）。
    - AC8 最近会话降序 + limit + 五字段：recent_sessions 用例（降序/截断/agent 派生）。
    - AC9 preload route 分权：route_api.test.ts select_session_history_api 矩阵（history/agent→full，其余→disabled noop 契约）。
    - 黑盒：`pnpm test` 219 文件 2289 用例，仅 refresh-service 存量 flaky（p049，单文件隔离 30/30 通过，与 t210 无关）；typecheck + lint 零警告。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（2 important + 2 minor，均已处置）
- Round 1 test：FAIL（3 important + 3 minor，均已处置）
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话历史订阅/watcher 服务 + SESSION*HISTORY*\* IPC 通道组落地，四端增量推送、分页查询、最近会话、OPEN singleton、preload route 分权全部实现并过审；WSL 路径自动探测与窗口 e2e 交 t213 手动验收。
