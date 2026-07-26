# Task spec

## 背景

2026-07-26 实测：CPA 实例（`a5f28d90`）management key 填错，服务端返回 `401 {"error":"invalid management key"}`。`src/main/core/scheduler/refresh-service.ts:243` 的重试循环对所有错误一律重试 3 次（每次刷新 3 个失败请求），高频刷新下持续打 401，最终被服务端封 IP：`403 {"error":"IP banned due to too many failed attempts. Try again in 29m59s"}`（日志 `%APPDATA%/OmniPanel/logs/app-2026-07-26.log` 18:09 时段）。key 错误属于配置问题，重试不可能成功，只会触发服务端风控。

## 范围

- 认证类错误（401、403、"invalid key"/"unauthorized"/"invalid_token" 等，复用并扩展 `is_auth_error`）在一次刷新内**立即判失败、不重试**，只发 1 次请求。
- 现有 `is_auth_error` 未覆盖 `403`（refresh-service.ts:54），需补上，并评估是否加入 "invalid management key" / "forbidden" 等变体。
- 网络/连接级错误（`is_connection_error`）与 5xx 保持现有 3 次重试语义不变。
- session 连接器的 auto re-login 流程（refresh-service.ts:349-371）行为不破坏：它本来就靠首次 auth error 触发，重登录成功后仍允许后续重试。
- 认证失败的实例在调度层的后续刷新退避策略（是否拉长间隔）由实现时评估，不过度设计；最小可接受是单次刷新内不重试。

## 非范围

- 不改 CPA/grok/kimi 三个实例当前的具体报错（key 错误、vault 无凭据属配置问题，由用户修复）。
- 不改 UI 展示逻辑。
- 不引入跨实例的全局限流器。

## 验收标准

- [ ] key 类认证错误（401/403/invalid key）单次刷新只发 1 次请求即判 failed，不再重试（单测断言 connector 调用次数为 1）。
- [ ] 网络错误、5xx 错误仍按现有语义重试 3 次（现有/新增单测覆盖）。
- [ ] session 连接器遇 auth error 时 auto re-login 仍触发，重登录成功后的重试不受影响（现有 `tests/integration/scheduler/refresh-service.test.ts` 相关用例全绿或按新语义更新）。
- [ ] `is_auth_error` 覆盖 403 及常见 key 无效响应变体，有对应单测（可落在 `tests/unit/scheduler/` 下）。

## 依赖与约束

- 前置：无（t153 已合入 main）。
- 约束：密钥规则不变——日志中不得出现密钥明文；错误分类只看错误消息/状态码，不读凭据内容。
