# Task spec

## 背景

2026-07-28 10:32（UTC+8）日志确认 Grok 删除账号后重新添加存在两段故障：

1. 首次 device-code 登录成功时 token 写入临时实例 `grok-1785205934131-61sec0rq`，随后 `config:createInstance` 才创建正式实例 `cc9934d9-5ebf-42f6-ad95-f6c4c25279f7`。首次采集从正式实例读取 `OAUTH_TOKEN`，上游返回 `401 ... reason=no auth context`。
2. 对正式实例再次登录后，`auto_refresh` 已排程，连续六次 billing 请求均返回 HTTP 200（body 413 bytes），但 Grok connector 报 `billing response has no usable usage fields`，账号仍显示采集失败。

已确认实现偏差：

- `OAuthDeviceForm` 按现有契约在临时 instance id 下完成登录，再把 `OAUTH_TOKEN` / `OAUTH_REFRESH_TOKEN` / `OAUTH_EXPIRES_AT` 保存到正式实例。
- `buildSecretParamKeys` 当前只收集 `manifest.parameters[].type === "secret"`；Grok `parameters` 为空，导致 `config:saveSecrets` 对上述 OAuth 字段静默跳过，正式实例无法获得 token。
- t039 已规定 billing 200 但零有效 usage 字段必须报失败；本 task 不回退该不变量，而是基于脱敏真实响应结构判断 Grok API 是否变更字段，或是否明确表示账号无可用用量权益。

## 范围

- 修复 `oauth_device` 添加账号流程，使临时实例取得的 OAuth token pair 可靠迁移/保存到 `config:createInstance` 返回的正式 instance id。
- 让 secret 保存白名单从 manifest `auth` 描述符识别 OAuth 主 secret 与必要附加字段，不要求把 OAuth token 重复声明为普通 `parameters`。
- 成功迁移后清理临时 instance id 下的 OAuth token，避免 vault 残留；失败或取消流程不得覆盖其他实例凭证。
- 补添加 Grok 账号的回归测试，覆盖登录成功、正式实例保存、首次采集 bearer 注入与自动刷新排程。
- 安全提取当前 Grok billing HTTP 200 响应的字段路径与类型（值脱敏），固化最小 fixture：
    - 若响应包含新的有效用量语义，更新 `connectors/grok/connector.ts` 解析并产出 observations。
    - 若响应明确表示无套餐/无用量权益，保留 failed/stale 语义，但错误信息须明确区分“账号无可用用量数据”与认证失败/未知响应格式。
- 补 Grok connector 新响应形状或无权益形状的集成测试。

## 非范围

- 不改变 OAuth provider、client id、scope、device-code 协议或 refresh token rotation 规则。
- 不回退 t039“零有效观测不得标 ready 或清空历史”规则。
- 不记录 access token、refresh token、Authorization header 或完整 billing 响应值。
- 不重构通用账号弹窗、refresh-service 或整个 vault 架构。
- 不兼容未在真实响应或官方契约中出现的猜测字段。

## 验收标准

- [ ] 新增 Grok 账号完成一次 device-code 登录后，三个 OAuth 字段存在于正式 instance id 命名空间，首次采集不再因 `no auth context` 返回 401。
- [ ] `oauth_device` secret 白名单由 manifest auth 描述符推导；非 OAuth 连接器现有 secret 白名单行为不变。
- [ ] token 迁移成功后临时 instance id 不残留 OAuth token；取消、失败及重复保存不影响其他实例。
- [ ] 正式 Grok 实例登录成功后自动刷新排程使用同一 instance id。
- [ ] 当前 billing HTTP 200 响应结构形成值脱敏 fixture；存在有效用量语义时 connector 至少产出一条正确 observation。
- [ ] 响应明确无套餐/无用量权益时保持 failed/stale，不清空历史，错误文案不再误导为认证失败。
- [ ] 回归测试覆盖临时到正式实例 token 链路、secret 白名单、Grok 响应解析及 t039 零观测不变量。
- [ ] `pnpm check`、`pnpm test`、涉及的 live contract 与 packaged smoke 通过；真实 Grok 账号完成添加后首次刷新结果与响应语义一致。

## 依赖与约束

- 依赖当前可登录的 Grok 账号执行一次授权验证，或提供 413-byte billing 响应的值脱敏结构样本。
- vault 键必须继续使用 `keyFor(instance_id, name)`；禁止内联拼接。
- 日志与 fixture 必须移除 token、账号标识、邮箱、订阅 ID 等敏感值，仅保留字段名、类型及必要枚举语义。
- 时间与诊断证据来自 `C:\Users\TestUser\AppData\Roaming\OmniPanel\logs\app-2026-07-28.log`，日志不纳入仓库。
