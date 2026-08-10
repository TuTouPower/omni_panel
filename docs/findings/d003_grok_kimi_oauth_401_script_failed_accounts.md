# d003 Grok/Kimi OAuth 401 在 script failed_accounts 路径上报（2026-07-31）

- 来源：s004
- 结论：Grok/Kimi script 连接器的 HTTP 401/403 不一定抛出到 refresh-service；connector 通过 `report_failed_account` 返回 `failed_accounts`，即时 OAuth 刷新兜底必须在该结果路径处理。
- 证据：`net-client` 生成 `HTTP <status>: request failed (<bytes> bytes)`；Grok connector 捕获请求错误后调用 `report_failed_account` 并返回空观测；refresh-service 先复制 failed account 的 stale 观测，再处理空结果。
- 影响：新增 OAuth 401 兜底时同时覆盖 `failed_accounts` 与抛错路径；仅修改 catch 中 `is_auth_error` 分支无法修复 Grok/Kimi 主路径。
- 现状：有效
