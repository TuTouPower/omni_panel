# Task spec

## 背景

代理面板（Agent 面板，`TokenStatsView`）会话明细表（`SessionTable`）中，"工具"/"模型"两列及 sub-agent 标签均为 `Badge variant="label"` 形态，其前置渲染小圆点装饰（`Badge.tsx` label 分支）。用户要求这些值前不再出现圆点；同时删除表标题"会话明细"旁的"点击表头排序"提示文字。

## 契约区

### 范围

- `src/renderer/components/token-stats/SessionTable.tsx`：表头"会话明细"标题旁"点击表头排序"span 删除；"工具"列 agent 标签、"模型"列模型标签、sub-agent 标签三处 `Badge variant="label"` 去除前置圆点。
- `src/renderer/components/ui/Badge.tsx`：label 形态支持关闭前置圆点（新增 `dot` 开关，默认开启），保证未显式关闭的调用行为不变。

### 非范围

- 不改会话明细表的数据、排序、分页、筛选逻辑。
- 不改表头列名文字（会话/工具/工作目录/模型/调用/Tokens/缓存率/最近活跃）。
- 不改 `Badge` count 形态及其它组件（`StatusDot` 等）。
- 不动其它面板（用量/会话/设置）与数据模型。

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

- [ ] AC-001：会话明细表标题渲染"会话明细"，不再渲染"点击表头排序"文本。
- [ ] AC-002："工具"列 agent 标签内不渲染圆形点装饰元素。
- [ ] AC-003："模型"列每个模型标签内不渲染圆形点装饰元素。
- [ ] AC-004：sub-agent 标签内不渲染圆形点装饰元素。
- [ ] AC-005：`Badge` 组件未显式关闭圆点（未传 `dot=false`）时，label 形态仍渲染圆点，既有 `ui.test.tsx` 的 Badge 断言保持通过。
- [ ] AC-006：会话明细表既有行为测试（工具名文本、复选框、打开历史、分页、排序翻页清空）保持通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 用 testing-library 文本断言；AC-002/003/004 断言标签内无 `rounded-full` 圆形点 span；AC-005 由 `ui.test.tsx` 既有断言覆盖；AC-006 由 `session_table.test.tsx` 既有断言覆盖。

## 上下文区

- 来源：无（用户直接需求，2026-08-12）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 圆点的像素级视觉效果：依赖浏览器渲染，以 DOM 结构（是否存在圆点 span）断言代替。
- `Badge` label 形态在其它潜在调用点的渲染：当前全仓 `variant="label"` 仅会话明细表使用，无其它调用点可测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认：`tests/unit/renderer/components/token-stats/session_table.test.tsx` 渲染 `SessionTable` 断言；`tests/unit/renderer/components/ui/ui.test.tsx` 的 Badge 断言维持原样验证默认行为。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：删除圆点后 label 形态 `gap-1` 间距仍保留，视觉上标签内间距略大；改动低风险。
- 回退：改动为本地 UI 微调，撤销提交即恢复。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/specs/ai-cli-token-stats-ui.md`：核对会话表 ASCII 布局与描述，如含"点击表头排序"或标签圆点描述则同步删除。
- `docs/blueprint/DESIGN.md`（若存在 Badge label 圆点约定）：同步去圆点行为。
