# Task spec

## 背景

DESIGN.md 合规审计（2026-08-16）发现选择类控件绕过组件层：

- 自绘选择框 3 处：`SessionRow.tsx:38-53` 与 `SessionCard.tsx:130-144` 同配方（20px 方块，选中 `bg-agent-accent` + ✓）、`RecentSessionsModal.tsx:134-142` 变体（`border-[1.5px]` + 序号）——`ui/Checkbox` 是 16px 原生配方，不覆盖这些形态。
- 手拼分段控件 3 处：`SessionLibrary.tsx:444-475`、`ProviderCard.tsx:160-195`（用 `role="tablist"` 且含 `rounded-[7px]`/`[9px]` 档外圆角）、`ProviderAccountRow.tsx:255-275`——`ui/Segmented` 组件现成可用。
- 手拼菜单：`WorkspaceToolbar.tsx:84-135` 自拼 glass-menu 容器 + 菜单项，且菜单项 hover 用 `surface-raised` 而非 DESIGN 规定的蓝底白字（`ui/MenuItem` 已合规）。

## 契约区

### 范围

- 选择框统一：`ui/Checkbox` 扩展 20px/accent 着色/序号态能力（或新 variant），替换 3 处自绘选择框；保留各形态的视觉差异（形态保留原则）。
- 分段控件统一：3 处手拼分段替换为 `ui/Segmented`；档外圆角随之收敛。
- `WorkspaceToolbar` 菜单替换为 `ui/Menu`/`MenuItem`，菜单项 hover 回归蓝底白字规范。

### 非范围

- 不改选择/多选/分段切换的业务行为与数据流。
- 不删除任何现存形态；形态差异由组件 variant 承载。
- 不动 Dialog 体系（已合规）。

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

- [x] AC-001：3 处自绘选择框替换为统一组件，选中/未选中/序号态外观与行为不回归（shift 多选等既有交互保留）。
- [x] AC-002：3 处手拼分段控件替换为 `ui/Segmented`，切换行为不回归，档外圆角消除。
- [x] AC-003：`WorkspaceToolbar` 菜单走 `ui/Menu`/`MenuItem`；菜单项整行 hover 为蓝底白字。
- [ ] AC-004：[deploy] 人工目检上述控件的各形态外观无肉眼退化。
- [x] AC-005：相关测试更新并通过，现有套件不红。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~003/005：组件测试可自动验证（含 shift 多选交互）。
- AC-004 观感标 `[deploy]`。

## 上下文区

- 来源：DESIGN.md 合规审计（2026-08-16）；规范条款：DESIGN.md 470-474（表单/菜单组件配方）、496（形态保留）、504（复制体收组件）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 既有 SessionRow/SessionCard/RecentSessionsModal 选择交互测试随组件替换更新；Segmented 既有测试保持通过；菜单项 hover 色断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：Checkbox/Segmented 扩展 variant 影响现有使用点——只做加法，默认渲染不变。
- 回退：git 还原即可。

### 依赖与约束

- 与 t408/t409（消息选择交互改动）有交集，建议排在会话窗口批次之后；与 t420 同属组件层收拢，可相邻排期。

### Finalization 时更新的 blueprint

- 无
