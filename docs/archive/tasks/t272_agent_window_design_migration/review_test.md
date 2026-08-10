# Task review t272（reviewer_focus: 测试）

- task：`t272_agent_window_design_migration`
- spec：`docs/tasks/t272_agent_window_design_migration/spec.md`
- diff_anchor：`755b0b01d272894a1b266c5896e71d3177df0699`
- target：`git diff 755b0b01d272894a1b266c5896e71d3177df0699`
- round：1
- reviewed_at：2026-08-09 14:55 UTC+8

## Findings

### t272_test_f001 - AC2/AC3 图表重绘触发源（theme.ts 接线点）无测试

- 严重度：minor
- 锚点：AC2「强调色随全局五档切换即时生效（含图表配色重绘）」、AC3「明暗主题切换后 DOM 与图表配色同步变化」
- 位置：`src/renderer/lib/theme.ts:9,43`（新增 `notify_chart_palette_change()` 调用）；缺口在 `tests/unit/renderer/lib/theme.test.ts`
- 问题：本 diff 新增的图表重绘链路是「theme.ts 真实入口（`apply_theme` / `apply_accent`）→ `notify_chart_palette_change()` → revision 递增 → useECharts `setOption`」。但新增的两个测试均绕过 theme.ts 直接调用 `notify_chart_palette_change()`：`use_echarts_lazy.test.ts:86-103` 验证「notify → setOption 重绘」，`palette.test.ts` 验证「notify → revision/subscriber」；`theme.test.ts` 只断言 `--accent` 变量与 `data-theme` 属性，未断言 notify 副作用。若 `theme.ts` 中删除 notify 调用，或 `apply_theme` 的早退判断（`if (data-theme === next) return`）写错导致该切换不再 notify，现有全部测试仍然通过，而真实主题/accent 切换后图表不重绘——AC2/AC3 失效不可见。各段机制均有单测，非 AC 完全无测试，不满足 blocking 硬阈值。
- 建议：`theme.test.ts` 补断言——`apply_accent("#3d7afd")` 与 `onThemeChange` 回调触发后，`get_chart_palette_revision()`（从 `echarts_token_resolver` 导入）较切换前递增。

### t272_test_f002 - palette.test.ts 重写丢失 t205 heat 无相邻重复显式断言

- 严重度：minor
- 锚点：AC1「Agent 窗口全部现存功能行为不变」（t205 heatmap 8 档色可区分约束为既有行为）
- 位置：`tests/unit/renderer/lib/token-stats/palette.test.ts`（整体重写）
- 问题：旧 `palette.test.ts` 有显式断言「exposes 8 ascending positive heat colors with no adjacent dupes (t205)」（逐对 `expect(heat[i]).not.toBe(heat[i-1])`）。旧模块 `palette.ts` 删除、测试整体重写为 resolver 测试是合法替换，但该约束未等价保留：fallback 路径只 `toEqual(DEFAULT_CHART_PALETTES.dark)`（与实现同源，不检查相邻重复）；resolve 路径仅靠 fixture 的 8 个不同 mock 值间接覆盖。若 `FALLBACK_PALETTES.heat` 或 CSS token 映射未来退化为相邻同色，无测试红。
- 建议：fallback 测试补「`heat[i] !== heat[i-1]`（i=1..7）」断言，或保留一份具体色值锚定。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无「迁就实现」改测。全部改动均属合法迁移：Segmented/token_stats_view 的 `.on` 类断言 → `aria-pressed`（旧组件删除、新 `ui/Segmented` 既有可观察契约，且新增 disabled 断言）；heatmap_option/chart-data 的 `PALETTES` → `DEFAULT_CHART_PALETTES`（断言逻辑不变，输入来源随模块迁移）；palette.test.ts 整体重写覆盖新模块（旧模块已删）。
- 本轮新发现：2 条（均为 minor）
- 未进表的提示：
    - `chart-data.test.ts:113-116,176-180,195-196,305-306` 颜色断言由硬编码具体值改为引用 `DEFAULT_CHART_PALETTES`（被测模块自身导出），断言与实现同源。已核可辩护：行为契约（top5 按序用 series[0..4]、other 用 other、theme 参数敏感——dark/light 反转仍会使断言失败）保持；且新架构下真实色值由 CSS token 提供，jsdom 不加载 CSS，具体值本就无法在单测锚定。若需更强的色板回归护栏，可在 resolver 测试补一份 DESIGN 收敛后的具体值锚定，非本 task 阻断。
    - `palette.test.ts` 验证了 `subscribe_chart_palette_revision` 生效与 `notify` 触发，但未断言 `unsubscribe()` 后不再收到通知（可加 case）。
    - 组件层（BarChart/Heatmap/MetricDonut）无「revision/theme 变化 → option 以新 palette 重建」组件级测试；机制由 use_echarts_lazy + palette 分段覆盖，属可选扩展。
    - 范围外观察：`?? .electron-cache/` 未跟踪目录未被 `.gitignore` 覆盖（repo hygiene 建议，与本 task 无关）。
