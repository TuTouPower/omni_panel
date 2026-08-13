# Task spec

## 背景

会话面板（SessionShell 工作台视图）侧边栏与槽位卡片背景色层级违反 DESIGN.md 中性灰阶约定：侧边栏用 `--color-surface`（桌面衬底最深色 #0c0e13）而非 Settings 侧边栏的浅混色；槽位卡片用 `--color-surface-window`（#181b22）与主面板背景同色，导致卡片与面板「连成一片、无间隔」，没有「浅色卡片突出 + 深色间隙」的层级。其他面板（Settings/TokenStats）侧边栏用混色、卡片走 `ui/Card`（surface-card/raised）。

## 契约区

### 范围

- `src/renderer/components/workspace/SessionRail.tsx:32`：侧边栏背景从 `bg-[var(--color-surface)]` 改为 Settings 同款混色 `bg-[color-mix(in_srgb,var(--color-surface-window)_70%,var(--color-surface)_8%)]`。
- `src/renderer/components/session-shell/SessionShell.tsx:51`：rail-toggle 背景从 `bg-[var(--color-surface)]` 改为同款混色（与 t380 的 rail-toggle 下移改动兼容；若 t380 先合，本 task 只校验背景色）。
- `src/renderer/components/workspace/SessionRail.tsx:63`：槽位卡片背景从 `bg-[var(--color-surface-window)]` 改为 `bg-[var(--color-surface-card)]`（或 `raised`，与 SessionCard/SessionPane 卡片一致）。
- 空槽位保持 `bg-transparent` + dashed 边框不变。

### 非范围

- 不改标题栏统一（t380）、不改薄包装壳（t382）。
- 不改 SessionPane 大纲抽屉的 `bg-surface-window`（浮层，属合理用法）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：会话侧边栏（`.session-rail`）渲染 className 含混色背景 token（`color-mix` + `surface-window`），不含 `bg-[var(--color-surface)]`（桌面衬底色）。
- [ ] AC-002：会话槽位卡片（`.session-slot` 非空态）渲染 className 含 `--color-surface-card` 或 `--color-surface-raised`，不含 `bg-[var(--color-surface-window)]`。
- [ ] AC-003：rail-toggle 按钮渲染 className 含混色背景 token，不含 `bg-[var(--color-surface)]`。
- [ ] AC-004：空槽位仍为 `bg-transparent` + dashed 边框，不受影响。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：渲染输出 DOM className 断言即可覆盖，无需真实布局/视觉。

## 上下文区

- 来源：p150（`docs/pending/todo/p150_popup_titlebar_panel_button_order.md`，追加二：会话面板背景色层级不统一）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实视觉对比（像素级截图）：jsdom 无法渲染视觉，不新增；靠 className token 断言保证语义正确。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 参照 `session_typography.test.tsx` 的渲染输出断言范式：render `SessionRail` / `SessionShell`，对 `.session-rail` / `.session-slot` / `.session-rail-toggle` 的 className 做包含/排除断言。mock `window.usageboard` 用现有测试桩。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：混色值在不同主题下视觉不符预期（但语义与 Settings 侧边栏一致，风险低）。
- 回退：git 回退 className 改动。

### 依赖与约束

- 与 t380（标题栏统一）在 `SessionShell.tsx:51` 相邻但非重叠（t380 只做 rail-toggle 下移，本 task 只改背景色）；若并行有冲突，t380 先合、本 task 合并时校验背景色即可。

### Finalization 时更新的 blueprint

- 无（背景色 token 已遵循 DESIGN.md 既有约定，无需新增条目）。
