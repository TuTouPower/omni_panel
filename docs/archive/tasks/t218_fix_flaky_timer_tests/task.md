---
tid: "t218"
slug: "fix_flaky_timer_tests"
title: "flaky 定时器集成测试统一处置"
status: "done"
branch: "t218_fix_flaky_timer_tests"
worktree: ""
review_level: "single"
diff_anchor: "559f8cc5134d29e5dd6a9cbb37ece9fdd05747f1"
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

- `pnpm install --prefer-offline` 备 worktree 依赖；`node scripts/ensure_sqlite_abi.mjs node` 重建 better-sqlite3 原生绑定。
- 全量 `pnpm test` 首跑失败 `tests/unit/ipc/build-info-ipc.test.ts`：`src/generated/build-info.ts` 缺失（`src/generated/` 全目录 gitignore，worktree 无此生成物）。`mkdir -p src/generated` + `npx tsx scripts/gen-build-info.ts` 生成后全绿。与 t218 改动无关，是 worktree 环境前置。
- 处置决策（写入 spec 上下文区「测试策略」）：
    - refresh-service / grok-oauth：真实 connector 子进程 + 真实 1s/2s 重试定时器。伪时钟无法加速子进程退出（真实事件），故保留真实定时器，`describe(name, fn, 30000)` 覆盖 2s×3 重试 + 子进程启动。
    - file-vault 20 并发写：保留真实 `Date.now()` 计时（伪时钟下会假绿），断言窗口 2s→15s + `it` 30000 timeout。
    - subscription-service：保留真实定时器（Windows mtime 量化需真实墙钟间隔 + 负向断言无 wait_for 对应物），`wait_for` 默认 2s→10s，describe 30000，负向等待 150ms→300ms。
    - `setTimeout(50)` 负向等待归 t220（spec 非范围，未动）。
- 验证：整批 `pnpm test` 连跑 3 次全绿（222 files / 2344 passed）；5 个目标文件隔离跑全绿；typecheck / lint 通过。

创建期核实（2026-08-05，只读仓库）：

- `refresh-service.ts` 真实定时器：`:314,454,480` `setTimeout(retry_delay_ms=1000)`、`:430` `setTimeout(2000)`（re-login 后重试等待）→ 3 次重试需 ~5s 墙钟，整批并行负载下跑不进 vitest 默认 5s 超时。与 p049 描述一致。
- `provider_account_row.test.tsx:426` `setTimeout(resolve, 50)` 负向等待「切回缓存不重发 IPC」——归 t220，不在本 task。
- 其余 flaky 文件（grok-oauth 5000ms、secrets-store/file-vault 20 并发写 2s 窗口、subscription-service 30ms 轮询）为 p051 系统性表现，执行期逐一核对用例并改造。

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

### Round 1 (2026-08-05 22:40 UTC+8)

两条 minor，均为 spec 上下文措辞与代码不一致（review 结论明确「不构成 AC 违反」），处置为改 spec 上下文区，不计 FAIL。

| finding_id    | severity | status | rationale                                                                   | fix_ref          |
| ------------- | -------- | ------ | --------------------------------------------------------------------------- | ---------------- |
| t218_gen_f001 | minor    | 已修   | spec 上下文注明 grok-oauth describe 仅单 it、实际落 it 级 timeout，覆盖等价 | spec.md:测试策略 |
| t218_gen_f002 | minor    | 已修   | spec 上下文枚举补全 5 处 80ms 基线等待并注明 mtime 量化理由                 | spec.md:测试策略 |

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
    - AC-1：整批 `pnpm test` 连跑 3 次全绿（222 files / 2344 passed / 1 skipped），无 5s 超时、无断言窗口被挤爆；改动文件为 refresh-service（describe 30000）、grok-oauth（it 30000）、file-vault（2s→15s 窗口 + it 30000）、subscription-service（wait_for 10s + describe 30000）。
    - AC-2：5 个目标文件隔离全绿（refresh 30/30、grok-oauth 1/1、file-vault 27/27、subscription 15/15）；secrets-store 无 2s 断言窗口，核实后正确跳过。
    - AC-3：`setTimeout(50)` 负向等待归 t220（spec 非范围）；残留固定时长等待为 subscription-service 两处负向等待（300ms）+ 五处 mtime 量化基线等待（80ms），理由已在 spec 上下文区「测试策略」说明。
    - typecheck / lint 通过。

### Reviewer verdict

- Round 1 general：PASS（2 minor 均处置为改 spec 上下文区）

### 结果摘要

p049+p051 系统性 flaky 处置完毕：真实定时器用例统一提 timeout / 放宽断言窗口，spec 上下文区记录处置决策；整批 3 次连跑全绿消除负载敏感超时。
