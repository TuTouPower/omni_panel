# Task review t272（reviewer_focus: 代码）

- task：`t272_agent_window_design_migration`
- spec：`docs/tasks/t272_agent_window_design_migration/spec.md`
- diff_anchor：`755b0b01d272894a1b266c5896e71d3177df0699`
- target：`git diff 755b0b01d272894a1b266c5896e71d3177df0699`
- round：Round 1
- reviewed_at：2026-08-09 14:59 UTC+8

## Findings

### t272_code_f001 - Agent DOM 强调色未接入全局 accent

- 严重度：important
- 锚点：AC2「强调色随全局五档切换即时生效（含图表配色重绘）」；同时造成 AC3 的 DOM 与图表配色不同步
- 位置：`src/renderer/lib/theme.ts:25-43`、`src/renderer/views/TokenStatsView.tsx:753`、`src/renderer/components/token-stats/RangePicker.tsx:50-53`、`src/renderer/components/ui/Button.tsx:17-24`、`src/renderer/styles/globals.css:12-20,161-211`
- 问题：`apply_accent` 只写根节点运行时变量 `--accent`，而本轮迁移后的 Agent DOM 仍消费静态 `--color-primary` / `--color-primary-container`，并大量消费源码中没有定义的 `--color-accent` / `--color-accent-ring`。因此切换到 purple、orange 等档位时，ECharts resolver 能从 `--accent` 解析并重绘图表，但品牌 dot、SessionTable 用量条和 primary button 仍保持蓝色；自定义时间范围 active border 与聚焦环使用未定义变量，声明失效。窗口内容 DOM 与图表产生可观察的强调色分叉，AC2 不成立。
- 建议：收口到同一动态语义入口，使 `primary`、`primary-strong`、`primary-container`、accent 与 focus ring 全部从当前 `--accent` 及其派生值解析；或把本轮迁移后的消费者统一改用已有动态变量，并覆盖五档 accent × light/dark 的 DOM 与图表联动。

### t272_code_f002 - sub-agent 标签迁移后丢失徽章形态

- 严重度：minor
- 锚点：AC1「Agent 窗口全部现存功能行为不变」及范围中「徽章种类原样保留」
- 位置：`src/renderer/components/token-stats/SessionTable.tsx:246-255`、`src/renderer/components/ui/Badge.tsx:29-43`
- 问题：旧实现的 `sub-agent` 使用 `chip sub`，带粉色文字、描边、浅色背景和间距；迁移后调用 `Badge variant="label"` 却不传 `color`，该分支只生成无背景/无描边且颜色为空的标签，并带一个不可见圆点。会话数据仍显示，但 sub-agent 来源标签不再保持原有徽章视觉。
- 建议：为该标签提供明确的 badge-tag 外观和有效颜色，或让 `Badge` 的无色 label 分支按设计 token 渲染灰底、三级文字色及可见状态点。

### t272_code_f003 - 未知 agent 颜色未按 primary 回退

- 严重度：minor
- 锚点：行为缺陷：出现未登记 agent source 时，识别色错误回退为中性灰
- 位置：`src/renderer/lib/echarts_token_resolver.ts:394-397`、`src/renderer/components/token-stats/SessionTable.tsx:258-267`
- 问题：`agent_color` 将未知 key 回退到 `palette.other`，而不是当前主题的 `primary`。例如输入未知 source `cursor-code` 时，`agent_color` 返回 muted 灰色；`SessionTable` 直接使用该结果渲染 agent 标签。当前设计约定未知 agent fallback 为 primary，未知数据源会丢失强调识别色。
- 建议：未知 agent 回退 `palette.accent`（或等价的当前 primary），保留四个已定义 agent 的专属 token。

## 结论

- 本轮新发现：3 条（1 important，2 minor）
- 未进表的提示：文件过大按规则只提示、不进 finding 表：`src/renderer/views/TokenStatsView.tsx` 1027 行（较基线 +135，达到实现源码 important 阈值）；`src/renderer/lib/echarts_token_resolver.ts` 429 行（新建，达到 minor 阈值）；`src/renderer/components/token-stats/SessionTable.tsx` 403 行（较基线 +10，达到 minor 阈值）。
- 总体判断：token-stats 旧体系文件与源码残留引用已清除，但全局 accent 切换后 Agent DOM 与图表仍会分叉，存在未解决 important finding。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-09 15:34 UTC+8)

### 前轮 finding 复核

- `t272_code_f001`：已消除。`src/renderer/styles/globals.css:173-178,211-215` 将 `--color-primary`、`--color-primary-container`、`--color-accent`、`--color-accent-ring` 接入动态 `--accent` 派生链；`src/renderer/lib/theme.ts:4-10,25-43` 在主题与 accent 入口递增 palette revision 并通知 canvas 消费者。DOM 与 ECharts 现共享当前 accent。
- `t272_code_f002`：已消除。`src/renderer/components/token-stats/SessionTable.tsx:249-255` 为 `sub-agent` Badge 提供 `var(--color-primary)`、浅色背景与边框，标签不再是无色空徽章。
- `t272_code_f003`：已消除。`src/renderer/lib/echarts_token_resolver.ts:394-397` 对未知 agent source 回退 `palette.accent`，不再回退中性灰。

### 本轮新发现

- 0 条。
- 完整 diff 未发现新的 critical / important；未发现满足 Pre-Report Gate 的 minor 实现缺陷或测试危险 anti-pattern。

### 验证证据

- 针对性 renderer 单测：8 个文件、128 tests 全部通过，覆盖 resolver、主题入口、ECharts palette 重绘、图表数据、热力图与 Agent 窗口。
- `pnpm test`：252 个测试文件通过，2745 passed、2 skipped（共 2747 tests）。
- `E2E_HEADLESS=1 pnpm exec playwright test tests/e2e/electron/panel_window_controls.spec.ts --config=playwright.config.ts --project=electron`：6 tests 中 5 passed、1 skipped；跳过项是 headless 环境无法可靠验证最小化/最大化状态，测试自身已标注限制。
- `pnpm build`：Electron main/preload/renderer 与 web bundle 全部构建通过。
- `pnpm check`：`typecheck` 与 `lint` 通过；`format:check` 因 11 个不属于本 task diff 的既有文件格式问题退出。随后独立运行 `pnpm deadcode` 通过，`pnpm arch` 通过（326 modules、852 dependencies）。
- `git diff --check` 通过；删除的三个 token-stats 体系文件不存在，`--ts-*` 变量、`ts-*` 类及旧 import 引用扫描均无结果。

### 结论

- 前轮 finding 复核：3 条均已消除，以上述当前 diff 与代码为准。
- 本轮新发现：0 条。
- 未进表的提示：按文件过大规则仅在此列出：`src/renderer/views/TokenStatsView.tsx` 1027 行（较基线净增 135 行，达到实现源码 important 阈值）；新建 `src/renderer/lib/echarts_token_resolver.ts` 429 行（达到 minor 阈值）；`src/renderer/components/token-stats/SessionTable.tsx` 404 行（较基线净增 11 行，达到 minor 阈值）。`src/renderer/lib/token-stats/chart-data.ts` 虽为 1208 行，本轮净减 16 行，不触发该规则。文件膨胀仅作结论提示，不作为 finding。
- 总体判断：当前 diff 已满足实现层 AC1–AC4；AC5 视觉人工抽查仍需 `[deploy]` 环境确认，不因该人工项阻断本轮 verdict。
- 系统性 follow-up：无；AC5 `[deploy]` 人工抽查属于本轮剩余验证，不形成系统性 task。

verdict: PASS
