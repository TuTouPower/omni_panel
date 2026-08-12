# p143 采集失败提示颜色被灰色覆盖（STATE_BASE 双 color 类冲突）

- 现象：用量面板采集失败提示（ProviderCardState err 分支「采集失败：...」与 ProviderCardErrorBanner「采集失败：...」）之前红色，现在灰色（#687085 on-surface-variant）。期望红色 `--color-error`。
- 影响：主面板/用量面板采集失败与凭证失效提示的视觉告警语义丢失（失败不醒目）。已确认同类位点：`src/renderer/components/provider_card_states.tsx:72`（ProviderCardState err）与 `:125`（ProviderCardErrorBanner）两处同一 STATE_BASE 模式。其余 `muted + hover:error` 位点（SelectionTray/SessionRail 等）因 hover 伪类特异性 (0,2,0) > 基类 (0,1,0) 正常生效，排除。
- 根因：产品缺陷（CSS 类冲突）。STATE_BASE 含 `text-[var(--color-on-surface-variant)]`（t274 afd34807 引入），失败分支裸拼接追加 `text-[var(--color-error)]`，同元素双 color 类。Tailwind 任意值类 CSS 源顺序 `text-[var(--color-on-surface-variant)]` 排在 `text-[var(--color-error)]` 之后，同特异性 (0,1,0) 下后声明灰类胜出 → 灰色覆盖红色。`.scratch/bug-color/repro.html` 用构建 CSS 实测：同挂两类的 div computed color = rgb(104,112,133)（灰），单独 error = rgb(239,68,68)（红）。已扫，无其它已确认同类位点。
- 测试缺口：`tests/unit/renderer/components/provider_card_states.test.tsx` 无 computed color / className 色类断言，只断言文案与操作，未盖住颜色回归。应补：两处失败分支（ProviderCardState err、ProviderCardErrorBanner）断言最终 className 色类为 error 且不含冲突灰类，或用 cn()/twMerge 合并后断言 error 生效（修复后需能挡住「灰类覆盖红类」回归）。
- 线索：`.scratch/bug-color/repro.html`（构建 CSS 最小复现：同挂两色类 → 灰）
- 处理：t319
