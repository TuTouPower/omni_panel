---
tid: "t512"
slug: "grok_bot_auth_lifecycle"
title: "Grok Bot 认证链路全流程加固与 Token 轮换"
status: "done"
branch: "t512_grok_bot_auth_lifecycle"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "d674991949f363348a47745d91960b4c0a98903b"
depends_on: "t510,t511"
conflicts_with: ""
note: "审阅采纳项: A5, A6, A7, A12, A13, A21-A28, A49-A53, A127, A149 (原 D12)"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. PKCE verifier 移入主进程内存 pending_verifiers 管理，login_start 仅暴露 uuid 与 login_id，杜绝前端明文流转。
2. grok_bot_oauth_manager 并发控制：同一 instance 并发 poll 安全取消前次轮询；refresh_now 实现基于 instance_id 的 Promise 去重与网络异常单次自动重试；两步写入实现原子补偿回滚；拉起浏览器失败显式抛出 BROWSER_OPEN_FAILED。
3. 实现后台定时换票 schedule_refresh，并在启动与登录成功后自动挂载，换票失败触发 on_token_expired 告警。
4. connector 修复：401/403 明确抛出错误以联动调度器换票；JWT 解析增加段数与异常日志；account_id 增加非空校验并支持 token 散列稳定派生；checksum 计算改用 BigInt 移位杜绝 32 位溢出。
5. GrokBotPkceForm 修复：增加 status_ref 状态防重入，组件卸载自动取消在途轮询，账号名称 trim 规范化防空白穿透。
6. IPC 层完善 timeout_ms 在 10s~600s 范围校验与 GrokBotErrorCode 判别联合错误码映射。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-25 13:10 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t512_code_f001|important|已修|生产启动与登录后接入 schedule_refresh，失败触发 on_token_expired 告警|src/main/core/auth/grok_bot_oauth_manager.ts:417|
|t512_code_f002|important|已修|account_id 增加 raw_sub 非空判定，空白时基于 token 稳定哈希派生|connectors/grok_bot/connector.ts:126|
|t512_code_f003|minor|已修|IPC handle_grok_bot_login_start 捕获并映射 BROWSER_OPEN_FAILED|src/main/ipc/grok_bot_auth_ipc.ts:27|
|t512_code_f004|minor|已修|表单 account_name 统一采用非空别名回退交互，保持全应用一致体验|src/renderer/components/forms/GrokBotPkceForm.tsx:68|
|t512_test_f001|minor|已修|spec.md 对齐 AC-008 去除首尾空格后回退默认值表述|docs/tasks/t512_grok_bot_auth_lifecycle/spec.md:53|
|t512_test_f002|minor|已修|manager 与 IPC 层完整覆盖 BROWSER_OPEN_FAILED 测试|tests/unit/ipc/grok_bot_auth_ipc.test.ts:80|

### Round 2 (2026-09-25 13:30 UTC+8)

Round 2 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 与 `pnpm test` 全部通过（331 套件，4012 用例通过，0 失败）
- 黑盒：单元与集成测试全量验证通过
- review：Round 2 PASS（`review_code.md` PASS，`review_test.md` PASS，check_review_status overall=PASS）
- AC 证据：见 `handoff.json`

### 结果摘要

- 实现了 PKCE code verifier 主进程保密管理与内存映射。
- 实现了并发登录轮询互斥隔离与刷新 Promise 去重。
- 实现了连接器 401 抛错触发即时换票与 JWT 解析日志/BigInt checksum 修复。
- 实现了 Vault 两步写入原子补偿与 logout 并行凭据清理。
- 实现了后台定时刷新 schedule_refresh 与失效告警通知机制。
- 修复了 GrokBotPkceForm 组件防重入、卸载自动取消与账号名首尾空格裁剪。
