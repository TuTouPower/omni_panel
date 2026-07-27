# 主面板重新登录按 instanceId 路由

## 需求

主面板报 401 时，「重新登录」入口必须精确定位到报错 instance 对应的账号编辑弹窗，而不是按 provider 匹配第一个 connector 或静默丢掉后续失败实例。

## 行为

- 同一 provider 存在多个 instance 时（如两条 GroK 账号），失败实例的 `instanceId` 必须能从错误数据中追溯到 renderer 层。
- `provider_card_states.auth` 分支的「重新登录」入口透传 `(provider, instanceId)` 到 caller；当 caller 不存在时，回退 `settings.open({ instanceId })`。
- `ProviderAccountRow` 在 error 存在时显示行级 `重新登录` 按钮（`row-relogin-btn`），回调 `(sourceInstanceId, accountId, provider)`。
- `ProviderAccountList` 把 `onReLogin(sourceInstanceId, accountId, group.provider)` 透传给每个 row，不再丢弃。

## 数据契约

- `AccountError`（`src/renderer/lib/provider-usage.ts`）增加字段 `sourceInstanceId: string`、`accountId: string`。
- `ProviderError`（`src/renderer/components/ProviderOverview.tsx`）增加字段 `instanceIds: string[]`：同 provider 下所有失败 connector 的 instanceId 列表，供 overview re-login 兜底 + per-row re-login 路由参考。
- `use_popup_derived.providerErrors` 改为按 provider 分桶但每个 value 都带 `instanceIds`，不允许后续失败 instance 被静默覆盖。

## 调用契约

- `settings.open({ instanceId })` 已是 `SettingsOpenContext` 支持的字段（`src/shared/types/ipc.ts:299-303`）；`SettingsView.open_settings_account_dialog` 的 instanceId 优先分支（`src/renderer/views/SettingsView.tsx:60-70`）已存在；provider 退化分支保留作 fallback。
- `onReLogin` 签名按调用层级不同：
    - `PopupView.handle_re_login(provider: string, instanceId: string)`：直接 `settings.open({ instanceId })`，不再做 `activeProviders.includes` 模糊匹配。
    - `ProviderAccountList` 的 `onReLogin(sourceInstanceId, accountId, provider)`。
    - `ProviderAccountRow` 的 `onReLogin(sourceInstanceId, accountId, provider)`。

## 边界与不变量

- 渲染进程永远不见密钥明文（沿用 vault 隔离）；instanceId 是非敏感字符串。
- `instanceId` 字符串格式不可信——`find` 用严格相等匹配，对任意字符串（含老版本 `grok-{timestamp}-{random}`）都正确。
- 同 provider 多 instance 都失败时，overview banner re-login 路由到**第一个**失败 instanceId（向后兼容老 UX）；行级 re-login 覆盖其余。
- 渲染层不读凭据内容，只依赖 `ConnectorInfo.snapshot.status === "failed"` + `error`。

## 关联 task

- t158：bug 报告与修复。

## 验证

- 单测：`use_popup_derived.providerErrors` 多 instance 不压扁、`buildAccountErrors` 含 `sourceInstanceId`、`onReLogin(provider, instanceId)` 签名透传、行级按钮渲染。
- 集成测试（`tests/unit/renderer/views/popup_view.test.tsx`）：单 / 多 instance 场景下 settings.open 的参数断言。
- 视觉：行级按钮样式（`row-relogin-btn`）与 overview banner 的 `cs-action` 一致。
