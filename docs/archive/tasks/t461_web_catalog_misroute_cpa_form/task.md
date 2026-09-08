---
tid: "t461"
slug: "web_catalog_misroute_cpa_form"
title: "Web 面板添加账号 catalog 误路由到 CPA 表单"
status: "done"
branch: "t461_web_catalog_misroute_cpa_form"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "880fd64a3d52af5676dd9e35d24d3d8d9058a0e8"
depends_on: ""
conflicts_with: ""
note: "p225：GET /v1/catalog 无服务端路由，空 catalog 回退命中 CPA 网关实例；kimi/claude/codex/antigravity 均误渲染 CpaMgmtForm"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- TDD 先红后绿：server `/v1/catalog` 测试与 dialog 空 catalog 两用例先失败（路由缺失 → 401；kimi/claude 误渲染 CPA 表单），实现后转绿。
- worktree 内 `node_modules/electron` 缺 dist 二进制 + path.txt（pnpm 离线安装未下载），`server.test.ts` collect 失败；从主仓同版本复制 dist 与 path.txt 解决，未动代码。
- `send_result` 成功时直接回 data（无 ok 信封），测试断言据此修正（测试问题，非实现问题）。
- 黑盒超出单元/集成：xvfb 下起真实 `serve --foreground` 打 `GET /v1/catalog`，16 条目、kimi oauth_device、CPA 四 provider，quit 退出后恢复 Node ABI 并清理临时目录。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-09 04:50 UTC+8)

Round 1 零 finding（`review_general.md`，verdict: PASS）。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test` 286 passed 文件 + build 产物测试 7 passed（worktree 初建时 `build_code_split` 因无 out/ 按设计跳过，`pnpm build` 后补跑通过）；触及文件 `server.test.ts`（99）与 `add_account_dialog.test.tsx`（27）全绿；typecheck/lint/prettier/`git diff --check` 全过
- 黑盒：`pnpm test:e2e:web` 96/96；xvfb 真实 serve `GET /v1/catalog` 200（16 条目/kimi oauth_device）
- review：single 级 `review_general.md` Round 1 PASS，零 finding
- AC 证据：见 `handoff.json`

### 结果摘要

- t461 闭环 p225（已归档 `docs/archive/pending/p225_web_add_kimi_misroutes_to_cpa_form.md`，fix-ref t461）。
- 遗留：无（spec 有意不测的 Web e2e mock 补 `/v1/catalog` 为既定 follow-up 方向，未建条目）。
