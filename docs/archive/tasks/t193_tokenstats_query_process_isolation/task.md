---
tid: "t193"
slug: "tokenstats_query_process_isolation"
title: "P4 代理面板统计查询进程隔离"
status: "done"
branch: "t193_tokenstats_query_process_isolation"
worktree: ""
review_level: "full"
diff_anchor: "4a0e294797c290f0f365f329727ba069b21b097f"
depends_on: "t192"
conflicts_with: ""
note: "P4"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 实施要点（t193 查询进程隔离）

- 执行端选型（s009 spike）：utilityProcess 优于 worker_threads——native 崩溃隔离满足 AC3，打包路径有 collector 先例；worker_threads 线程 native 崩溃会带崩整个 Electron。只读 WAL 并发语义（读已提交、写提交后可见、未提交写事务读旧快照、close 无锁残留、拒写）由 spike 实测背书。
- 实现：`query-worker.ts`（utilityProcess 子进程，readonly store 按需打开）+ `query-dispatcher.ts`（单 worker，1 active + 1 queued 上限、superseded/超时受控错误、崩溃后 restart_delay 受控重启、stop 先 close 后 kill）+ `token-stats-store.ts` readonly 支持 + IPC/local-api 路由 dispatcher + main 生命周期接线 + electron-vite 多入口（query-worker.js）。
- 打包路径踩坑（AC6 黑盒验证发现并修复）：
    1. `TOKEN_STATS_OPEN` IPC handler 原注册在 E2E 跳过的 tray 块内，E2E/打包 smoke 下代理面板打不开——移出 tray 块（panel 打开是窗口级能力）。
    2. pnpm hoisted 布局下 electron-builder 不收集 better-sqlite3 的 JS 依赖 `bindings`/`file-uri-to-path`，utilityProcess 子进程 `require('bindings')` 失败——electron-builder\*.yml 的 `files` 与 `asarUnpack` 显式携带。
    3. `electron-builder --dir` 前必须先 `ensure_sqlite_abi.mjs electron`（collect 阶段按 electron ABI 编译 native addon），否则打包内 NODE_MODULE_VERSION 不匹配启动即崩。
    4. smoke.spec 需清 CDP 代理环境变量：本机全局 HTTP 代理会劫持 `connectOverCDP` 的 `/json/version` 探测返回 400。
- 审查发现并修复：崩溃恢复间隙双 fork 泄漏（restart timer 加 `!child` 守卫）；`stop()` 先发 close 再 kill 使 close 协议生产可达。
- 测试：t193 相关单测 79 全绿，全量 2054 passed；packaged smoke 4 用例全绿（AC6 断言 dashboard 经 worker 返回 data_version 与 sessions.total）。

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

### Round 1 (2026-08-03 20:10 UTC+8)

| finding_id     | severity  | status | rationale                                                                     | fix_ref                                                         |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| t193_test_f001 | minor     | 已修   | 补 stale response 丢弃回归测试（超时后迟到旧 request_id 不 resolve/不污染）   | tests/unit/main/core/token-stats/query-dispatcher.test.ts:106   |
| t193_test_f002 | important | 已修   | crash 后 restart 间隙新请求不双 fork：timer 回调加 `!child` 守卫 + 回归测试   | src/main/core/token-stats/query-dispatcher.ts:127               |
| t193_test_f003 | minor     | 已修   | readonly 与 writable DTO 对比补 `previous` 区                                 | tests/unit/main/core/token-stats/token-stats-store.test.ts:1122 |
| t193_code_f001 | important | 已修   | 同 test_f002：恢复间隙双 fork 泄漏，最终工作区 `!child` 守卫 + 测试已修复核实 | src/main/core/token-stats/query-dispatcher.ts:127               |
| t193_code_f002 | minor     | 已修   | stop() 先 `postMessage({type:"close"})` 再 kill，close 协议生产可达           | src/main/core/token-stats/query-dispatcher.ts:257               |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1-AC7 全部实现并有测试。单测：query-worker（4）、query-dispatcher（7）、token-stats-store（68，含 readonly 块）、token-stats-ipc（15）、local-api server（23）全绿；全量 `pnpm test` 2054 passed / 1 skipped；typecheck / eslint / prettier 通过。黑盒：`pnpm package` 真实打包后 `pnpm test:packaged` 4 用例全绿，含 AC6（代理面板打开、dashboard 经 asarUnpack query-worker 完成查询、electron-Abi better-sqlite3 正常）。打包修复路径见实施笔记。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

`single`：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

t193 完成：dashboard 聚合查询迁入独立 utilityProcess query worker（readonly WAL 连接 + 1 active/1 queued 并发上限 + 超时 + 崩溃受控重启 + 优雅关闭），主进程事件循环不再被同步聚合阻塞；打包内 asarUnpack query-worker + better-sqlite3 electron ABI 经 packaged smoke AC6 验证。审查 2 轮：Round 1 双 fork 泄漏（important）与 close 死协议（minor）等 5 条 finding 全部处置为已修并补回归测试，Round 2 code+test 双 PASS。
