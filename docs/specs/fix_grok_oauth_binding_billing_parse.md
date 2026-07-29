# fix_grok_oauth_binding_billing_parse

> 验证方式：API + Desktop。固化自 t159。

Grok 新增账号的 device-code OAuth 凭证先位于临时 instance namespace；正式实例保存 OAuth 三键成功后才可清理临时 namespace。若清理失败，调用必须失败，不能把残留临时 token 的迁移报告为成功。

OAuth secret 白名单从 manifest `auth` 描述符推导主 token，并允许 refresh token 与 expiry；非 OAuth 行为保持 fail-closed。

Grok credits 响应遵循 proto3 JSON：`creditUsagePercent=0` 可被省略。字段省略且 `currentPeriod` 完整有效时按 0% 解析；真正缺少有效周期与有限百分比的响应继续 failed/stale。deprecated `monthlyLimit.val` / `used.val` 是 USD cents，不得映射 SuperGrok weekly usage。详细语义由 [`fix_grok_zero_percent_omission.md`](fix_grok_zero_percent_omission.md) 固化。

详细契约：

- OAuth 流程与白名单：[`connector-auth.md`](connector-auth.md)
- Grok billing 语义：[`connector-direct.md`](connector-direct.md)
- 跨模块凭证边界：[`../blueprint/architecture.md`](../blueprint/architecture.md)
- 测试命令与打包 smoke：[`../guides/testing.md`](../guides/testing.md)
