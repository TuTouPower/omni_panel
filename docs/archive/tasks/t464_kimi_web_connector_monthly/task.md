---
tid: "t464"
slug: "kimi_web_connector_monthly"
title: "Kimi 网页版连接器（web 登录 + 月用量）"
status: "done"
branch: "t464_kimi_web_connector_monthly"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "a81217026540f77624123a7f7c5e606804fbc3da"
depends_on: "t463"
conflicts_with: ""
note: "新增 kimi_web 连接器（session/web_login），Cookie 查 quota，新增月用量指标与独立入口；依赖 spike 结论"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 2026-09-08：完成 kimi_web session/web_login manifest、ConnectRPC quota 连接器与 5h/7d/月指标解析；网页登录捕获并保存 Kimi Bearer/session/device 请求头，既有 Kimi 设备码通路未改。新增失效 Bearer 可见报错与脱敏 fixture 回归测试。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-08 14:00 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-002 的真实账号 `[deploy]` 验证待用户在测试实例执行）
- 测试：`pnpm test` 287 个文件通过、1 个跳过；3561 个用例通过、9 个跳过；新增 kimi_web/manifest 回归 19 个相关断言；`pnpm typecheck`、`pnpm lint`、`pnpm build`、`git diff --check` 通过。
- 黑盒：本 task 无可安全自动化的真实 Kimi 凭据；t463 已完成真实网页登录/接口重放，本 task 以脱敏 fixture 解析和失效错误可见性验证替代；AC-002 真账号需用户在测试实例点选“添加 Kimi 网页版”后确认月指标同屏。
- review：full 级 Round 1：code PASS、test PASS，零 finding。
- AC 证据：见 `handoff.json`

### 结果摘要

- 新增 `connectors/kimi_web`，注册 `kimi_web` provider 与“Kimi 网页版”独立入口；会话凭据只进入 vault，connector 日志与 fixture 不含真凭据。
