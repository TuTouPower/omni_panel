# Task plan

## 步骤与验证

1. 新建 `kimi_oauth_manager.ts` + 单测 → 验证：`tests/unit/auth/kimi_oauth_manager.test.ts` 红→绿。
2. 新建 `kimi_auth_ipc.ts` + preload 暴露 + `KimiLoginSection.tsx` → 验证：`pnpm typecheck`。
3. 改 `connectors/kimi/manifest.json` + `connector.ts` token 读取顺序 → 验证：`tests/unit/connector/kimi-connector.test.ts` 红→绿（OAuth token 与 API Key 两路径）。
4. `pnpm test` 全绿 → 验证：CI 命令。

## 风险与回退

- 风险：Kimi 服务端对 `X-Msh-*` 设备头有校验，缺失或格式错误导致 device authorization 失败。 → 回退：严格按 `KimiOAuthService.swift:104-131` 的 header 构造；若仍失败，先仅支持 API Key，OAuth 标记为 experimental。
- 风险：`~/.kimi-code/device_id` 在 Windows 路径解析差异。 → 回退：用 `os.homedir()` 拼接，单测覆盖 win/wsl 路径。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：「认证」小节补一句「kimi 支持 device code OAuth，与 API Key 并存，token 存 vault 不共享 CLI 凭证」。
