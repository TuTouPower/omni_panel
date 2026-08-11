# Task spec

## 背景

`src/renderer` 11 处使用 `text-label-sm`（TokenStatsView、SessionTable、Segmented），但 `globals.css` `@theme` 未定义 `--text-label-sm`（字号档只有 label-md 11.5px / label-caps 10.5px），Tailwind 4 下该类不生成字号 CSS，实际渲染等价于继承父级字号。DESIGN.md 规定字号收敛九级且禁止自造第九级以外的字号，故不补 token，而是把各位置按语境归级到现有字号档。属存量失效类，非 t302 引入。

## 契约区

### 范围

- 替换 `src/renderer` 内全部 `text-label-sm` 类名为现有九级字号档内的类，归级映射：
    - `TokenStatsView.tsx` 增量指示（▲▼ pp 行，`font-mono`）：`font-mono text-body-sm`
    - `TokenStatsView.tsx` updatedAgo / refreshing / error 状态（`font-mono`）：`font-mono text-label-caps`
    - `SessionTable.tsx` slug 列表次行：`text-body-sm`
    - `SessionTable.tsx` 内嵌徽章：`text-label-caps`
    - `Segmented.tsx` sm 尺寸：`text-body-sm`
- 因类名断言失效而需同步更新的组件测试

### 非范围

- 不新增 `--text-label-sm` 或任何第九级以外的字号 token，不改 DESIGN.md 字号层级
- 不处理其他失效类或 DESIGN 对照差异（t301 及其余 pending 条目范围）
- 不做归级映射以外的视觉重设计

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

- [ ] AC-001：`src/renderer` 全仓 grep `text-label-sm` 命中 0 处。
- [ ] AC-002：`globals.css` `@theme` 字号档保持九级，未新增 `--text-label-sm` 或其他新字号档。
- [ ] AC-003：替换后各处类名与「范围」节归级映射一致（可经组件测试或源码断言逐处核对）。
- [ ] AC-004：TokenStatsView、SessionTable、Segmented 相关既有测试全绿（含因类名变更同步更新的断言）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试：AC-001/AC-002 经 grep 断言；AC-003 经源码核对或组件测试；AC-004 经既有测试套件。

## 上下文区

- 来源：p127（2026-08-11 核实：问题仍存在，`src/renderer` 11 处使用 `text-label-sm`，`globals.css` 无对应 token；确认不补 token，改归级到现有档）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认；涉及类名断言的既有组件测试随替换同步更新，新增覆盖新语义的断言（禁止就地把旧测试预期改成当前实现输出而无新语义覆盖）

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：失效类当前无字号效果，替换后渲染字号从继承值变为 token 值，属语义归位但视觉可能有细微变化；归级映射个别位置（如 Segmented sm）实施期需视觉核对
- 回退：git revert 执行 commit

### 依赖与约束

- DESIGN.md 字号九级收敛约束：不得自造第九级以外的字号

### Finalization 时更新的 blueprint

- 无
