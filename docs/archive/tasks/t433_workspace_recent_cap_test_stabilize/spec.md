# Task spec

## 背景

`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx` 三处弹窗用例依赖同步 fireEvent 后 DOM 立即就绪，缺 waitFor/findBy 稳定化，偶发 flake。根因：`RecentSessionsModal` 列表由异步 `getSessions().then(set_sessions)` 渲染，p559 用例 `await waitFor(dialog)` 只等 dialog 挂载不等列表，随后同步 `querySelectorAll('[data-testid="session-recent-row"]')` 读空数组不抛错 → 静默 0 次点击 → `.on` 计数 0≠8。同类位点 3 处：:559-575（主点，静默失败）、:367-380（会话选择弹窗 getByText 同步）、:492-523（picker 同步断言）。已扫无其它（SessionLibrary 全 waitFor、SessionShell 无列表断言）。

## 契约区

### 范围

- 仅改测试文件 `tests/unit/renderer/components/workspace/WorkspaceView.test.tsx` 三处用例的断言时机（等列表元素出现再交互），断言强度不减；不碰生产代码。

### 非范围

- 不改生产组件。
- 不降断言（如不把计数 8 改为 0 容忍）。
- 不删用例。

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

- [ ] AC-001：:559 主点改 `await waitFor(() => expect(querySelectorAll('session-recent-row')).toHaveLength(9))`（或 findAllByTestId）后再交互，上限 8 计数断言保持。
- [ ] AC-002：:367 改 `await screen.findByText("会话 s1")`、:492 改 `await waitFor(() => expect(screen.getByText("全部 3")))`（或等价 findBy），断言目标不变。
- [ ] AC-003：`WorkspaceView.test.tsx` 全量通过；循环多次（如 --repeat 5）无 flake。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（vitest）。

## 上下文区

- 来源：p191（2026-08-16 分析：根因已定位——异步 getSessions 渲染与同步断言竞态致静默 0 次点击）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- waitFor/findBy 等元素出现（参照同文件 :350-354/:537 已稳定化用例范式）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：waitFor 条件写错使用例恒真或恒挂——断言须维持原计数/文本强度。
- 回退：还原断言。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
