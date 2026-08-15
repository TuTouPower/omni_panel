# Task spec

## 背景

DESIGN.md 合规审计（2026-08-16）发现按钮绕过组件层手拼的复制体 20 处，违反「业务代码里出现第三个复制体时收进组件」：

- 行内文字动作钮 7 处 4 文件：`provider_card_states.tsx:26-28`（常量 ACTION_CLS 复用 3 处，且用 `<span onClick>` 冒充按钮）、`ProviderAccountRow.tsx:204`、`SessionCard.tsx:94`、`SessionPane.tsx:167`、`PaneMessageRow.tsx:105`（展开钮，t408 会删）。
- icon 按钮 9 处 5 文件：`SessionPane.tsx:198-234` 同一字符串复制 5 次、`SessionPreview.tsx:54`、`SessionRail.tsx:99`、`SelectionDock.tsx:36`、`SelectionTray.tsx:133`。
- primary 复制体 2 处：`EmptyState.tsx:26`、`about_section.tsx:126`——根因是 Button 组件只渲染 `<button>`，web 场景需要原生 `<a>`。
- secondary 复制体 2 处：`AliasEditor.tsx:77/88` 同一字符串复制两次。

## 契约区

### 范围

- `ui/Button` 扩展能力：text/ghost 行内文字钮形态、icon 钮尺寸档（覆盖 22/26/28px 现用量）、`as`/link 渲染能力（输出 `<a>`）。
- 替换上述全部手拼复制体（t408 将删的展开钮除外）；`<span onClick>` 伪按钮改为语义 `<button>`。
- AliasEditor 两处 secondary 复制体走 Button（bg 差异用既有 variant 或组件 token 收敛，不新增散色）。

### 非范围

- 不新增按钮形态；只把现存形态收进组件层（DESIGN.md 形态保留原则）。
- 不改各按钮的点击行为与业务逻辑。
- 不改专用导航形态（页签/tab/侧边导航，无对应统一组件，保留）。

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

- [ ] AC-001：上述 20 处手拼按钮复制体全部替换为 `ui/Button`（或其扩展 variant），业务代码中不再存在同配方复制字符串。
- [ ] AC-002：`ui/Button` 支持渲染 `<a>`（as-link），web 两处 primary 链接钮改走组件。
- [ ] AC-003：不再存在 `<span onClick>` 伪按钮；全部可点击动作有 button/a 语义与键盘可达性。
- [ ] AC-004：按钮外观与点击行为不回归（组件测试 + [deploy] 目检抽查）。
- [ ] AC-005：现有测试套件不红。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~003/005：组件测试 + grep 可自动验证。
- AC-004 观感抽查标 `[deploy]`。

## 上下文区

- 来源：DESIGN.md 合规审计（2026-08-16）；规范条款：DESIGN.md 460-462（按钮形态）、496（形态保留）、504（第三处复制体收组件）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- Button 组件测试覆盖新 variant 与 as-link；替换点所在组件的既有测试保持通过；键盘可达性（Enter/Space 触发）补断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：Button 扩展 variant 影响所有现有使用点——新能力只做加法，既有 variant 默认渲染不变，组件测试兜底。
- 回退：git 还原即可。

### 依赖与约束

- 与 t408（删展开钮）有交集：展开钮不在本 task 范围；建议排在会话窗口批次（t407-t413）之后。

### Finalization 时更新的 blueprint

- 无
