# Task spec

## 背景

t112 收尾遗留 f003/f004：

- `useKimiDeviceLogin`（src/renderer/hooks/useKimiDeviceLogin.ts，119 行）与 `useGrokDeviceLogin` 几乎逐字重复，仅 `window.usageboard.kimi` / `.grok` 命名空间不同。
- `kimi_oauth_manager.ts` 与 `grok_oauth_manager.ts` 低层 helper（`HttpPost`/`DeviceCodeStart`/`OAuthLoginResult`/`LoginStatus`/`RefreshResult` 接口、`is_token_response`/`is_error_response`/`form_encode`/`to_error`/`load_tokens`/`store_tokens`/`clear_tokens`/`is_terminal_grant_error`/`make_default_http_post` 等）重复 ~200 行，仅常量（URL/client_id/scope/设备头）与少部分逻辑（kimi 无 scope、加设备头、无 auto-refresh）不同。

## 范围

- 提取共享模块（按 review f003/f004 建议与最小抽象原则）：
    - `src/renderer/hooks/use-device-login.ts`：参数化 `window.usageboard.<namespace>` 的统一 device-login hook；grok/kimi 用薄封装（或直接传 namespace）。
    - `src/main/core/auth/oauth-device-code.ts`（或类似）：共享接口 + helper（`HttpPost`/`DeviceCodeStart`/`OAuthLoginResult`/`LoginStatus`/`RefreshResult`、token vault helpers、form 编码、error 分类、default http_post、auto-refresh 调度引擎）参数化为接收「config」（URL/client_id/scope/设备头注入/refresh body 构造）。
    - `grok_oauth_manager.ts` / `kimi_oauth_manager.ts` 改为基于共享模块的薄封装（注入各自 config + 设备头策略）。
- grok 行为不变（含 auto-refresh、token generation/mutation tail）；kimi 行为不变（无 auto-refresh 是 t112 既定偏离，本 task 保持）。

## 非范围

- 不改 IPC / preload / manifest / connector（仅 manager + hook 内部重构）。
- 不补 kimi 的 auto-refresh（t112 既定，单独决策）。
- 不动 vault / secrets-store。

## 验收标准

- [ ] grok oauth 单测（`tests/unit/auth/grok_oauth_manager.test.ts`）全绿，行为不变。
- [ ] kimi oauth 单测（`tests/unit/auth/kimi_oauth_manager.test.ts`）全绿，行为不变。
- [ ] `useGrokDeviceLogin`/`useKimiDeviceLogin` 单测（含 OAuthDeviceForm）全绿。
- [ ] 共享 helper 不再逐字重复（重复行显著下降）。
- [ ] `pnpm test` 全绿；`pnpm typecheck` 0 新增错误。

## 依赖与约束

- 前置：t112 已 done（grok + kimi 双实现稳定，是提取的真相对象）。
- 风险：grok oauth 是已上线稳定路径，重构需保证行为字节级一致（token rotation、auto-refresh 时序、mutation tail）；用既有 grok 测试做回归网。
