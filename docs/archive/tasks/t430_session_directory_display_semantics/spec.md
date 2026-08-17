# Task spec

## 背景

（1）rollup ready 路径 `dashboard_session_page_from_meta` 按 session 聚合时 directory 取 `MAX(directory)`（字典序）；records 路径 `materialize_session_meta` 取最新记录目录——跨多 directory 会话两条路径展示不一致。（2）frontend_demo 的 `CwdPath` 显示完整路径过长，用户要求只显示 basename（最后一段），title 保留完整路径；demo 内 4 处使用点随组件一并生效。

## 契约区

### 范围

- **生产 token-stats**：统一 rollup 与 records 两条路径的 directory 展示语义为「最新记录目录」；同步 rollup 分支实现与测试。
- **frontend_demo**：`public/frontend_demo/app/src/components/CwdPath.tsx` 渲染永远只显示 basename；title 悬浮完整路径；SessionCard 底行 filePath 不动；4 处使用点（SessionCard/SessionPane/RecentSessionsModal/SessionPickerModal）一致。

### 非范围

- 不改会话/记录聚合数字、分页行为、directory 存储。
- 不改 SessionCard filePath 展示、不改数据模型。
- 不把 demo CwdPath 强行迁入 `src/renderer`（本 task 改 demo 组件本身）。

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

- [ ] AC-001：rollup ready 路径下跨多 directory 会话的 directory 展示与 records 路径一致（取最新记录目录）。
- [ ] AC-002：单 directory 会话展示不变（回归）。
- [ ] AC-003：dashboard_session_page_from_meta 分页与会话计数不受影响（与改动前一致）。
- [ ] AC-004：CwdPath 对完整路径只渲染最后一段目录名（如 `/home/…/repo_template` → `repo_template`）。
- [ ] AC-005：CwdPath 的 title 属性保留完整路径（悬浮可查）。
- [ ] AC-006：demo 内 4 处使用点渲染一致（组件级改动）；SessionCard 的 filePath 行展示不变。
- [ ] AC-007：根路径（如 `/`）与空 cwd 不崩溃（实现定义兜底，如显示原值）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~003：可自动测试（store 层 fixture）。
- AC-004~007：`public/frontend_demo/app` 无 vitest/组件测基建；替代验证：`pnpm build`（demo 包）通过 + dev server 手动验证 4 处与 title/根路径/空 cwd。

## 上下文区

- 来源：p184（directory 语义）；p194（CwdPath basename）；merge t430+t431。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- demo CwdPath 自动组件测：无测试基建（见可测试性声明）。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- store：token-stats-store.test.ts 构造同 session 多 directory 记录与 meta 路径对照。
- demo：`pnpm build` + 手动 4 处与边界 cwd。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。SPIKE 验证（2026-08-17）：rollup 分组按 directory 聚合、无记录级时间维度；但 rollup 路径 `materialize_session_meta(from_records=false)` 的逐会话窄查（`meta_stmt`，`rn=1`）已从 records 取每会话最新记录，可顺带 SELECT 最新 `directory` 并 UPDATE 进 session_meta——`dashboard_session_page_from_meta` 的 `MAX(directory)` 即返回最新目录，无需改存储。

### 风险与回退

- 风险：rollup 路径无时间戳时取最新目录的实现复杂度。
- 风险：basename 对同目录名会话有歧义（用户已接受）。
- 回退：rollup 保留 MAX(directory)；CwdPath 还原。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
