---
tid: "t513"
slug: "opencode_muse_connectors_upgrade"
title: "OpenCode Go 与 Muse 连接器健壮性及动态特性"
status: "done"
branch: "t513_opencode_muse_connectors_upgrade"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "4bd77fa81393da8382018ab23107d570fa7deaf5"
depends_on: ""
conflicts_with: ""
note: "审阅采纳项: A8, A46-A48, A55-A57, A115, A124, A146 (原 D9), A148 (原 D11)"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

- OpenCode Go 升级：
    1. 401/403 会话失效显式抛错，触发主进程自动 session 重登机制（A8）。
    2. 数值安全：`meter_to_pct` 在非法或缺少 limit 时返回 `null` 并触发 `ctx.log.warn`，避免假 0%（A55/A56）。
    3. monthly 指标重置时间优先提取 `meters.month.resetsAt`，回退至 `endsAt`（A57）。
    4. 多组织采集与隔离：循环遍历用户所有组织，`account_id` 注入 `org_id` 区分，单 org 采集失败通过 `ctx.report_failed_account` 隔离（A148）。
    5. 组织查询 memo 缓存：利用宿主原型共享空间持有 1 小时 TTL 缓存，跨刷新周期规避重复 3 RTT（A115）。
- Muse 连接器升级：
    1. 动态提取 Action ID 与 Deployment ID，移除硬编码哈希，失效时抛出 `MUSE_ACTION_STALE` 且 401 明确触发重登（A146）。
    2. 输入校验：严格检查 `SESSION_COOKIE` 预防 CRLF 注入，限制最长 8KB（A48）。
    3. 流式解析与大响应防爆：`parse_rsc_subscription` 行级容错，超过 2MB 输出警告（A47/A124）。
    4. 缺失用量上报：`percentUsed` 非有效数值时通过 `ctx.report_failed_account` 上报异常，杜绝假 0%（A46）。

## Review 处置

### Round 1 (2026-09-25 14:15 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t513_code_f001|important|已修|Muse 移除了打印完整 HTML 页面的调试日志|connectors/muse/connector.ts:114|
|t513_code_f002|important|已修|Muse 动态提取页面 401/403 明确抛出以触发自动重登|connectors/muse/connector.ts:109|
|t513_code_f003|important|已修|OpenCode Go 缺少 limit 时补充 ctx.log.warn|connectors/opencode_go/connector.ts:70|
|t513_code_f004|important|已修|OpenCode Go 通过宿主原型空间实现 1h TTL 跨周期 memo 缓存|connectors/opencode_go/connector.ts:140|
|t513_code_f005|minor|已修|Muse actionId 正则补充上下文前缀约束|connectors/muse/connector.ts:85|
|t513_test_f001|important|已修|补充 OpenCode Go monthly resetsAt 字段映射测试断言|tests/integration/connector/opencode_go_connector.test.ts:132|
|t513_test_f002|minor|已修|Muse CRLF 注入测试补充 get_raw/post_raw 未被调用断言|tests/integration/connector/muse_connector.test.ts:164|

### Round 2 & Round 3 (2026-09-25 14:33 UTC+8)

Round 2 & Round 3 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（包含 vitest 330 个测试套件，4011 passed, 8 skipped, 0 failed）全部通过
- 黑盒：无（connector 协议单元与集成测试覆盖）
- review：Code Review PASS (Round 3), Test Review PASS (Round 2), overall=PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- OpenCode Go 与 Muse 连接器按决策清单全量升级完成，401 登录失效、限额除零假 0%、多 org 隔离与缓存、动态 ID 提取、CRLF 防护等 7 项 AC 全部落地并通过双盲审查。
