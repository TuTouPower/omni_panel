# Task plan

## 步骤与验证

1. 红灯：补 OAuth 添加账号回归测试，复现“登录写临时 id、创建正式 UUID、`config:saveSecrets` 静默跳过 OAuth 字段、首次刷新无 bearer” → 验证：测试在现状失败，且断言目标是正式 instance id 下存在 token。
2. 红灯：补 secret 白名单单元测试，要求 `auth.method === "oauth_device"` 时允许 `auth.secret_name`、`OAUTH_REFRESH_TOKEN`、`OAUTH_EXPIRES_AT`，普通连接器仍只允许既有 manifest secret 参数 → 验证：现状 Grok case 失败、既有 case 保持通过。
3. 绿灯：在现有 temp-login → real-instance 保存流程内完成最小修复；成功后清理 temp namespace，并确保 auto-refresh reconcile 读取正式实例 token → 验证：专项测试通过，重复保存/取消/失败路径无跨实例影响。
4. 诊断 billing 200：通过一次性脱敏诊断仅提取响应字段路径、数组形状、标量类型和必要枚举，禁止输出原值；将最小匿名结构固化为测试 fixture → 验证：fixture 不含 token、邮箱、账号/订阅 ID 或其他用户数据。
5. 红灯：针对真实响应语义补 Grok connector 测试；若字段改版，断言正确 used/limit/window/label；若明确无权益，断言精确 failed_account 错误且不产生 observation → 验证：现状解析或错误分类测试失败。
6. 绿灯：最小修改 `connectors/grok/connector.ts`，兼容已证实响应结构；保留 t039 零观测失败与历史保留规则 → 验证：Grok connector、refresh-service 回归测试通过。
7. 集成验证：本地可控桩跑完整“device login result → create instance → save secrets → billing request”链路，检查请求带脱敏 bearer 存在性、正式 instance id 一致及 auto-refresh 排程 → 验证：不得依赖日志打印 token。
8. 全量与黑盒：运行 `pnpm check`、`pnpm test`；按 `docs/guides/testing.md` 执行相关 live contract、`pnpm test:packaged`，真实应用新增 Grok 账号后立即刷新 → 验证：首次刷新不再 401；200 后状态与真实响应语义一致。
9. 收尾：更新累计 spec、specs index 及稳定跨模块契约 → 验证：无旧表述、重复定义、矛盾结论或失效引用。

## 风险与回退

- 风险：把 OAuth token 纳入通用白名单时扩大可写 secret 范围。缓解：仅从已校验 manifest `auth` 描述符派生固定键，禁止 renderer 自由提交任意键。
- 风险：创建账号中途失败留下正式空实例，或 temp token 清理过早导致恢复失败。缓解：保持现有先登录后创建流程，正式保存成功后再清 temp；失败路径测试覆盖事务顺序。
- 风险：Grok 413-byte 响应没有任何用量语义，无法通过解析产生 observation。处理：不伪造 0% 或额度；保留 failed/stale，输出明确“无可用套餐/用量数据”错误。
- 风险：响应 fixture 泄露账号数据。缓解：只保留字段结构与测试所需匿名数值，提交前检查 fixture 与 diff。
- 回退：OAuth 白名单、temp 清理及 Grok parser 均保持独立小改动；任一分支验证失败时回退该分支，不改变既有 refresh-service/t039 语义。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：补充 oauth_device 临时登录凭证迁移到正式 instance id 的跨模块契约，以及 auth 描述符参与 secret 白名单。
- `docs/blueprint/conventions.md`：若 Grok billing 响应契约发生变化，更新已验证字段语义；重申脱敏 fixture 规则。
- `docs/specs/connector-auth.md`：累积修正 temp instance → real instance token 保存、清理与自动刷新要求。
- `docs/specs/connector-direct.md`：累积记录 Grok 新响应结构或无权益错误语义。
