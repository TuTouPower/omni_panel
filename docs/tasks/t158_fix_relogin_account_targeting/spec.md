# Task spec

## 背景

2026-07-27 用户实测：**两个 Grok 实例并存**（一个旧 UUID `cd90d980-a645-45b3-8ba9-77c6d75175ce`，一个新 `grok-{timestamp}-{random}`）。新实例登录成功，旧实例持续 401。

主面板点 overview 卡片上的「重新登录」按钮时，根本打不开旧 401 实例的编辑弹窗，而是错开另一个账号或直接走不通——导致持续刷 401。

根因调研后定位 4 个独立落点：

1. **`PopupView.handle_re_login`**（`src/renderer/views/PopupView.tsx:436-440`）：签名只接 `provider`，用 `plugins.find(c => c.activeProviders.includes(provider))` 拿**第一个**命中该 provider 的 connector，跳过实际报 401 的实例。
2. **`use_popup_derived.providerErrors`**（`src/renderer/hooks/use_popup_derived.ts:82-92`）：Map 按 provider 分桶，先到先得。多 Grok 实例都失败时，overview 卡片只显示一条 error 横幅，并丢掉后续失败实例的 `instanceId`。
3. **`ProviderAccountList` 显式丢弃 `onReLogin`**（`src/renderer/components/ProviderAccountList.tsx:43, 55`）：参数解构改名 `_onReLogin` 后 `void` 掉，账号行永远收不到。
4. **`ProviderAccountRow` 没有 re-login 按钮**（`src/renderer/components/ProviderAccountRow.tsx:113-117`）：t027 当时设计只 badge 不展开，没留入口。

配套 type 缺失：`AccountError`（`src/renderer/lib/provider-usage.ts:369-373`）和 `ProviderError`（`src/renderer/components/ProviderOverview.tsx:11-14`）都没有 `instanceId` 字段，即便 UI 想透传也拿不出来。

数据链路核实：从 `refresh-service.ts` → `runtimeStore.updateState(instanceId, ...)` → `ConnectorInfo.instanceId` → `provider_card_states` / `ProviderAccountRow` 一路，instanceId 都是齐全的；唯一断点就是「error 渲染层」主动丢了。

## 范围

- **错误数据结构补 instanceId**：`AccountError` 新增 `sourceInstanceId` 字段；新增一个 provider-level 错误结构 `ProviderError` 含 `instanceIds: string[]`（或等价结构），让 UI 能定位具体 instance。
- **`use_popup_derived.providerErrors` 不再压扁**：按 instanceId 分桶（`Map<instanceId, { provider, displayName, error }>`），由消费者按需聚合展示。多 instance 失败的 provider 让 UI 显示「N 个账号凭证失效」并在 group 展开时由账号行级 badge 承担。
- **`onReLogin` 类型升级到 account/instance 级别**：从 `provider_card_states.tsx` → `ProviderCardState` → `ProviderOverview` / `ProviderCard` → `PopupView` → `settings.open({ instanceId })` 一路，把签名从 `(provider: string) => void` 改为接受 `instanceId: string`（可保留 provider 参数给回退用）。
- **`PopupView.handle_re_login` 接受 instanceId**：直接 `window.usageboard.settings.open({ instanceId })`，不再做 `activeProviders.includes` 模糊匹配。
- **`ProviderAccountList` 不再丢弃 `onReLogin`**：透传给 `ProviderAccountRow`。
- **`ProviderAccountRow` 增加 re-login 入口**：在 error badge 旁加一个小「重新登录」按钮 / 链接；当 `error` 非空且 `sourceInstanceId` 可用时显示。`isAuth` 走真 `is_auth_error(error)`（复用 `provider_card_states.tsx` 的 `is_auth_error`，可提升为共享 helper）。
- **测试**：核心数据/纯函数单测先行红→绿（`use_popup_derived` 行为、`buildAccountErrors` 输出、`apply_account_labels`/hidden 等边界不动）；UI 集成用现有 e2e fixture 加最小覆盖。

## 非范围

- 不改 `SettingsView.open_settings_account_dialog` 的 provider 退化分支（line 72-84）——该退化仍保留作 fallback；本 task 只让主流程不再依赖它。
- 不改 connector 端（`connectors/grok/connector.ts:24` 等硬编码 `ACCOUNT_ID = "grok"` 的语义错位）——后续独立 task 处理。
- 不动 `apply_account_overrides.hidden` 的 hidden 失效 bug（独立 bug，不在本 task 范围）。
- 不调整概览页"占位失败"（t040）的合成逻辑。
- 不动 `refresh-service.ts` 与 IPC 层（数据流已经是按 instanceId 分桶的，只缺渲染层透传）。

## 验收标准

- [ ] 单测：`use_popup_derived.providerErrors` 在 input 为「两个 enabled Grok connector，都 status=failed，不同 instanceId」时，返回结构能区分两个失败 instance（如按 instanceId 分桶），不再把第二个 instance 的 error 静默丢弃。
- [ ] 单测：`buildAccountErrors`（provider-usage.ts）每条 account 错误记录都带 `sourceInstanceId` 字段（直连类型填充 `${sourceInstanceId}|${accountId}` 中的 sourceInstanceId 部分）。
- [ ] 单测：`PopupView.handle_re_login(instanceId)` 调用 `window.usageboard.settings.open` 时传 `{ instanceId }` 而非 `{ provider }`，且**不**做 `activeProviders.includes` 模糊查找。
- [ ] 单测：`ProviderAccountList` 把 `onReLogin` 透传给 `ProviderAccountRow`（不通过 `_onReLogin` + `void` 丢弃）。
- [ ] e2e (web)：mock 后端构造「两个 Grok 账号，一个 401 一个正常」，点 401 账号行内的「重新登录」打开编辑弹窗，弹窗中选中并展示的是**报 401 的 instanceId**（不是另一个）。
- [ ] `pnpm check`（typecheck + lint + format + deadcode + arch）全绿。
- [ ] `pnpm test` 全绿。
- [ ] `pnpm test:e2e:web` 全绿（或已知问题除外）。

## 依赖与约束

- 前置：t026/t027/t028/t084 已合入 main，`AccountError` / `provider-usage.buildAccountErrors` / `ProviderAccountRow` error badge 已存在；本 task 在其上扩展。
- 约束：渲染进程永远不见密钥明文（沿用现有 vault 隔离）；错误分类/状态码仅看错误消息和 `instanceId`，不读凭据。
- 约束：instanceId 字符串不可信（用户报告的 `grok-{timestamp}-{random}` 在当前代码中不存在，可能是老版残留/导入配置/手动创建），但 `find((p) => p.instanceId === context.instanceId)` 严格相等匹配对任意字符串都正确，故链路无需特殊处理。
