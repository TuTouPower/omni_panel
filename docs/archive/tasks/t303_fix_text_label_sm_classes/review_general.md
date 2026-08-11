# Task review t303（reviewer_focus: 通用）

- task：`t303_fix_text_label_sm_classes`
- spec：`docs/tasks/t303_fix_text_label_sm_classes/spec.md`
- diff_anchor：`3996224c7a07602a6282c667d8de5e238b560fdc`
- target：`git diff 3996224c7a07602a6282c667d8de5e238b560fdc`
- round：1
- reviewed_at：2026-08-11 12:30 UTC+8

## Findings

### t303_gen_f001 - AC-001 测试扫描范围窄于「全仓 grep」措辞

- 严重度：minor
- 锚点：AC-001「`src/renderer` 全仓 grep `text-label-sm` 命中 0 处」
- 位置：`tests/unit/renderer/components/ui/ui.test.tsx:382-398`（walk 过滤 `/\.(tsx|ts)$/`）
- 问题：新增 AC-001 测试递归扫描 `src/renderer` 时仅收 `.tsx|.ts`，非 ts/tsx 文件（css/html/json 等）不在扫描内；测试名与 AC-001 均称「全仓 grep」，措辞与实现存在偏差。当前实际状态无缺口：reviewer 独立 `grep -rn text-label-sm src/ tests/` 仅在测试文件内命中（注释与断言本身），`src/` 全部文件（含 css）0 命中。类名只存在于 tsx，token 定义由 AC-002 的 DESIGN 检查覆盖，故风险为理论性。
- 建议：可保持现状（与同文件 t302 扫描同约定），或把过滤改为扫描 `src/renderer` 全部文件以逐字贴合「全仓 grep」。二者皆可，非阻断。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 全量测试声明（task.md「2867 passed | 2 skipped」）为 implementer 自述，reviewer 仅复跑受影响 5 个测试文件（ui / Segmented / SessionTable / session_table / token_stats_view，69 passed），未全量复跑。受影响文件全绿，AC-004 满足。
    - spec 风险节注明 Segmented sm 归级后「实施期需视觉核对」，task.md 未记录视觉验证；此项非 AC，视觉差异无法从 diff 判定，留待黑盒/人工确认。
    - tailwind-merge 吞颜色类风险已实证排除：`twMerge('font-mono text-label-sm font-medium text-[var(--color-success)]')` 旧式输出仅留 `font-mono font-medium text-[var(--color-success)]`（`text-label-sm` 本就被 twMerge 丢弃，印证 p127「失效类无效果」）；新式 `text-[length:var(--text-body-sm)]`（font-size，length hint）与 `text-[var(--color-success)]`（color）分属不同组，二者共存不互吞。d032 机制在归级后正常生效。
- 总体判断：11 处 `text-label-sm` 全部替换为九级档内 d032 显式 length 类，归级映射逐处与 spec 一致（TokenStatsView 增量 5 → body-sm、状态 3 → label-caps、SessionTable slug → body-sm / 徽章 → label-caps、Segmented sm → body-sm）；globals.css 未动、字号档保持九级、无 `--text-label-sm`（AC-002）；t302 扫描排除移除合理（归级后扫描更严且与 AC-001 测试双重兜底）。无未解决 critical / important，仅 1 条 minor。
- 系统性 follow-up：无

reviewed_scope: 0614461a72aa4cae

verdict: PASS
