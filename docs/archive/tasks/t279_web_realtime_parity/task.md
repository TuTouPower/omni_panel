---
tid: "t279"
slug: "web_realtime_parity"
title: "web 实时对齐：sessionHistory 订阅推送 + logs.export 下载"
status: "done"
branch: "t279_web_realtime_parity"
worktree: ""
review_level: "single"
diff_anchor: "08b4f86e28e1b77d99c3fe371e657f3ef3956586"
depends_on: "t275"
conflicts_with: "t277,t278"
note: "single 理由：推送接线与文件下载，无安全/迁移面"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- SPIKE 核实（spec 上下文区 UNVERIFIED-SPIKE）：会话历史 watcher 经 `session-history-ipc.ts` 以 `event.sender` 为订阅方身份收 `SESSION_HISTORY_MESSAGES_UPDATED`；local-api 已有 `/v1/events` SSE（runtimeStore state 通道）。结论：web 复用 subscription-service + 现有 SSE 通道，以 subscriber_id 查询参数开专属事件流，on_update 经该连接推命名事件 `messagesUpdated`；连接关闭（SSE close）即注销订阅，不依赖 beforeunload，杜绝 watcher 泄漏。订阅幂等：同 loc 重复 subscribe 复用既有连接。
- 日志导出：local-api 新增 `GET /v1/logs/export`，流式输出当前活跃日志段（`<userData>/logs/app-<date>.log`，与桌面 `exportCurrentLog` 同路径语义），`Content-Disposition` 触发浏览器下载；web bridge `logs.export` fetch → blob → 下载，返回 `{saved:true}`。`create_local_api_server` 新增 `user_data_path` 选项，main 注入 dataRoot。
- worktree 环境坑：electron 二进制缺失（install.js 因 dist 目录已存在而跳过下载），从 `~/.cache/electron/` 解压补上；`path.txt` 内容必须是 `electron`（`index.js` 会拼 `__dirname/dist`，写 `dist/electron` 会翻倍路径导致 ABI verify 失败）。better-sqlite3 ABI 切换与 t278 同流程。
- 无头验证固定使用 `E2E=1 E2E_HEADLESS=1 xvfb-run -a`（自起 vite preview，绕过 `pnpm exec` 触发 install 的副作用）。`pnpm test` 2807 passed / 9 skipped（本 task 新增 12 用例）、`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；Electron add-account E2E `4 passed`；Web E2E `68 passed, 2 failed`，两项仍为既有 synthetic fixture 重建基线（`p105`），非本 task 引入。
- Finalization 时同步 `docs/blueprint/architecture.md`（web 实时推送事件清单）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-10 16:26 UTC+8)

Round 1 的 1 条 important（f001）与 3 条 minor 均已在当前 task 内修复。

| finding_id    | severity  | status | rationale                                                                   | fix_ref                                                                            |
| ------------- | --------- | ------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| t279_gen_f001 | important | 已修   | SSE 重连 open 时以同 subscriber_id 幂等重挂订阅，断连恢复不丢实时推送。     | `src/web/usageboard-web.ts:642-661`                                                |
| t279_gen_f002 | minor     | 已修   | 初始注册 POST 失败时关闭连接并清理订阅条目，服务端 SSE close 兜底注销。     | `src/web/usageboard-web.ts:655-667; tests/unit/web/usageboard-web.test.ts:879-896` |
| t279_gen_f003 | minor     | 已修   | 注销测试改为双订阅方真实语义：注销其一断言 service.unsubscribe 仅触达目标。 | `tests/integration/local-api/server.test.ts:2076-2132`                             |
| t279_gen_f004 | minor     | 已修   | 新增 SSE close 自动注销集成用例，防 watcher 泄漏主路径有回归守护。          | `tests/integration/local-api/server.test.ts:2134-2171`                             |

### Round 2 (2026-08-10 17:10 UTC+8)

Round 2 的 1 条 important（f005）与 1 条 minor（f006）均已在当前 task 内修复。

| finding_id    | severity  | status | rationale                                                                                                                    | fix_ref                                                                                          |
| ------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| t279_gen_f005 | important | 已修   | cleanup 竞态防护提为纯函数 `sse_cleanup_should_unsubscribe`（映射与 client 双身份校验），旧连接迟到 close 不误删重连新注册。 | `src/main/core/local-api/server.ts:133-151,1489-1499; tests/unit/local-api/server.test.ts:32-61` |
| t279_gen_f006 | minor     | 已修   | 日志导出去 Content-Length 改 chunked 传输，活跃日志边写边增不截断。                                                          | `src/main/core/local-api/server.ts:788-800`                                                      |

### Round 3 (2026-08-10 18:30 UTC+8)

Round 3 的 1 条 minor（f007）已在当前 task 内修复。

| finding_id    | severity | status | rationale                                                                                                   | fix_ref                                                                            |
| ------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| t279_gen_f007 | minor    | 已修   | 注册 POST 统一移入 EventSource open 时机发送，结构性消除「POST 先于连接注册 → 409」竞态；失败路径保留清理。 | `src/web/usageboard-web.ts:642-667; tests/unit/web/usageboard-web.test.ts:772-797` |

### Round 4 (2026-08-10 19:05 UTC+8)

Round 4 零新 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1（SSE 订阅注册 → watcher 增量经 `messagesUpdated` 命名事件推送的集成测试 + bridge open 后 POST 注册与消息分发单测；unsubscribe 关闭连接与 POST 注销）；AC2（`/v1/logs/export` 返回当前活跃日志段内容与下载头，与桌面 `exportCurrentLog` 同路径语义；web bridge 触发浏览器下载并返回 saved）；AC3（断连自动重连在 open 时以同 id 幂等重挂；cleanup 竞态 guard 防误删新注册；注册失败清理 + renderer 5s 轮询兜底）；AC4（桌面 session-history IPC 与日志导出未改动，Electron add-account E2E 4 passed 回归）。`pnpm test` 2821 passed / 2 skipped、`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；Web E2E 68 passed、2 failed 均为既有 synthetic fixture 重建基线（`p105`）。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：FAIL
- Round 2 general：FAIL
- Round 3 general：PASS
- Round 4 general：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- web 实时对齐完成：会话历史订阅经 SSE 推送、日志导出浏览器下载；四轮 general 审阅后 PASS，7 条 finding 全部本 task 内修复。
