# T2 Plan: 密钥框小眼睛统一

## 复杂度

**S–M**

## 方案

抽取共享组件（推荐）：

```tsx
// src/renderer/components/SecretInput.tsx
// props: name, id, value|defaultValue, onChange?, className, aria-label, mono?, disabled?
// 内部：show 状态 + input type + .ad-eye 按钮
```

迁移：

1. `SettingsForm` secret 分支 → `SecretInput`（补上眼睛，当前最大缺口）
2. `AddAccountDialog` key 行
3. `CpaConnectorSettings` 管理密钥
4. `SettingsView` 内联密钥

样式复用 `.ad-key` / `.ad-secret-row` / `.ad-eye`。

## 与 T4 接口

`SecretInput` 预留 `revealable?: boolean`（默认 true）：

- `false` 时眼睛 disabled + title「已保存密钥无法回显」（T4 启用）。

## 测试

- `SecretInput` 单元：点击切换 type password/text。
- `settings_form`：secret 参数渲染出眼睛按钮。
- 现有 CPA/AddAccount 测试不回归。

## Commit

```
feat(ui): unify secret field eye toggle via SecretInput
```

## 验证

设置 → DeepSeek/GLM 等编辑 → API Key 行有眼睛；新增账号弹窗仍正常。