- 总体判断：AC 覆盖充分（AC1 由 view/table/range/tooltip/chart-data 既有回归保持；AC2/AC3 由 theme DOM 变量 + resolver 解析 + notify→setOption 分段覆盖；AC4 删除无残留经 grep 实证：`--ts-*` 零残留、`.ts-*` 类零残留、文件删除、import 为零；AC5 为 deploy 人工项）。危险模式扫描无命中（mock 均在系统边界或符合 spec 测试策略「被 mock 掉的图表改经 resolver 层断言」）。仅 2 条 minor，无未解决 blocking。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-09 15:36 UTC+8)

### 前轮 finding 复核（以 diff 与实跑为准，不采信处置表）

- **t272_test_f001（minor）已修**：`tests/unit/renderer/lib/theme.test.ts:70-86` 新增「真实主题入口切换时递增图表 palette revision」——`useTheme` 挂载初始 apply 后 revision 递增，`theme_cb(true)`（onThemeChange 真实回调）后 `expect(revision).toBe(before + 1)`；`:128-132` 新增「真实 accent 入口切换时递增图表 palette revision」——`apply_accent("#ff8800")` 后 revision +1。两条均走 `theme.ts` 真实入口 → `notify_chart_palette_change()` 链路，不再是直接调 notify。focused 跑 + 完整套件 + 连跑 3 次均绿，无 MutationObserver 双增导致的时序脆弱（异步 increment 被同步断言吸收，确定性成立）。
- **t272_test_f002（minor）已修**：`tests/unit/renderer/lib/token-stats/palette.test.ts:101-106` fallback 分支对 dark/light 双 palette 断言 `heat` 长度 8 且 `palette.heat[i] !== palette.heat[i-1]`（i=1..7），与 Round 1 建议一致；resolve 路径仍由 fixture 8 个不同 token 值覆盖。

### 改测方向复核

本轮改动仅 theme.test.ts / palette.test.ts 的**新增断言**（无修改既有预期），无「迁就实现」改测。Round 1 已核的 `.on`→`aria-pressed`、色值断言→`DEFAULT_CHART_PALETTES` 引用等属组件替换/模块迁移的合法换源，结论维持。

### 本轮新发现

0 条。危险模式扫描全过：新增断言均精确比较（`toBe`/`toEqual`/`toBeGreaterThan`），无恒真/弱化/删反转/注释断言、无 skip/only、无 test 文件 eslint-disable/@ts-ignore；断言增删逐文件核对（Segmented +3/-2、heatmap_option +1/-1、use_echarts_lazy +2/-0、theme +4/-0、chart-data +6/-6、palette 重写 +22/-24、token_stats_view +10/-10），无净删断言。mock 均在系统边界（echarts 动态加载、getComputedStyle、usageboard 全局），符合 spec 测试策略。

### 测试/检查证据（Round 2 实跑）

- `pnpm test`：252 文件 / 2745 passed / 2 skipped（opencode probe 与 build 产物条件跳过，既有，与本 diff 无关）。
- `pnpm typecheck`、`pnpm lint`（--max-warnings=0）、prettier check：全绿。
- 无头黑盒：`E2E_HEADLESS=1` 跑 `panel_window_controls.spec.ts` → 5 passed / 1 skipped（最小化/最大化按 t280 门控「仅 headed」合法跳过）。Agent 窗口在真实 Electron 无头模式打开、`.token-stats` 渲染、系统标题「Omni Panel - Agent」、无原生菜单、`.panel-titlebar` 拖拽区、关闭销毁、copy/paste 快捷键均过——覆盖迁移后窗口外壳与内容加载。
- 完整 electron 套件（无头）：52 passed / 8 skipped / 2 failed。两失败均为 usage popup 用例（`popup_multi_display` 首窗口、`popup_collapse_persistence` 重启后首窗口），失败签名同为 `electronApplication.firstWindow: Timeout 30000ms`（应用启动超时，非行为断言失败）；隔离复跑两文件 → 3 passed 全过。t272 diff 不触 main 进程、不触 usage popup 渲染路径（PopupPage.waitReady 等 `.app-title`，为 t270 已迁移产物），判定为全量串行下的启动时序 flake，非本 diff 回归。
- AC4 残留实证（重跑）：`--ts-*` 零引用、`token-stats.css`/`palette.ts`/token-stats `Segmented.tsx` 删除且 import 为零；`ts-*` 类扫描仅命中 `pointer-events-` 子串误报，逐一排除。

### 未进表的提示

- `popup_multi_display` / `popup_collapse_persistence` 在全量串行跑时偶发 firstWindow 30s 超时（隔离通过）；建议 t280 门控侧评估提高 testTimeout 或补跳过守卫，范围外（非本 task 引入），不阻断。
- useECharts 的 MutationObserver 兜底路径（web 模式 class 变化 → revision 递增）无单测；主路径（theme.ts notify）已测，属可选扩展。
- 范围外沿用 Round 1：`.electron-cache/` 未跟踪目录未入 `.gitignore`（repo hygiene，与本 task 无关）。

### 总体判断

前轮 2 条 minor 均已按建议修复并经实跑验证（f001 走真实入口断言 revision 递增；f002 补 heat 相邻不重复）；AC1/2/3 覆盖链路完整（view 回归 + resolver 单测 + theme 真实入口 + notify→setOption 重绘 + 无头 e2e 窗口级证据），AC4 grep 实证无残留，AC5 为 deploy 人工项；无新危险模式命中。无未解决 critical / important。

### 系统性 follow-up

无

verdict: PASS
