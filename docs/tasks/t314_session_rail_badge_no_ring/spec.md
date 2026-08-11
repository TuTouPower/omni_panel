# Task spec

## 背景

会话窗口工作台 tab 左侧会话槽 rail（SessionRail）中，每个 agent icon（VendorMark logo）外套了一个 accent 色圆环（`ring-1 ring-[var(--agent-accent)]`），用户视觉上认为「icon 套圈」多余，要求去掉圆环，logo 干净展示（p140）。

## 契约区

### 范围

- `src/renderer/components/workspace/SessionRail.tsx:98` 的 `history-badge` 容器去掉 `ring-1 ring-[var(--agent-accent)]`，保留 `rounded-md`、`text-[var(--agent-accent)]` 与内部 VendorMark 渲染。
- `tests/unit/renderer/components/workspace/SessionRail.test.tsx` 补断言：`history-badge` 不含 ring class，防「套圈」回归。

### 非范围

- `SessionCard.tsx:39` 选中态卡片描边（语义不同，选中态保留）。
- 其余 VendorMark 调用点（ProviderNav/ProviderCard 等）样式。
- icon 尺寸、容器形状（rounded-md）调整。

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

- [ ] AC-001：会话窗口工作台 tab 会话槽 rail 中每个 `history-badge` 元素不含 `ring-1 ring-[var(--agent-accent)]` 类，agent logo 无 accent 圆环描边。
- [ ] AC-002：badge 仍渲染 VendorMark（logo 图标），各 source（claude_code/kimi_code/grok/opencode/未知）图标不因去圈而消失或变形。
- [ ] AC-003：`SessionRail.test.tsx` 新增断言覆盖 badge 无 ring 类（`className` 不含 `ring-` 前缀或明确断言无 ring class）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。AC-001/002 用 renderer 组件测试断言 `history-badge` className 与 VendorMark 渲染；AC-003 为测试本身新增断言。

## 上下文区

- 来源：p140（2026-08-11 核实：SessionRail.tsx:98 `history-badge` ring class；同类扫描仅此一处，SessionCard:39 为选中态卡片描边语义不同）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 圆形/方角视觉像素级效果：纯 class 断言覆盖存在性，像素细节留人工确认。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 复用现有 `SessionRail.test.tsx`「provider 徽标」用例，新增断言：`badge.className` 不含 `ring-` 前缀；同时保持 VendorMark `data-testid="vendor-mark"` 存在断言不变。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无（纯 CSS class 移除，无外部契约）。

### 风险与回退

- 风险：去掉 ring 后 badge 与背景对比度变化（`text-[var(--agent-accent)]` 保留，图标色不受影响）。
- 回退：单行 class 改动，恢复 ring class 即还原。

### 依赖与约束

- 无前置 task；不依赖 t308/t309/t310（本次为独立视觉修复）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：无（纯 UI 样式，不改架构；如涉及组件样式约定可补一句「无」）。
