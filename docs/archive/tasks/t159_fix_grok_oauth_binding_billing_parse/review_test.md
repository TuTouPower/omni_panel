# Task review t159（reviewer_focus: 测试）

- task：`t159_fix_grok_oauth_binding_billing_parse`
- spec：`docs\tasks\t159_fix_grok_oauth_binding_billing_parse/spec.md`
- diff_anchor：`89bc31f9350241ad48039678bec1477691fc97bf`
- target：`git diff 89bc31f9350241ad48039678bec1477691fc97bf`
- round：1
- reviewed_at：2026-07-28 13:06 UTC+8

## Findings

### t159_test_f001 - OAuth 正式实例链路未在真实边界回归

- 严重度：important
- 位置：`tests/unit/renderer/hooks/use_connector_catalog.test.ts:62-86`
- 问题：该测试将 `save_plugin_settings` 整体 mock 掉，只验证调用参数及 mock 的调用顺序；`tests/unit/config/secret_param_keys.test.ts` 也仅验证独立白名单集合。因此测试没有覆盖本 task 的关键跨层链路：正式 instance id 经 `config:saveSecrets` 被白名单接受并写入 vault、`config:save` 触发正式 id 的自动刷新排程，随后首次 refresh 从该 id 注入 bearer token。若 main-process 白名单接线、IPC 过滤、保存顺序或 `onConfigSaved` 调度回归，现有测试仍会通过，而原始 `no auth context` 故障会重现。
- 建议：补一条跨 renderer/main 边界的回归测试，驱动 device-login 成功后的创建与保存，使用真实 `handleConfigSaveSecrets`/vault 和配置保存回调；断言三个 OAuth 字段仅存在于正式 instance 命名空间、临时命名空间已清理、正式 id 被传入 auto-refresh，并验证该 id 的首次 refresh 请求携带 bearer token。

## 结论

- 本轮新发现：1 条
- 总体判断：新增单元测试覆盖参数传递、白名单推导和无权益响应，但未覆盖导致本 task 401 的正式实例持久化、调度与首次采集完整链路。

verdict: FAIL

## Round 2 (2026-07-28 13:37 UTC+8)

## Findings

- 无。

## 结论

- 前轮 finding 复核：`t159_test_f001` 已修。`tests/integration/connector/grok_oauth_account_lifecycle.test.ts:92-211` 使用真实 config IPC、file vault、secret 白名单与 refresh service；验证三个 OAuth 字段写入正式 instance id、临时命名空间清空、正式 id 进入调度回调，并以本地 HTTP 服务断言首次刷新携带正式 token 的 bearer header。`tests/unit/renderer/hooks/use_connector_catalog.test.ts:62-148` 同时验证 renderer 保存先于临时 namespace 清理、保存失败不清理、清理失败保留正式实例及 Kimi 命名空间隔离。
- 本轮新发现：0 条。
- 总体判断：指定 diff 的新增和修改测试覆盖验收链路；危险模式扫描未发现弱化断言、跳过、静默错误或以 mock 替代被测行为的情形。

verdict: PASS

## Round 3 (2026-07-28 05:52 UTC+8)

## Findings

- 无。

## 结论

- 前轮 finding 复核：`t159_test_f001` 维持已修。`tests/integration/connector/grok_oauth_account_lifecycle.test.ts:92-212` 仍以真实 config IPC、file vault、secret 白名单与 refresh service 覆盖正式实例保存、临时命名空间清理、调度及 bearer 注入。
- `t159_code_f004` 修复核验：`tests/unit/renderer/hooks/use_connector_catalog.test.ts:116-128` 在 renderer-to-preload OAuth 边界令 `grok.logout` 拒绝，断言 `create_instance_and_save` 拒绝该错误、正式实例保存已发生且未静默记录日志；对应 `src/renderer/hooks/use_connector_catalog.ts:70-80` 直接 await 清理调用，失败不会再被吞没。该测试可信覆盖修复行为。
- 危险模式扫描：新增及改动测试未见断言弱化、跳过/独占、静默错误、被测逻辑 mock 或以 mock 替代验收交互；packaged smoke 的动态 CDP 端口改动保留原有用户可观察断言。
- 本轮新发现：0 条。
- 执行：`pnpm exec vitest run tests/unit/renderer/hooks/use_connector_catalog.test.ts tests/integration/connector/grok_oauth_account_lifecycle.test.ts tests/integration/connector/grok_connector.test.ts`，15 项通过。
- 总体判断：`t159_code_f004` 已有可信回归测试，指定 diff 的测试覆盖与测试可信度满足验收。

verdict: PASS
