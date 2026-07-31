# T2 Spec: 密钥框小眼睛按钮统一

## 问题

密钥输入框有的有眼睛（显示/隐藏），有的没有，体验不一致。

## 现状盘点

| 位置                                         | 有眼睛 | 实现                            |
| -------------------------------------------- | ------ | ------------------------------- |
| `AddAccountDialog.tsx` API key               | 是     | `show_key` + `.ad-eye`          |
| `CpaConnectorSettings.tsx` `cpa_mgmt_key`    | 是     | `showKey` + `.ad-eye`           |
| `SettingsView.tsx` 内联密钥（约 L577）       | 是     | `showKey` + `.ad-eye`           |
| `SettingsForm.tsx` `param.type === "secret"` | **否** | 仅 `type="password"`，无 toggle |
| `GrokLoginSection.tsx`                       | N/A    | OAuth device-code，无密码框     |

样式：`globals.css` `.ad-eye` / `.ad-key` / `.ad-secret-row` 已存在。

## 期望

1. 所有 **secret/password** 输入统一提供眼睛按钮（与 AddAccountDialog 视觉一致）。
2. 行为：本地有可切换明文时，toggle `type` password ↔ text。
3. 与 T3/T4 协调：若字段为 vault 占位、无法回显真实密钥，眼睛策略由 T4 定义（禁用/隐藏/tooltip）；T2 负责「有密钥编辑能力的框」控件齐全。

## 验收

1. 直连账号编辑（`SettingsForm`）任意 secret 参数：有眼睛按钮。
2. 新增账号、CPA 管理密钥：与现有一致且样式统一。
3. 非 secret 字段：无眼睛。

## 非目标

- 不从 vault 拉回明文（见 T3/T4）。
- 不改 Grok OAuth 流程。

## 风险

- SettingsForm 用 `defaultValue` + 非受控；加眼睛需本地 `showSecrets` map（按 param.name）。
- 多 secret 字段时每行独立 toggle。
