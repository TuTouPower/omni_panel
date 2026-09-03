---
tid: "t440"
slug: "bg_serve_lock_race_stale_early_exit"
title: "background serve 早退识别修复(单实例锁冲突 code-0 静默退出误报超时)"
status: "done"
branch: "t440_bg_serve_lock_race_stale_early_exit"
worktree: ""
review_level: "full"
diff_anchor: "a39420f94a1f9698374b08896a2e70ab33326ae4"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 环境：worktree 无 node_modules(p207 关联)。临时 `ln -s 主仓/node_modules` 软链补齐;electron dist 主仓完整、worktree 经软链共享。测试命令统一用 worktree 内 `pnpm vitest run`(软链后可解析)。
- sqlite ABI:主仓缓存默认 electron;全量测试前须 `node scripts/ensure_sqlite_abi.mjs node` 切 node ABI,否则 better-sqlite3 NODE_MODULE_VERSION 146 vs 137 大量崩。软链共享主仓 node_modules/.cache,主仓再跑 electron 前需切回(运行期动作,非本 task 范围)。
- typecheck 前置:`src/generated/` 为 gitignore、worktree checkout 不存在;`gen-build-info.ts` 不建目录,先 `mkdir -p src/generated` 再生成,否则 tsc 报 `Cannot find module generated/build-info`。生成文件 gitignore,不入 commit。
- 实现:t440 改动仅 `src/main/cli/background_serve.ts`。抽 `classify_poll_result` 纯函数(exitCode 优先判定:非0 exited / code0 exited_code0 / cli.json pid+url 匹配 ready / 其余 continue),父进程轮询循环改用它。code0 早退新分支写「单实例锁冲突」诊断并 exit 1,不再空等 15s。
- 原超时分支(子进程存活 15s 未写 cli.json)逻辑保留:循环内 code0 已立即 return,不会漏判。

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `.repo_template/scripts/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

### Round 1 (2026-09-04 00:35 UTC+8)

test review 3 条 minor;code review 0 finding。全处置 已修(改代码+测试),回流重审。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t440_test_f001|minor|已修|抽 build_early_exit_msg 纯函数,AC-003/001 文案入单测|src/main/cli/background_serve.ts:42, tests/unit/main/cli/background_serve.test.ts|
|t440_test_f002|minor|已修|删冗余 deadline 假覆盖用例;补「url 无 pid → continue」细分|tests/unit/main/cli/background_serve.test.ts|
|t440_test_f003|minor|已修|补 code0/非0 退出 + cliInfo 匹配组合,固化「退出优先 cli.json」不变量|tests/unit/main/cli/background_serve.test.ts|

### Round 2 (2026-09-04 00:40 UTC+8)

code review Round 2 PASS 另出 1 minor(t440_code_f001);test review Round 2 PASS 另出 1 minor(t440_test_f004)。全处置 已修,回流 Round 3 审。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t440_code_f001|minor|已修|build_early_exit_msg 改判别联合重载,kind=exited 必带 code,杜绝缺参输出 code=undefined|src/main/cli/background_serve.ts:43|
|t440_test_f004|minor|已修|AC-003 补「另一实例正在启动或关闭」「若刚执行过 quit」逐字 toContain 锚定|tests/unit/main/cli/background_serve.test.ts|

### Round 3 (2026-09-04 00:45 UTC+8)

code/test review Round 3 双 PASS,0 新 finding,历史 minor(t440_test_f001~f003、t440_code_f001、t440_test_f004)全关闭。未进处置表。

### Round 4 (2026-09-04 00:50 UTC+8)

eslint --fix(prefer-optional-chain:cliInfo 判空改 `cliInfo?.pid`)+ prettier 格式化(机械等价重构)。code/test Round 4 双 PASS,0 新 finding,scope fresh。未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文。classify_poll_result + build_early_exit_msg 单测 9 例覆盖 AC-001~004,全量 pnpm test 3461 passed

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS
- Round 4 code：PASS
- Round 4 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 4 轮 review 全 PASS(5 条 minor 全处置已修);t440 修复 background serve 单实例锁冲突 code0 静默早退被误判空等超时:抽 classify_poll_result(退出优先于 cli.json,code0 也判失败)+ build_early_exit_msg(锁冲突诊断文案),单测 9 例,全量 3461 passed。
