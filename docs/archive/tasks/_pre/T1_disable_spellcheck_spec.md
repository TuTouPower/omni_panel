# T1 Spec: 关闭输入框拼写/语法红波浪线

## 问题

多数字符串输入框（域名、endpoint、密钥、备注、标签）未禁用浏览器 spellcheck，Chromium 对英文域名/技术串画红色拼写波浪线。

## 现状（代码）

`src/renderer` 内 `<input>` / `<textarea>` 均未设置 `spellCheck={false}`。涉及：

| 组件                       | 字段类型                                              |
| -------------------------- | ----------------------------------------------------- |
| `SettingsForm.tsx`         | 备注、secret、string/integer、endpoint (`type="url"`) |
| `AddAccountDialog.tsx`     | 备注、API key、endpoint、cookie textarea              |
| `CpaConnectorSettings.tsx` | 备注、endpoint、管理密钥                              |
| `LabelMapDialog.tsx`       | 显示名称                                              |
| `RenameAccountDialog.tsx`  | 备注                                                  |
| `SettingsView.tsx`         | 内联密钥等                                            |
| `GrokLoginSection.tsx`     | 若有文本输入一并纳入                                  |

## 期望

- 所有用户可编辑的 `input[type=text|url|password|number|email|search]` 与 `textarea`：`spellCheck={false}`。
- 可选：`autoCorrect="off"` / `autoCapitalize="off"`（Chromium 部分生效，无害）。
- checkbox / select / button 不涉及。

## 验收

1. 设置 → 编辑任意账号 → 接口地址输入 `api.example.com`：无红波浪线。
2. 数据标签映射输入框、备注名、密钥框：无红波浪线。
3. 新增账号弹窗：同上。

## 非目标

- 不改 Electron `webPreferences` 全局 spellchecker（优先组件级属性，改动面小、可测）。
- 不做中文语法检查相关功能。

## 风险

- 若未来有「写日记」类自然语言字段，需白名单开启 spellcheck；当前产品无此字段。

## 手工验证

打包产物：各设置表单输入域名/随机英文串，确认无红色下划线。
