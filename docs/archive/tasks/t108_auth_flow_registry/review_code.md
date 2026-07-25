# Task review t108（reviewer_focus: 代码）

- task：`t108_auth_flow_registry`
- spec：`docs/tasks/t108_auth_flow_registry/spec.md`
- diff_anchor：`593654c420c53787556bf88ab7ce9ef2c370ae5d`
- target：`git diff 593654c420c53787556bf88ab7ce9ef2c370ae5d`
- round：1
- reviewed_at：2026-07-25 16:06 UTC+8

## Findings

### t108_code_f001 - Placeholder auth methods 仍可点击「添加账号」保存空账号

- 严重度：important
- 位置：`src/renderer/components/AddAccountDialog.tsx:530-551`（footer 主按钮），`handle_save` `src/renderer/components/AddAccountDialog.tsx:417-453`
- 问题：当 `auth_method` 为 `oauth_device` / `web_login` / `cpa_mgmt` 时，渲染的是 `AuthPlaceholder` 占位组件，告知用户「添加流程将在 t109/t110 实现」。但对话框底部「添加账号」按钮仍处于可用状态，点击后会调用 `handle_save` 并进入 `on_save(params)`，此时 `params.secrets` 与 `params.parameter_values` 均为空对象。`SettingsView.tsx:2113-2127` 的 `onAddAccount` 会据此 `duplicate` 一个新的 connector 实例，即使 secrets 为空也会完成创建，导致生成一个无凭证的无效账号。
- 建议：在 `handle_save` 中对占位 method 提前 `return` 或禁用保存；也可在 footer 渲染时判断 `auth_method` 属于占位类型则隐藏/禁用主按钮。

### t108_code_f002 - CPA 连接器查找可能误选非 CPA 的 gateway

- 严重度：minor
- 位置：`src/renderer/components/AddAccountDialog.tsx:46-50`
- 问题：`find_connector` 对 `vendor_id === "cpa"` 的匹配条件是 `c.metadata?.name === "cpa" || c.source === "gateway"`。若系统中存在多个 `source === "gateway"` 的连接器（未来扩展或其他 gateway 类型），`Array.prototype.find` 会返回第一个，可能不是 CPA，从而导致 `resolve_auth_method` 基于错误的 connector 选择表单。
- 建议：优先匹配 `metadata?.name === "cpa"`，仅在找不到时再按 `source === "gateway"` 回退；或把 `source === "gateway"` 与名称检查组合使用。

### t108_code_f003 - AddAccountDialog 中的 AuthMethod 名称遮蔽共享 schema 类型

- 严重度：minor
- 位置：`src/renderer/components/AddAccountDialog.tsx:15`
- 问题：`export type AuthMethod = ResolvedAuthMethod;` 将本地类型命名为 `AuthMethod`，与 `src/shared/schemas/auth.ts` 导出的 `AuthMethod` 同名但语义不同（本地包含 `"session"`，共享类型不包含）。`AddAccountParams` 被 `SettingsView.tsx` 引用，未来维护者容易混淆这两个同名类型。
- 建议：直接使用 `ResolvedAuthMethod` 作为导出/参数类型，或重命名为 `AddDialogAuthMethod`，避免遮蔽共享 schema 的 `AuthMethod`。

## 结论

- 前轮 finding 复核（Round 2 才写）：N/A
- 本轮新发现：3 条（important 1，minor 2）
- 总体判断：核心改造方向正确，`VENDOR_AUTH_MAP` 已删除，`resolve_auth_method` 的优先级与回退逻辑覆盖了全部 `UsageSource`，secret 名称优先使用 descriptor 再 fallback 到第一个 secret 参数。但占位 auth method 的保存边界未封闭，存在生成空账号风险。

补充说明（不进 finding 表）：

- `spec.md` 写「未声明时按 `capabilities` 推导」，但 `ConnectorInfo` 运行时类型并未暴露 `capabilities`，实现改用 `source` 回退，且 `docs/blueprint/architecture.md` 已同步更新为按 `source` 回退。此偏差属于 spec 与可用数据字段的合理 reconciliation，未引入功能错误。

verdict: FAIL

## Round 2 (2026-07-25 16:14 UTC+8)

### 前轮 finding 复核

- **t108_code_f001 - Placeholder auth methods 仍可点击「添加账号」保存空账号**：已修复。`handle_save` 在 `AddAccountDialog.tsx:418` 对 `is_placeholder_auth` 提前 `return`；footer 主按钮在 `AddAccountDialog.tsx:542-548` 通过 `disabled={saving || is_placeholder_auth}` 与对应 `disabled` className 禁用，占位 method 不再触发 `on_save`。
- **t108_code_f002 - CPA 连接器查找可能误选非 CPA 的 gateway**：已修复。`find_connector` 在 `AddAccountDialog.tsx:42-47` 改为优先匹配 `c.metadata?.name === "cpa"`，仅在未命中时再回退到 `c.source === "gateway"`，符合 Round 1 建议的优先+回退策略。
- **t108_code_f003 - `AuthMethod` 遮蔽共享 schema 类型**：已修复。本地 `export type AuthMethod = ResolvedAuthMethod;` 别名已删除，`AddAccountDialog.tsx` 统一从 `auth-flow-registry.ts` 导入 `ResolvedAuthMethod` 并作为 `AddAccountParams.auth_method` 类型，不再遮蔽 `src/shared/schemas/auth.ts` 的 `AuthMethod`。

### 本轮新发现

0 条。

### 结论

- 前轮 finding 复核（Round 2）：3 条全部已修。
- 本轮新发现：0 条。
- 总体判断：t108 核心改造完成，`auth-flow-registry.ts` 按 descriptor/source 正确解析认证方式，`AddAccountDialog.tsx` 删除 `VENDOR_AUTH_MAP` 并按解析结果路由子表单，占位 method 的保存边界已封闭，文档与实现一致。Round 2 无新增问题。

verdict: PASS
