---
tid: "t485"
slug: "dev_panel_git_scanner_invalid_git_tolerance"
title: "开发面板 git-scanner 异常容错与缓存目录忽略"
status: "done"
branch: "t485_dev_panel_git_scanner_invalid_git_tolerance"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "28048e03c560bde0e57dc75423b52b47e6f1f549"
depends_on: ""
conflicts_with: ""
note: "来源 p229：过滤 0 字节伪 .git 与跨机孤立 worktree，跳过缓存目录"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 在 `tests/unit/main/dev-panel-git-scanner.test.ts` 编写针对 0 字节 `.git` 空文件、断链 worktree 以及 SKIP_DIRECTORIES 的失败测试，精准复现用户现场的 `fatal: invalid gitfile format` 与 `fatal: not a git repository`。
2. 在 `src/main/core/dev-panel/git-scanner.ts` 中扩展 `SKIP_DIRECTORIES` 增加 `.scratch`、`.claude`、`uv_cache`、`.turbo`、`.next`。
3. 在 `discover_repositories` 增加 `is_valid_git_entry` 校验，排除空 `.git` 文件与指向不存在路径的损坏 worktree。
4. 在 `scan_git_roots` 的 `exec_file` 错误捕获中增加 `is_ignorable_git_error` 降级，避免非 git 仓库异常导致开发面板弹出报错弹窗。
5. 运行单测全部转绿，运行 `pnpm typecheck` 与 `eslint` 无警告无报错。

## Review 处置

Round 1 零 finding

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`vitest run tests/unit/main/dev-panel-git-scanner.test.ts`（7/7 PASS）
- 黑盒：单元测试覆盖
- review：Round 1 general PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 解决了开发面板 git-scanner 扫描到 0 字节伪 `.git` 文件与跨机损坏 worktree 时崩溃弹框的问题，补充了缓存与工具链目录跳过。
