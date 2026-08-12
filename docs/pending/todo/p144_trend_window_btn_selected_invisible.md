# p144 用量面板趋势窗口选中按钮文字隐形（accent 底被 bg-transparent 覆盖 + surface-card 文字色语义错）

- 现象：用量面板账号卡片「趋势窗口」切换按钮（1天/7天/30天）选中态异常——截图（dark 主题，`PixPin_2026-08-12_14-08-02.png`）显示选中按钮仅剩 accent 蓝边框，背景为卡片深色、文字完全隐形。期望：选中按钮呈 accent 蓝底 + 高对比文字（如白色），未选中浅灰字透明底。light 主题同受影响（白字白底）。属 t274（afd34807）引入回归。
- 影响：所有用量面板账号卡片的趋势窗口切换（ProviderAccountRow.tsx:264-283）。影响范围含 1/7/30 天三个按钮的选中态可读性，明暗两主题均劣化。已扫同类位点：无已确认同类——`text-[var(--color-surface-card)]` 作文字色全仓仅此一处；`bg-[var(--color-accent)]` 其余 3 处（ProviderNav 伪元素、BarSchemeField/StatusDot 纯色块）无文字冲突；`bg-transparent` 与选中态 bg-\* 同节点冲突仅此一处（其余 bg-transparent 均配 hover 伪类，机制不同）；Segmented/ProviderCard/Button 选中态用 `bg-surface-window + text-on-surface` 或 `text-accent`，背景文字 token 搭配正确且基础态无 bg 类冲突，无同因。
- 根因：产品缺陷，CSS 层叠 + token 语义双问题叠加（`ProviderAccountRow.tsx:268-274`）：
    1. 选中态 className 同时含基础态 `bg-transparent` 与选中态 `bg-[var(--color-accent)]`；构建 CSS 中 `.bg-transparent`（@43110）定义于 `.bg-[var(--color-accent)]`（@40730）之后，层叠胜出 → 选中背景被强制透明，露出卡片底色。
    2. 选中态文字 `text-[var(--color-surface-card)]` 把「背景色 token」当文字色；dark 下 surface-card=`#1f232c`（卡片深底）与透明露出的深底同色 → 深字深底完全隐形；light 下 surface-card=`#ffffff` 白字白底亦隐形。
    3. 同组 `.text-[var(--color-surface-card)]`（@53389）亦定义于 `.text-[var(--color-on-surface-variant)]`（@53051）之后，故选中文字被 surface-card 覆盖。边框 `border-[var(--color-accent)]` 无同类冲突，正常显示——与截图「蓝边框 + 隐形文字」吻合。复现脚本实测 light 选中按钮 bg=白（卡片底）、fg 过渡至 surface-card。
- 测试缺口：`tests/unit/renderer/components/provider_account_row.test.tsx` 对趋势按钮只断言 `aria-pressed`（状态语义），Tailwind 类为静态字符串不参与层叠计算，单测无法发现；e2e `tests/e2e/web/ui_component_theme.spec.ts`（t283）已有 WCAG 对比度抽样门禁（`sample_contrast`），但只覆盖设置页 ui 组件（Button/Switch/Segmented…），未覆盖 usage 面板的 ProviderAccountRow 趋势按钮。补测：在 `ui_component_theme.spec.ts` 或新 spec 对趋势窗口按钮选中态做 light/dark 对比度抽样（fg vs 最近非透明背景），断言选中态背景非透明且文字对比 ≥ 4.5（11px 小字），挡位点 = 选中态背景 + 文字色两层。
- 线索：`.scratch/repro_trend_button.spec.ts` + `.scratch/playwright.repro.config.ts`（跑 `MOCK_FIXTURE=synthetic npx playwright test --config=.scratch/playwright.repro.config.ts`，自动点入 Claude tab 采样按钮对比度）；CSS 层叠顺序取证脚本见本次分析（`.bg-transparent` vs `.bg-[var(--color-accent)]` 位置）。
- 处理：未开
