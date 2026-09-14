# Task review t473（reviewer_focus: 代码）

- task：`t473_local_api_secrets_auth`
- spec：`docs/tasks/t473_local_api_secrets_auth/spec.md`
- diff_anchor：`a064a7a06f0c8f1f98dfa624fa8f16436de005e2`
- target：`git -C '/workspace/scratch/816ee2fd705d/omni_panel_t473' diff a064a7a06f0c8f1f98dfa624fa8f16436de005e2`
- round：1
- reviewed_at：2026-09-14 08:00 UTC

## Findings

reviewed_scope: 578117479a56791e

本轮零 finding。

## 结论

- `CONFIG_GET_SECRETS` 与 `CONFIG_SAVE_SECRETS` 仍以 `assert_valid_sender` 作为第一道 IPC 进程隔离，仅删除已废止的 `#setting` route-hash 限制。
- 合法 renderer 的非设置路由成功路径和非法 sender 拒绝路径均有单测；没有新增 token、bearer 或 `check_auth` 分支。
- LocalAPI 用户业务端点的既有免认证顺序保持不变，`/v1/ingest` 仍位于 Bearer token 门禁之后。
- 输入校验、`createLoggedIpcHandler` 的参数/结果脱敏和破坏性操作的既有确认/可观察行为未被改动。

### AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-006|re_verified|LocalAPI 无 Authorization 的 config GET/POST 与 secrets GET/POST 回归已补，duplicate/create/export/import 既有测试均不带 Authorization；桌面 secret IPC 合法 renderer 回归通过。LocalAPI 集成执行被 native binding setup 阻塞。|
|AC-007|re_verified|LocalAPI handler 顺序与桌面共享 handler 盘点保持一致；平台 API 文档记录相同业务权限边界。|
|AC-008|re_verified|`#usage` URL 调用两个 secret IPC handler 均成功，原 route-hash guard 已删除。|
|AC-009|re_verified|`about:blank` sender 调用两个 secret IPC handler 均被 `assert_valid_sender` 拒绝。|
|AC-010|re_verified|既有 schema/错误分类与 `redact_config_raw`/IPC trace 脱敏保留；定向 IPC 回归通过。|
|AC-011|re_verified|既有 import endpoint override 拒绝、control action 与实例操作保护测试未改动；文档同步确认显式用户动作/可观察确认。|
|AC-012|re_verified|diff 只移除 `assert_setting_route`，未新增认证逻辑；`/v1/ingest` 的 `check_auth` 路径保持原状。|

coverage = 7 / 7

verdict: PASS
