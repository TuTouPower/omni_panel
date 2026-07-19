# T7 Plan: 厂商强制百分比

## 复杂度

**M**

## 改动

1. Config 类型 + zod + 默认
2. `UsageBarRow`：props `forcePercent?: boolean`；或上层把 period.displayStyle 覆写为 percent
    - 推荐在 `provider-usage` 组装/渲染边界：`effective_display_style(provider, style, flags)`
3. `PopupView` 读 `config.providerForcePercent` 传入 `ProviderCard` → list → row
4. `SettingsForm` UI：刷新间隔区块下方、数据标签映射上方 — 厂商级开关，save 写 `providerForcePercent[providerId]`（经 SettingsView 回调或现有 save 管线）
5. CPA 若有独立编辑页：同步范围/厂商设置区同开关，同一 config 字段
6. 文档 `config-store.md` / `ui-views.md`

## 测试

- unit：force 时 ratio period 显示 `%`
- settings save 写入 `providerForcePercent.claude === true`

## Commit

```
feat(usage): per-provider force percent display setting
```
