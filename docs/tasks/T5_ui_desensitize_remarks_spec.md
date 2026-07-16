# T5 Spec: 界面脱敏开关（隐藏账号备注名）

## 问题

投屏/演示时账号备注（邮箱、自定义名）暴露。需全局开关，打开后备注在 UI 中「消失」。

## 期望

### 配置

- `AppConfiguration.uiDesensitizeRemarks?: boolean`（默认 `false`）
- Zod + `DEFAULT_CONFIGURATION` 同步
- 设置页「外观 → 其他」新增开关：「界面脱敏」/ 副文案：「隐藏所有账号备注名（主面板与设置列表）」

### 影响面

| 表面                                     | 字段                                                 | 脱敏后                             |
| ---------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| 主面板 `ProviderAccountRow` `.card-name` | `account.accountLabel`                               | 空 / 占位「—」/ 仅显示厂商（见下） |
| 主面板 `AccountUsageRow` `.ai-name`      | 同上                                                 | 同上                               |
| 设置 `AccountRow` `.ar-note`             | `· {account_label}`                                  | 不渲染备注段                       |
| CPA 父行备注 `displayName`               | `CPA · displayName`                                  | 仅 `CPA`                           |
| 设置编辑表单内的备注输入                 | **保留可编辑**（在设置里改备注仍可见，避免无法编辑） | 可选：输入框内正常，列表隐藏       |

**保留可见**：厂商名（Claude/Codex…）、状态灯、用量数字、provider tab。

**不隐藏**：`accountId` 默认不在主面板展示；若有泄露处一并遮。

### 语义

「备注名」= `displayName`（直连）+ `accountLabels[provider][accountId]`（CPA 等）+ 运行时 `accountLabel` 中用户向展示名。  
脱敏只影响 **渲染**，不删配置。

## 验收

1. 外观打开「界面脱敏」→ 主面板多账号卡标题无备注，仅厂商级信息可辨。
2. 设置账号列表无 `· 备注`。
3. 关闭开关立即恢复（config 订阅）。
4. 默认关闭，不影响现有用户。

## 非目标

- 不脱敏密钥字段（另有 vault）。
- 不截屏检测自动开。

## 已拍板

- 脱敏后**不要** `账号 1/2` 序号 fallback。同厂商多账号仅靠用量条等非备注信息区分；备注一律消失。
