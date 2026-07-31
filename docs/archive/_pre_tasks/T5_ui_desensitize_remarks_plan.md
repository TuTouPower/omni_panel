# T5 Plan: 界面脱敏开关

## 复杂度

**M**

## 改动

1. **Schema**
    - `src/shared/types/config.ts`
    - `src/main/core/config/types.ts` zod + default
2. **设置 UI**
    - `SettingsView.tsx` 外观「其他」：`SetRow` + 开关，写 `uiDesensitizeRemarks`
3. **渲染 helper**（推荐）
    - `src/renderer/lib/display_label.ts`：`resolve_account_display_label(label, desensitize)`
4. **消费**
    - `ProviderAccountRow`、`UsageRows.AccountUsageRow`、`AccountRow`、`CpaCard` 父行标题、`PopupView` 传 config flag
    - 脱敏后备注直接空/不渲染，**禁止**序号 fallback
5. **文档**
    - `specs/ui-views.md`、`specs/config-store.md` 一句

## 测试

- config schema 接受新字段
- ProviderAccountRow：desensitize=true 时 card-name 为空或「—」
- SettingsView 开关调用 save

## Commit

```
feat(settings): add uiDesensitizeRemarks to hide account remarks
```
