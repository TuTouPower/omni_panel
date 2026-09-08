---
tid: "t459"
slug: "desktop_write_cli_json"
title: "桌面启动写入 cli.json 实例发现"
status: "done"
branch: "t459_desktop_write_cli_json"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "e72e62ca3357eb40ff399d9f9341b2abc20c7176"
depends_on: ""
conflicts_with: ""
note: "GUI 与 serve 同写 cli.json；single：复用现发现文件，无新鉴权面"
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- GUI 与 serve 共用 `write_cli_json`：LocalAPI start 后无条件写入；CLI 仍只负责 stdout 打印 URL。
- 黑盒发现 d055：playwright 注入 Chromium 开关使 `extract_user_argv` 只剥 rest[0] 失效 → 改剥第一个 `.js` 主脚本；补单测；顺带修 `cli_control` 桌面用例假命令。
- AC-003：把 `cli.json` 预置为目录触发 EISDIR，断言进程与 health 仍可达。
- AC-002：`cli_serve` AC1/AC2 e2e 回归绿；d056（cli_flow 干净退出）main 基线即红，记 finding，不阻塞本 task。
- 文档：architecture / cli-mode / specs/desktop_cli_json_discovery + specs_index。

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

### Round 1 (2026-09-08 08:56 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t459_gen_f001|important|已修|extract_user_argv 只剥路径形态 `.js`，跳过 VALUE_FLAGS 值位|src/main/cli/args.ts + args.test.ts|
|t459_gen_f002|important|已修|AC-001/004 e2e 固定 OMNI_PANEL_PORT=17934 并断言 port/url|tests/e2e/electron/desktop_cli_json.spec.ts|
|t459_gen_f003|minor|已修|AC-003 改 statSync.isDirectory|tests/e2e/electron/desktop_cli_json.spec.ts|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/003/004 由 `desktop_cli_json.spec.ts`；AC-002 由 `cli_serve.spec.ts` AC1/AC2 回归；见 `handoff.json` ac_evidence

### Reviewer verdict

`single`：

- Round 1 general：FAIL（3 finding，已处置）
- Round 2 general：PASS（0 新 finding；前轮 3 条已消除）

### 结果摘要

- GUI 与 serve 均写 cli.json；d055 argv 剥离修复并防打包误剥；e2e 固定非默认端口覆盖 AC-004
