# T1 Plan: 关闭输入框拼写红波浪线

## 复杂度

**S**

## 方案

**推荐**：在 CSS/全局无法可靠关 Chromium spellcheck 时，对所有相关 `<input>`/`<textarea>` 加 `spellCheck={false}`。

可选增强（同批）：抽 `AdInput` 薄封装统一属性；若改动面嫌大，直接各文件加属性即可。

## 改动文件

1. `src/renderer/components/SettingsForm.tsx` — 所有 text/password/number/url input
2. `src/renderer/components/AddAccountDialog.tsx` — input + textarea
3. `src/renderer/components/CpaConnectorSettings.tsx`
4. `src/renderer/components/LabelMapDialog.tsx`
5. `src/renderer/components/RenameAccountDialog.tsx`
6. `src/renderer/views/SettingsView.tsx` — 内联 secret/input
7. `src/renderer/components/GrokLoginSection.tsx` — 若有可编辑文本框

## 测试

- 单元：关键组件 render 后 `expect(input).toHaveAttribute("spellcheck", "false")`（HTML 小写）。
- 或新增轻量 util 测试不必；优先在 `settings_form` / `add_account_dialog` / `cpa_connector_settings` 各加 1 断言。

## Commit

```
fix(ui): disable spellcheck on technical text inputs
```

## 验证

`pnpm test` 相关 renderer unit；手工：endpoint 输入域名无红线。
