# T6 Plan: 多账号半行间距

## 复杂度

**S**

## 方案

`ProviderAccountList` 外包一层：

```tsx
<div className="provider-account-list">
  {accounts.map(...)}
</div>
```

```css
.provider-account-list {
    display: flex;
    flex-direction: column;
    gap: 8px; /* ~半行 */
}
```

若账号行本身已是 `.card` 且有 margin，改为 gap 并去掉重复 margin，避免 double spacing。

检查 `ProviderCard` 内嵌账号列表 DOM，确认 class 挂载点。

## 测试

- 可选：CSS/DOM 测试 `provider-account-list` 存在
- 手工：多账号 provider 视觉

## Commit

```
style(ui): add half-line gap between main-panel account rows
```
