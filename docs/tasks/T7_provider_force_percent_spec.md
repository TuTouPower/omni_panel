# T7 Spec: 按厂商统一百分比显示

## 问题

不同 metric 的 `displayStyle` 为 `percent` 或 `ratio`（`used/limit` 分数）。用户希望：设置里按**厂商**开关「数字统一成百分比」，语义对齐 `providerLabelMaps`（厂商级统一，非账号级）。

## 现状

- 渲染：`UsageRows.tsx` `is_ratio = displayStyle === "ratio" && limit > 0` → 显示 `used/limit`，否则 `pct%`。
- 配置先例：`providerLabelMaps?: Partial<Record<UsageProvider, Record<string, string>>>`。
- 标签映射 UI：CPA 同步范围 / 直连编辑内映射；厂商级保存 `providerLabelMaps`。

## 期望

### 配置

```ts
// AppConfiguration
providerForcePercent?: Readonly<Partial<Record<UsageProvider, boolean>>>;
// true = 该厂商所有 metric 强制按百分比文案显示
// 缺省/false = 尊重 connector 的 displayStyle
```

### 行为

- 强制后：数值文案一律 `N%`（用现有 `percent(used, limit)`）；`limit` 无效时保持空/0% 与现逻辑一致。
- **不改**采集数据与 bar 宽度计算（bar 已按 pct 填）。
- 作用域：该 `provider` 下所有账号、所有来源（直连+CPA 并入）。

### 设置 UI（已拍板）

放在**直连账号编辑表单**（`SettingsForm`）内：

1. 「跟随全局自动刷新间隔」（及自定义间隔）**下面**
2. 「数据标签映射」**上面**

一行开关：「用量数字统一为百分比」/ 副文案：「该厂商下所有账号用量统一显示为百分比」。

- 存 `providerForcePercent[providerId]`，与 `providerLabelMaps` 同为**厂商级**（非 instance 级）。
- CPA 路径：若编辑入口不同，在等价位置（厂商维度设置区）放同一开关，仍写 `providerForcePercent[vendor]`。

### 验收

1. 打开某厂商「统一百分比」→ 原 ratio（如 `12/100`）变 `12%`。
2. 关闭后恢复 ratio。
3. 仅该厂商变化，其他厂商不变。
4. 与标签映射可并存。

## 非目标

- 不改 connector 输出的 `displayStyle`。
- 不做账号级覆盖（用户明确厂商统一）。

## 风险

- 余额类「越低越危险」且 ratio 展示绝对余额时，强制 % 可能无意义：仅当 `limit > 0` 时强制 %；`limit` 空保持原样。
