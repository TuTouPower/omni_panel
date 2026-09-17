---
tid: "t501"
slug: "net_client_allowed_paths_tilde_expansion"
title: "net-client 本地白名单路径展开波浪号并补齐连接器错误日志"
status: "done"
branch: "t501_net_client_allowed_paths_tilde_expansion"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "a7fb6079e802a301420aeef193ab18d01d5b589d"
depends_on: ""
conflicts_with: ""
note: "来源 p251；修复 net-client is_within_allowed 未展开波浪号导致 codex/claude 无法读取本地文件的问题，补齐错误日志"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- net-client.ts：`import { homedir }` 改 `import * as os` 使 `vi.mock("node:os")` 可达；`expand_home` 补 `~\`（join slice(2)）保留裸 `~`/`~/`、`~otheruser` 不展开；抽 `canonical_path = normalize(resolve(expand_home()))` 双边规范化 `is_within_allowed`；`files.list` 先 `resolve(expand_home())` 再校验并传同一绝对路径给扫描，与 `files.read` 对称；`files.read` 的 `lstat+realpath` 二次校验保留。
- codex connector：`collect_quota` 读失败 `warn`（路径+String(err)）、`JSON.parse` 失败 `debug`；`collect_sessions` 的 `list`/`read` 失败 `warn`、行级 `JSON.parse` 失败 `debug`；不记文件正文/Token。
- claude connector：拆 `read` 与 `JSON.parse` 两阶段，读失败 `warn`、解析失败 `debug`，带 `cred_path`，不泄露 `fake-token`/正文。
- 测试：`net-client.test.ts` 用 `vi.mock("node:os")+homedir_mock.dir` 指向 `mkdtemp` 隔离目录（ESM 下 `spyOn` 不可配置，同 `collector-local.test.ts` 模式），覆 `~/`/裸 `~`/`~\`/`~otheruser`/`..`/白名单外 symlink/`list` 对称；`codex/claude-connector.test.ts` 经 `run_connector` 真脚本断言 `warn/debug` 带路径且不含正文；`f001` 自调 warn 假证据已删，畸形行用例已补 `debug` 断言并用 `auth.json` 隔离 quota warn。
- 验证：`pnpm test` 317文件3881 passed；定向三文件65 passed；`typecheck`/`lint`/`build` 绿；`git diff --check` 绿。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-18 04:10 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t501_test_f001|important|已修|自调warn假证据，删除用例，真覆盖由run_connector提供|tests/integration/connector/net-client.test.ts:773-803删除|
|t501_test_f002|minor|已修|会话行debug无断言，已扩展畸形行用例断言debug带路径且不含正文|tests/integration/connector/codex-connector.test.ts:128-162|

Round 1 code 零 finding PASS（见 review_code.md）；Round 1 test 1 important+1 minor FAIL；Round 2 test 复核已修 PASS。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test` 317文件3881 passed（9 skipped）；定向 `net-client/codex/claude` 三文件65 passed；`pnpm typecheck`/`lint`/`build` 通过；`git diff --check` 绿
- 黑盒：`blackbox_verify` 无打包/托盘/真实Electron/live/SPA路径，`pnpm test` 即主黑盒；`pnpm build`（electron-vite+web）通过
- review：full；code Round1 PASS零finding；test Round1 FAIL（f001 important+f002 minor）→修复→Round2 PASS；`reviewed_scope` 对应最终内容
- AC 证据：见 `handoff.json`

### 结果摘要

- AC-001~AC-004 全落盘；遗留无；来源 p251 待 `pending.py archive` 闭环（由 task-run 调度阶段处理）。
