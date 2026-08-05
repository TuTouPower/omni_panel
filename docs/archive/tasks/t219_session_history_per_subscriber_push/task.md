---
tid: "t219"
slug: "session_history_per_subscriber_push"
title: "会话历史增量推送按订阅方窗口路由"
status: "done"
branch: "t219_session_history_per_subscriber_push"
worktree: ""
review_level: "full"
diff_anchor: "6a5c5ebf80c3e6b43345ef32a5be48aeca08f96b"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

Step 1 前置：`{doctor_cmd}` 无（blueprint 声明无独立 doctor，靠测试命令失败信号判定）。

执行期（2026-08-05）：

- 设计：订阅服务改为多订阅方模型——`Subscription` 存 `subscribers: Map<subscriber_id, {on_update}>`，同 loc 不同 `subscriber_id` 并存、各自收推送；缺省 id 用 `__legacy__`（未绑定窗口的 fallback，路由由调用方 on_update 决定，spec AC-4）。
- IPC：SUBSCRIBE 取 `event.sender`（发起窗口 webContents）为订阅方身份，`on_update` 发回该 sender；挂 `event.sender.once("destroyed", ...)` 注销该订阅（AC-3 无泄漏）。UNSUBSCRIBE 只注销调用方窗口的订阅。`history_window_controller` 从 IPC deps 移除（不再需要；OPEN 仍在 main/index.ts 单点注册）。
- main/index.ts：移除历史窗口 closed 时的全局 `unsubscribe_all()`——per-subscriber destroyed 清理已覆盖，保留全局清空会误伤多窗口下其他订阅方。
- 偏离 spec 上下文区测试策略的说明：未用伪时钟（多窗口订阅测试走真实轮询，沿用 t218 处置：wait_for + 80ms settle）。
- 验证：IPC 11 tests + subscription-service 18 tests 隔离全绿；typecheck / lint 通过。

创建期核实（2026-08-05，只读仓库）：

- `session-history-ipc.ts:70-80` SUBSCRIBE 的 `on_update` 写死 `deps.history_window_controller.get_window()`。当前唯一订阅方 = 历史窗口（t211），无实际推错场景，与 p048 描述一致。
- `Subscription` 表（subscription-service.ts:94-98）无订阅方窗口身份字段；subscribe 返回 key 但 IPC 层未存。
- 改造方向：SUBSCRIBE IPC 取 `event.sender` 身份存入订阅记录，`on_update` 按订阅方窗口路由。

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

### Round 1 (2026-08-05 23:12 UTC+8)

full 级双路 review：code PASS（1 minor）、test PASS（2 minor）。3 条 minor 均本 task 内已修，无遗留。

| finding_id     | severity | status | rationale                                                                                 | fix_ref                               |
| -------------- | -------- | ------ | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| t219_code_f001 | minor    | 已修   | fan-out 循环逐订阅方 try/catch 隔离，单回调抛错不剥夺其余推送；提取失败与回调失败日志分离 | subscription-service.ts:handle_change |
| t219_test_f001 | minor    | 已修   | 补「最后一个订阅方注销 → 停 watcher + loc 移除 + 不再推送」用例                           | subscription-service.test.ts          |
| t219_test_f002 | minor    | 已修   | 补 isDestroyed 守卫分支用例：已销毁窗口 on_update 不 send                                 | session-history-ipc.test.ts           |

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC-1（多窗口互不串扰）：IPC「两个窗口订阅同一会话，各窗口只收到自己订阅的推送」+ service「同 loc 多订阅方并存，各自收推送」双覆盖，整批 pnpm test 全绿（222 files / 2351 passed）。
    - AC-2（历史窗口单订阅不回归）：既有增量测试原样保留，`event.sender` 路由闭包测试锁定推送目标 = 订阅方。
    - AC-3（窗口关闭注销无泄漏）：IPC destroyed 监听注销测试 + service「指定 subscriber_id 注销」「最后一个订阅方注销停 watcher」三用例。
    - AC-4（未绑定窗口 fallback）：`__legacy__` 缺省 id，service「legacy 与显式 id 并存」用例 + docstring。
    - typecheck / lint 通过。

### Reviewer verdict

- Round 1 code：PASS（1 minor 已修：fan-out 逐订阅方隔离）
- Round 1 test：PASS（2 minor 已修：最后订阅方注销分支 + isDestroyed 守卫）

### 结果摘要

p048 防御性改造完成：订阅表多订阅方模型 + IPC 按 event.sender 路由 + destroyed 注销；同会话多窗口互不串扰，历史窗口单订阅不回归，遗留 fallback 文档化。
