# Task spec

## 背景

会话工作台顶部工具栏的 actions 只占约 199px 内容宽，1280px 窗口下右侧留白约 83%；工具栏自身 `py-2 + h-8 + border` 高 49px，按钮下方 9px 空白与同色 body 融合，形成“panel 上方空一行”的观感。SessionRail toggle 仅 34px，与工具栏高度相差 15px。p141 已通过真实 `--cli serve` 渲染、几何测量与截图确认；无结构性 body 间隙。

## 契约区

### 范围

- 让 WorkspaceToolbar actions 占满可用宽度并将控制组靠右排列，消除工具栏右侧无意义留白。
- 收紧工具栏纵向留白，使按钮行与工具栏边界紧凑，不再形成额外空白带。
- 统一 SessionRail toggle 与工作台工具栏的顶部和高度，使 rail 与会话 grid 从同一水平基线开始。
- 增加 DOM class 回归测试与 web e2e 几何断言。

### 非范围

- 不修改会话窗口根背景、卡片背景或 grid 卡片间距；这些由 t315 处理。
- 不调整 SessionLibrary、SessionPane、弹窗或其他面板工具栏。
- 不改变“最近会话 / 清空 / 视图”按钮功能与顺序。

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

- [ ] AC-001：工作台工具栏 actions 宽度占满工具栏可用区域，最右侧控制与工具栏右内边距对齐，不再在控制组右侧留下大段空白。
- [ ] AC-002：工具栏按钮行上下留白对称且紧凑；工具栏底边与工作台 body 顶边相接，不出现额外空白行。
- [ ] AC-003：SessionRail toggle 与工具栏顶边、底边对齐，高度差不超过 1px；会话 grid 顶部与 rail 内容区从同一水平基线开始。
- [ ] AC-004：“最近会话 / 清空 / 视图”按钮行为、顺序及工作台布局切换功能保持不变。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：组件测试断言修复后的布局 class；web e2e 在固定 viewport 下读取 bounding box 验证工具栏、body、rail toggle 与 grid 边界。

## 上下文区

- 来源：p141（2026-08-11 实渲染核实：toolbar actions flex-grow=0、工具栏高 49px、rail toggle 高 34px；已扫无其他同因位点）
- 已确认修复面：`WorkspaceToolbar.tsx`、`WorkspaceView.tsx`、`SessionRail.tsx` 同一工作台布局。
- 与 t315 关系：不共享行为范围，但会编辑相邻会话组件，调度时禁止并行以避免合并冲突。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 不做任意 viewport 的像素快照矩阵：固定代表性 viewport 的几何断言覆盖结构，响应式由现有布局规则负责。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 组件/样式测试：沿用 session_typography 的 DOM class 断言方式，确认 actions 包含占满与右对齐规则、toolbar 纵向 padding 收紧、rail-toggle 使用同高规则。
- web e2e：固定 1280×800，断言 toolbar actions 右边界接近 toolbar 右内边距；`body.top == toolbar.bottom`；rail-toggle 与 toolbar 高度差 ≤1px；grid 与 rail 内容顶边一致。
- 行为回归：复用 WorkspaceView/SessionRail 现有测试，确认最近会话、清空、视图切换与 rail 折叠行为不变。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：工具栏高度变化影响会话窗口可用高度，或与 t315 的背景/间距改动产生相邻 diff 冲突。
- 回退：布局改动限定于工作台三处 class；发生回归时恢复原高度与 flex 规则，不影响会话数据和交互状态。

### 依赖与约束

- 与 t315 冲突但无前置依赖，必须串行执行。

### Finalization 时更新的 blueprint

- 无。
