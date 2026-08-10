# Task review t298（reviewer_focus: 代码）

- task：`t298_button_font_merge_and_danger_contrast`
- spec：`docs/tasks/t298_button_font_merge_and_danger_contrast/spec.md`
- diff_anchor：`f777c0f5a6bc66956e106772ce1baefd06197f88`
- target：`git diff f777c0f5a6bc66956e106772ce1baefd06197f88`
- round：1
- reviewed_at：2026-08-11 04:15 UTC+8

## Findings

### t298_code_f001 - p126 中 ListRow 的 d032 触发点描述与实况不符（实际在 subtitle text-body-sm，非 base text-body-md）

- 严重度：minor
- 锚点：spec「非范围」登记同模式遗留（p126）的准确性；不违反任何 AC
- 位置：`docs/pending/todo/p126_ui_components_bare_font_size_twmerge.md:4`
- 问题：p126 声称 `ListRow` 在 `cn()` base 内 `text-body-md` 与 `text-[var(--color-on-*)]` 并存。实际 `ListRow.tsx` 根 cn()（`ListRow.tsx:29-35`）只有 `text-[var(--color-on-surface)]`、无 `text-body-md`；title div（`ListRow.tsx:39`）只有 `truncate text-body-md`、无颜色类——两处都不触发 d032。真正受 d032 影响的是 subtitle div（`ListRow.tsx:41`）：`truncate text-body-sm text-[var(--color-on-surface-variant)]` 同一字符串内 `text-body-sm` 裸类与颜色任意值并存。d032 按 text-color 子组合并，二者必丢其一。故 ListRow 确属同模式（登记结论成立），但描述机制偏差：修复者按 p126 措辞去根 cn() 找 `text-body-md` 会落空，可能漏改 subtitle 的 `text-body-sm`。
- 建议：修正 p126 措辞，注明 ListRow 受影响点是 subtitle `text-body-sm`（`text-[length:var(--text-body-sm)]`），其余五项（Input/SecretInput/Textarea/Select/PanelTitleBar）确为 base `text-body-md` + 颜色类并存。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - globals.css 导出区与 DESIGN.md 一致（`pnpm designmd:check` 实测 passed，`scripts/designmd.ts:170-176` 只比对 begin/end 标记间区域）；diff 新增的空行（globals.css:128-129 两空行）为 `write_css_tokens`（`scripts/designmd.ts:153-167`）`before + css + "\n" + after` 拼接 from anchor 时产生的生成物，非手改 token 值。纯 cosmetic，不进 finding。
    - error-dark 调暗对暗色背景错误文字可读性：实测新值 #f0564d 对比 surface-window #181b22 = 5.04、surface-card #1f232c = 4.60、surface #0c0e13 = 5.65、raised #262b34 = 4.16（旧值 #ff6b6b 分别为 6.21/5.67/6.96/5.12）。最常用两背景 ≥ 4.6，最差 raised 4.16 > 3.0，均 ≥ WCAG UI/大字 AA；task.md 声称「4.85」为近似值（具体背景不同略有出入），结论可读性不受损成立。
    - 测试层 `ui.test.tsx:275-276` 的 `if (!bg) return;` 属条件跳过弱化断言模式，但正则第 1 组为必选组，`expect(m).not.toBeNull()` 通过则 `m[1]` 必存在，实际不可达；且属测试评审职责，留给 test reviewer。
    - 文件大小：Button.tsx 50 行、ui.test.tsx 289 行，均远低于阈值；复杂度无异常。
- 总体判断：AC-001/002/003 实现层全部满足（字号类 twMerge 共存、danger 暗色对比 2.78→3.42、designmd:check 与全量 2857 测试实测通过），范围无越界，仅 1 条 minor 文档精度问题，PASS。
- 系统性 follow-up：无（p126 已覆盖同模式组件清单，仅措辞待修正）

verdict: PASS

reviewed_scope: 3c9273c886682805

## Round 2 (2026-08-11 04:16 UTC+8)

### 前轮 finding 复核

- **t298_code_f001（p126 ListRow 措辞，minor）— 已消除**。`docs/pending/todo/p126_ui_components_bare_font_size_twmerge.md:4` 现写「`ListRow` 的 subtitle div（`text-body-sm` + 颜色类，根 cn() 无字号）」，与实况（ListRow.tsx:41 subtitle `truncate text-body-sm text-[var(--color-on-surface-variant)]`）一致；根 cn()（ListRow.tsx:29-35）与 title div（:39）不触发 d032 的判定正确。p126 同时补全受影响组件清单，逐一抽查确证同模式真实存在：`SessionPane.tsx:149/158/167`、`SessionRail.tsx:47/118`、`RecentSessionsModal.tsx:94/113`、`SessionRow.tsx:57/60/63`、`SessionCard.tsx:53/56/60`、`SessionLibrary.tsx:380/394/442/457`、`SessionShell.tsx:36/51` 均为裸 `text-body-*`/`text-label-*` + `text-[var(--color-*)]` 同字符串并存。清单无虚报。

### 本轮新发现

0 条。

### 处置项代码层核验（test_f001/test_f002 对应改动）

- Test 1 改为 primary/secondary/danger 三 variant 循环：各断言 `text-[length:var(--text-body-md)]`，secondary 断言 `text-[var(--color-on-surface)]`、primary/danger 断言 `text-[var(--color-on-primary)]`——与 Button.tsx variant 定义（secondary on-surface、primary/danger on-primary）逐项一致，AC-001 文字色断言无弱化。
- Test 2 删 `if (!bg) return;` 死代码（改 `?? ""`），前置 `expect(m).not.toBeNull()` 已保证正则必选组 m[1] 存在，fallback 不可达但无害；补 danger `bg-[var(--color-error)]` + `text-[var(--color-on-primary)]` 类链断言，将变更 token（暗色 `--color-error` 经 globals.css:219 翻转自 error-dark）与实际渲染按钮串起，AC-002 断言链完整。
- 实测：`npx vitest run tests/unit/renderer/components/ui/ui.test.tsx` 22 passed；`npx tsc --noEmit` 退出 0。

### 未进表的提示

- Test 2 `const bg = m?.[1] ?? "";` 的 `?? ""` 属防御性冗余（m[1] 必非空），测试文件内风格级，归 test reviewer，不进 finding。
- 本轮 diff 增量仅 p126（untracked）+ ui.test.tsx；DESIGN.md/Button.tsx/globals.css/task.md 相对 Round 1 无变化，AC-003 designmd:check 结论沿用 Round 1 实测。

### 总体判断

Round 1 唯一 minor（code_f001）已按建议修正确认，无新 blocker；测试改动经代码层核验无弱化。PASS。

verdict: PASS

reviewed_scope: ed39972e21fd0097

## 最终记录 (2026-08-11)

收尾文档同步：`docs/specs/ui_component_theme_contrast.md` 行为节补 danger 暗色对比 ≥3.0（t298）+ `docs/specs_index.md` 行加 t298。无逻辑/测试变更。前序 Round 1/2 verdict 与 finding 复核结论不变。

verdict: PASS

reviewed_scope: 960a4d0bb9f5731a
