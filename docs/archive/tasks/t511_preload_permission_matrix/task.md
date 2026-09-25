---
tid: "t511"
slug: "preload_permission_matrix"
title: "Preload 路由矩阵工厂化与窗口能力分权"
status: "done"
branch: "t511_preload_permission_matrix"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "17f960cdeeb30c9b6ab447ce31b2033f58b3e4e2"
depends_on: ""
conflicts_with: ""
note: "审阅采纳项: A95, A140, A144 (原 D7)"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 消除 session_history 三栈复制，通过与 disabled 存根展开组合消除 24 行冗余。
2. 封装 filter_popup_config_save 纯函数与白名单机制，限制 Popup 窗口仅允许持久化 UI 偏好字段，阻断敏感配置越权写操作。
3. 实现 Grok Bot OAuth 窗口分权：settings 窗口暴露全功能操作，其他低权窗口注入 rejected 存根。
4. 抽象数据驱动 Preload API 装配工厂 create_preload_api 与 create_preload_config，消除了 144 行 switch-case 分支重复。
5. 补充针对各窗口 Preload 暴露能力矩阵与 Popup config.save 端到端调用的完整单元测试。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-25 11:53 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t511_test_f001|important|已修|tests/unit/preload/oauth_api.test.ts 补充 create_grok_bot_oauth_apis 真实测试|tests/unit/preload/oauth_api.test.ts:48|
|t511_test_f002|important|已修|新增 preload_permission_matrix.test.ts 测试各窗口能力矩阵暴露面|tests/unit/preload/preload_permission_matrix.test.ts:1|
|t511_test_f003|minor|已修|测试调用生产工厂 create_preload_config 验证白名单过滤端到端生效|tests/unit/preload/preload_permission_matrix.test.ts:200|

### Round 2 (2026-09-25 12:15 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t511_test_f004|important|已修|将 config 组装抽为生产工厂 create_preload_config，测试直接驱动生产实现|src/preload/api_factory.ts:28|

### Round 3 (2026-09-25 12:28 UTC+8)

Round 3 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 与 `pnpm test` 全部通过（331 套件，3999 用例通过，0 失败）
- 黑盒：单元与集成测试全量验证通过
- review：Round 3 PASS（`review_code.md` PASS，`review_test.md` PASS，check_review_status overall=PASS）
- AC 证据：见 `handoff.json`

### 结果摘要

- 实现了 Preload 路由矩阵数据驱动工厂化（`create_preload_api`），彻底消除了 144 行 switch-case 分支与三栈代码复制。
- 实现了低权窗口针对 Grok Bot 与 Session 操作的最小权限分权控制。
- 实现了 Popup 窗口 `config.save` 字段白名单过滤保护。
- 补齐了全窗口权限矩阵与生产能力工厂的单元测试。
