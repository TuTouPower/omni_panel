# Task review t435（reviewer_focus: 通用）

- task：`t435_fix_segmented_active_primary_text`
- spec：`docs/tasks/t435_fix_segmented_active_primary_text/spec.md`
- diff_anchor：`2d4471ee9e8699aa9a02fffbfab4c7ddeb6ab31d`
- target：`git diff 2d4471ee9e8699aa9a02fffbfab4c7ddeb6ab31d`
- round：1
- reviewed_at：2026-08-17 01:53 UTC+8

## Findings

本轮无 finding（零发现为有效输出，见「零发现合法与 finding 边界」；扫描过程见结论段各视角说明）。

## 结论

### AC 复验方式

- **AC-001**：`re_verified`。`src/renderer/components/ui/Segmented.tsx:57` 选中 class 为 `bg-[var(--color-surface-card)] text-[var(--color-primary)] shadow-card`，含 `text-[var(--color-primary)]`，不含 `text-[var(--color-on-surface)]`；`tests/unit/renderer/components/ui/ui.test.tsx:346-348` 断言两正一负，套件通过。
- **AC-002**：`re_verified`。`Segmented.tsx:57` 选中底 `bg-[var(--color-surface-card)]`，与 `DESIGN.md:286` `segmented-item-active.backgroundColor: "{colors.surface-card}"` 一致；`ui.test.tsx:345`、`provider_card_overview.test.tsx:110-111/134-136` 断言，套件通过。
- **AC-003**：`re_verified`。`provider_card_overview.test.tsx` 两用例覆盖 `l2Open=false`「概览」选中（L106-117）与 `l2Open=true`「N账号」选中（L129-141），均断言 primary 字 + surface-card 底 + `aria-pressed` 互斥 + 未选中无选中底；`not.toContain("bg-[var(--color-surface-card)]")` 落点仅为未选中 tab（选中 tab 无 on-surface，无 hover 串干扰，实测通过）。
- **AC-004**：`re_verified`（单测部分；e2e 静态核验）。四处旧断言全部更新：`ui.test.tsx:345-357`（含切换后新选中项）、`provider_card_overview.test.tsx:110-116/134-141`、`settings_view_general.test.tsx:208-213`（用量条样式）、`trend_window_button_contrast.spec.ts:110-127`（背景探针 surface-window → surface-card）。全仓 grep 复核：`tests/` 与 `docs/` 残留 on-surface/surface-window 均非 Segmented 选中态（侧栏导航 settings_view.spec.ts:327-328、会话/工作区根背景、对话框标题、palette 等），无再锁定旧配方。定向复验 `pnpm exec vitest run tests/unit/renderer/components/ui/ui.test.tsx tests/unit/renderer/components/provider_card_overview.test.tsx tests/unit/renderer/views/settings_view_general.test.tsx`：3 文件 91 用例全过。e2e 未执行（CPU 节制），静态核验：断言与组件新配方一致；明暗两主题 primary/surface-card 对比度 3.89/5.02 ≥ 3.0 门槛（旧暗色断言 bg==surface-window 本会在暗色失败，改为 surface-card 后暗色下才真实成立）；未选中 variant 字 vs 选中 primary 字两主题均不同色（1.27/1.36 对比，断言只要求不相等）。
- **AC-005**：`trust_prior`（[deploy] 人工目检，agent 无法自证）。依赖实施侧产物：组件/测试已绑定 primary 语义 token，`--color-primary` 派生自 `--accent`（globals.css:195/227），五档 accent 预设联动为同一 token 链。

coverage = 4 / 5（re_verified=AC-001~004，trust_prior=AC-005，占比 20%）

### 视角扫描记录（7 视角正交体检）

- 规格合规：范围收敛，未越「非范围」边界（不改切换行为/API/消费方/DESIGN 数值）；`docs/specs/ui-component-library.md:13` Segmented 配方已同步 surface-card/primary（终态要求项满足）。
- 实现正确性：仅 `Segmented.tsx:57` 一行配方替换，选中/未选中分支互斥，`cn()` 合并无冲突；空值/边界无涉。
- 安全审视：纯 class 常量替换，无外部输入/注入/XSS/越权面，N/A。
- 契约·类型·Breaking：无签名/API/配置键变更；无 `any`/强转新增。
- 性能与资源：无运行路径变化，N/A。
- 架构与可维护性：组件单点改，全局生效（消费方 SessionLibrary/ProviderCard/appearance_section/ProviderAccountRow 均经 ui/Segmented）；TokenPanel 已不消费该组件，不受影响。
- 健壮性与可观测：无异常/资源路径，N/A。
- 测试·文档·规格：见 AC 复验；测试未降级（对比度门槛保持 ≥3.0，未放宽）；旧 `token-stats/Segmented.test.tsx` 仅断言 aria-pressed 无色值锁定。

### 其他

- 前轮 finding 复核：无（Round 1）。
- 本轮新发现：0 条。
- 未进表的提示：选中字从 on-surface 到 primary 是 DESIGN 配方（对比度由 14.4 降至 3.89，仍过 3.0 e2e 门槛），属 spec 明示意图，非缺陷；未选中/选中字色对比（light 1.27）偏低但为设计配色，e2e 仅要求不同色。无其它范围外观察。
- 总体判断：diff 与 spec 契约区 5 条 AC 对齐，无未解决 critical/important finding，PASS。
- 系统性 follow-up：无。

reviewed_scope: 6516680a43e191eb

verdict: PASS
