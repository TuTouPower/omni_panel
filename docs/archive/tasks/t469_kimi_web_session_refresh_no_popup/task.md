---
tid: "t469"
slug: "kimi_web_session_refresh_no_popup"
title: "修复 Kimi Web 会话刷新重复弹出登录窗口"
status: "done"
branch: "t469_kimi_web_session_refresh_no_popup"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "7aff2e1c4c6955e6e72c3c42ce5daaf65ac471d2"
depends_on: ""
conflicts_with: ""
note: "修复 wildcard cookie 静默刷新误判，并保留 Kimi Bearer/session/device 凭据；来源：2026-09-09 代码核查。"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 修复静默刷新对 `cookieNames: ["*"]` 的错误精确匹配，wildcard 路径改为读取持久化分区中的全部实际 Cookie；具体名称路径保持原有完整匹配。
- Kimi Web 静默刷新读取现有 JSON 会话，要求保留有效 authorization；只更新 cookie 字段并保留 authorization、session_id、device_id，旧纯 Cookie/缺 Bearer 值返回 false 触发既有交互式回退。
- 新增 auth IPC 单测覆盖 wildcard 成功、Kimi 凭据保留、缺 Bearer 不覆盖；相关单测与全量测试均通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-09 15:16 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：auth IPC 相关单测 17/17 通过；`pnpm test` 全量 287 个测试文件通过、1 个跳过，3573 个测试通过、9 个跳过；`pnpm typecheck`、变更文件 ESLint、Prettier 检查通过。
- 黑盒：按项目默认黑盒命令执行 `pnpm test`，通过。
- review：full 级 `review_code.md` 与 `review_test.md` Round 1 均 PASS，无 finding。
- AC 证据：见 `handoff.json`

### 结果摘要

- Kimi Web 会话刷新不再因 wildcard Cookie 配置误判而重复弹出登录窗口；Bearer 与设备会话字段在静默刷新时保留。
