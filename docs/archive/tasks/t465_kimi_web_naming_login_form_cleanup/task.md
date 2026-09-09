---
tid: "t465"
slug: "kimi_web_naming_login_form_cleanup"
title: "Kimi Web 名称与网页登录表单精简"
status: "done"
branch: "t465_kimi_web_naming_login_form_cleanup"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "d4f32d01021f100dd52b6386ad8a1793cba84e96"
depends_on: ""
conflicts_with: ""
note: "将 Kimi 网页版统一显示为 Kimi Web；网页登录表单只保留必要的网页登录操作，移除 Cookie 字符串、网页登录令牌、接口地址(login)等手动字段。"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 2026-09-08：将 Kimi Web 用户可见名称统一为 `Kimi Web`；Kimi Web 登录表单仅保留备注、网页登录按钮和错误提示，隐藏 Cookie 手填、网页登录令牌、接口地址及 login 地址；其它网页登录 provider 保持原表单能力。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-08 16:00 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：相关 renderer 测试 50 passed；全量 `pnpm test` 287 files passed、1 skipped，3563 passed、9 skipped；`pnpm typecheck`、`pnpm lint`、`pnpm build`、`git diff --check` 通过。
- 黑盒：组件测试触达添加账号/编辑账号可观察表单；真实 Kimi 登录协议不变，沿用 t464 live 验证。
- review：single 级 Round 1 general PASS，零 finding。
- AC 证据：见 `handoff.json`

### 结果摘要

- Kimi Web 名称和登录表单已完成精简；其它 provider 的 Cookie 手动回退入口保持不变。
