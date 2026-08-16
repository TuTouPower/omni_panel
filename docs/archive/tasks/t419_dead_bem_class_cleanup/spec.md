# Task spec

## 背景

DESIGN.md 合规审计（2026-08-16）发现 13 个 tsx 组件中残留 120+ 处 BEM 风自定义类名（`conversation-*`/`session-*`/`library-*`/`selection-*`/`preview-*` 前缀），且**全部无样式定义**——globals.css 与两个 index.html 的内联 style 均无这些选择器，是历史 CSS 清零后遗留的命名挂钩。死类名误导阅读（看似有样式来源）、阻碍后续维护。涉及文件：`SessionPane.tsx`、`PaneMessageRow.tsx`、`SessionShell.tsx`、`SessionRail.tsx`、`WorkspaceView.tsx`、`WorkspaceToolbar.tsx`、`SessionPickerModal.tsx`、`RecentSessionsModal.tsx`、`SessionLibrary.tsx`、`SessionCard.tsx`、`SessionRow.tsx`、`SessionList.tsx`、`AgentFilterChips.tsx`、`SelectionTray.tsx`、`SelectionDock.tsx`、`SessionPreview.tsx`。

## 契约区

### 范围

- 删除上述前缀的无定义类名（className 字符串中的死挂钩）。
- 删除前扫描 `tests/`（unit/e2e/smoke/integration）是否用这些类名做 selector：被引用的改为 `data-testid` 或语义 selector 后再删类名。
- 与既有测试断言风格保持一致（项目已有 getByRole/data-testid 惯例）。

### 非范围

- 不改任何 Tailwind utility 类与视觉表现（死类名本就无定义，删除不改变渲染）。
- 不删除有实际定义的类名（如有遗漏定义点，先核对再处理）。
- 不改组件逻辑与结构。

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

- [ ] AC-001：`conversation-`/`session-`/`library-`/`selection-`/`preview-` 前缀的无定义类名在 src 中清零（grep 可证；有定义的类名除外并在实施笔记列出）。
- [ ] AC-002：原引用这些类名的测试/e2e 全部改毕并通过；无测试因类名删除而失效。
- [ ] AC-003：现有单测与 e2e 全部通过。
- [ ] AC-004：[deploy] 抽查会话窗口主要界面渲染无变化（类名本就无样式定义，预期零视觉差异）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~003：grep + 测试套件可自动验证。
- AC-004：预期零视觉差异，抽查标 `[deploy]`。

## 上下文区

- 来源：DESIGN.md 合规审计（2026-08-16）；规范条款：DESIGN.md 370（清零手写 CSS）、501（BEM 类退役）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 先 grep tests/ 引用清单，逐点改 selector；删类名后跑全量单测 + e2e。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：个别类名可能被脚本/外部工具（如 playwright 脚本、debug 工具）引用——grep 范围含 scripts/ 与 tests/，引用点全部迁移后再删。
- 回退：git 还原即可。

### 依赖与约束

- 与 t407-t413、t415 同触会话窗口文件，冲突面大：建议排在会话窗口批次**之后**执行（等结构稳定后一次性清），或最先执行清出干净 diff——由 task-schedule 定夺。

### Finalization 时更新的 blueprint

- 无
