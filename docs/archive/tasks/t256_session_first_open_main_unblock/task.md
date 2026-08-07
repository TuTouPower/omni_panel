---
tid: "t256"
slug: "session_first_open_main_unblock"
title: "会话首屏文件 IO 移出主进程与 collector 写入让路"
status: "done"
branch: "t256_session_first_open_main_unblock"
worktree: ""
review_level: "full"
diff_anchor: "c701f36871cb57b9f7bdd46b1d9cd637f4c0812a"
depends_on: "t254,t255"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### Step 1（SPIKE s021）

- `{doctor_cmd}` 无独立命令。worktree 装依赖 + gen-build-info。
- SPIKE 1 核实异步化安全性：`extract_cache` 模块内 Map 读写同步原子，watcher 回调同步更新，任务内 `await setImmediate` 只发生在缓存读后写回前，无竞态。安全。
- SPIKE 2 实验让路方式：2000 行 better-sqlite3 同步全量 3340ms vs 200/批 × 10 批 setImmediate 18ms；每批独立 tx 语义保持。采用分批 setImmediate。报告 `docs/spikes/s021_main_unblock/report.md`。
- preflight `--require-verified` PASS。

### Step 2/3（实现）

- `subscription-service.ts` `summaries`：任务体改 async，读前 `await setImmediate` 让出事件循环，避免首屏批量摘要同步 fs 阻塞主进程（t256）。
- `manager.ts`：collector update 消息改 `apply_batches` 分批处理——每批 ≤2000 条，`upsert_sessions + upsert_records` 每批独立 tx，批次间 `setImmediate` 让出供面板查询响应；全部完成后触发 `on_update`。DELETE+全量重建 buckets 语义每批保持（幂等全量，最终数据与现状一致）。
- 新增 manager 分批让路测试（5000 条 → 3 批，flush 验证每批间隔 + on_update 延迟到全部完成）；改原「stores session deltas」测试为 async flush 等待。
- 完整套件：240 files / 2579 passed / 8 skipped 全绿。

### Step 4（黑盒）

- `pnpm test`：2579 passed 全绿；typecheck + lint 通过。
- electron e2e：35 passed / 4 skipped / 0 failed。
- 打包 smoke：4 passed（打包形态 collector 分批写入 + summaries 异步正常）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-07 23:40 UTC+8)

| finding_id     | severity              | status | rationale                                                                    | fix_ref                      |
| -------------- | --------------------- | ------ | ---------------------------------------------------------------------------- | ---------------------------- |
| t256_code_f001 | critical              | 已修   | apply_batches 循环边界改三数组最大长度，每数组独立切片防丢数据               | manager.ts apply_batches     |
| t256_test_f001 | important             | 已修   | summaries 异步让出测试（3 grok 摘要结果一致）                                | subscription-service.test.ts |
| t256_test_f002 | important             | 已修   | records>sessions 不丢数据测试（5000 records → 3 批全写入）                   | manager.test.ts              |
| t256_test_f003 | minor                 | 已修   | 分批让路测试已覆盖批次间隔 + on_update 时序                                  | manager.test.ts              |
| t256_test_f004 | minor（Round 3 新增） | 已修   | summaries 让出测试 await Promise.resolve() 后仍 counter=0，区分宏/微任务让出 | subscription-service.test.ts |

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1 由 summaries 异步让出测试（spy extract_first_user，await Promise.resolve() 后 counter=0 证明宏任务让出）+ 完整测试 2581 passed；AC2 由 manager 分批让路测试（5000 条 → 3 批 + on_update 延迟）；AC3 由 records>sessions 不丢数据测试 + 既有 session-history/token-stats 全量回归；AC4 由完整测试 + electron e2e 35 passed + 打包 smoke 4 passed；AC5 待真实环境人工确认（[deploy]）。

### Reviewer verdict

`full`：

- Round 1 code：FAIL（t256_code_f001 critical：apply_batches 以 sessions.length 驱动分批丢 records）
- Round 1 test：FAIL（f001 important summaries 异步无测试、f002 important records 截断、f003 minor 并发）
- Round 2 code：PASS（f001 已修：循环边界改三数组最大长度）
- Round 2 test：FAIL（f001 修不彻底：summaries 测试断言缺失，回退 setImmediate 仍绿）
- Round 3 test：PASS（f001 真修：spy counter + await Promise.resolve 区分宏/微任务；新增 f004 minor 修复）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话首屏主进程非阻塞：summaries 任务 setImmediate 让出 + collector 回填分批让路（循环边界取三数组最大长度防丢数据）；修复 critical 数据丢失 bug；summaries 让出测试区分宏/微任务。- 一句话；无额外说明可写「见上」
