# Task spec

## 背景

前端 demo 会话卡片 cwd 显示完整路径（如 /home/testuser/testuser_ubuntu/repo_template）过长，用户要求只显示最后一段目录名（repo_template）。改动组件 `public/frontend_demo/app/src/components/CwdPath.tsx`，全局 4 处使用（SessionCard/SessionPane/RecentSessionsModal/SessionPickerModal）同步生效。注意这是 frontend_demo（demo 应用），非 src/renderer 生产树。

## 契约区

### 范围

- CwdPath 组件渲染改为永远只显示 basename（路径最后一段）；title 悬浮保留完整路径；SessionCard 底行 filePath 展示不动。

### 非范围

- 不改 filePath 展示。
- 不改数据模型。
- 不改其他组件。

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

- [ ] AC-001：CwdPath 对完整路径只渲染最后一段目录名（如 /home/testuser/testuser_ubuntu/repo_template → repo_template）。
- [ ] AC-002：title 属性保留完整路径（悬浮可查）。
- [ ] AC-003：4 处使用点渲染一致（组件级改动即全局）；SessionCard 的 filePath 行展示不变。
- [ ] AC-004：根路径（如 / ）与空 cwd 的处理不崩溃（实现需定义兜底，如显示原值）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 不可自动测试：已核实 `public/frontend_demo/app` 无测试基建（package.json 仅 dev/build/lint/preview，无 vitest/组件测试框架，无测试文件）。替代验证：`pnpm build`（tsc -b + vite build）通过 + dev server 手动验证 4 处使用点与 title 悬浮。

## 上下文区

- 来源：p194（用户提出；2026-08-16 登记，CwdPath 现状=完整路径中间截断 truncateMiddle，title 悬浮完整路径）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按 demo 现有范式：无测试基建，以构建（`pnpm build`）与 dev server 手动验证替代（4 处使用点 + 根路径/空 cwd 兜底）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：basename 对同目录名会话有歧义（已确认用户接受）。
- 回退：还原组件。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
