# p201 用量面板「概览 / N账号」选中态丢失蓝色字（Segmented 偏离 DESIGN primary）

- 现象：期望选中的「概览」或「N账号」分段为**蓝色字**（primary/accent）；实际 t421 后为 `on-surface` 中性字色。折叠态 `Badge accent` 的「N账号」仍蓝；仅展开态 Segmented 丢蓝。用户记忆与 t421 前手拼配方一致。
- 影响：所有 `ui/Segmented` 选中字色（用量 ProviderCard 概览/明细、账号行趋势窗口、会话库视图切换、设置外观、TokenStats 筛选项等）同一配方；主报告点为用量面板概览开关。
- 根因（产品缺陷 / DESIGN 合规回归）：
    1. DESIGN.md `segmented-item-active.textColor` = `{colors.primary}`（蓝，与 `--color-accent`/`--color-primary` 同源）。
    2. `src/renderer/components/ui/Segmented.tsx` 选中态写死 `text-[var(--color-on-surface)]`（+ `bg-surface-window` + `shadow-card`）。
    3. t421 将 ProviderCard 手拼（`text-[var(--color-accent)]`）替换为上述 Segmented，选中字从蓝变中性；`provider_card_overview` / trend_window e2e 断言**改为 on-surface**，假绿锁定错误配方。
    - 分类：产品缺陷
    - 已确认同类位点（同组件，修一处覆盖）：
        - `src/renderer/components/ui/Segmented.tsx`（唯一配方源）
        - 消费方：`ProviderCard.tsx`（主报告）、`ProviderAccountRow.tsx`、`session-library/SessionLibrary.tsx`、`settings-view/sections/appearance_section.tsx`、`TokenStatsView.tsx`
    - 已扫：无第二套手拼「概览/N账号」分段（t421 已清）；Badge accent 折叠计数仍合规，非同因。
    - 次要偏差（可同修）：DESIGN 选中底 `surface-card`，实现 `surface-window`（浅色同值，暗色不同）。
- 测试缺口：既有单测/e2e **断言了错误字色**（on-surface），不是无测。补测须改断言为 primary（或 DESIGN 等价 token），并加 Segmented 单测绑定 `segmented-item-active` 字色；禁止再把「收敛到 Segmented」当成允许偏离 DESIGN 字色的理由。
- 线索：`.scratch/task_bug_usage_overview_segmented_color/repro_notes.md`
- 处理：未开
