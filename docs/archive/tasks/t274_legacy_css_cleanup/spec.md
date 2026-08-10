# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

四个窗口全部迁移后（t270–t273），手写 BEM 类应已大部删除，但仍存在：globals.css 中跨窗口残留的手写组件类、手绘 SVG 图标集与 lucide 双轨、vendor logo 明暗切换的旧机制、web 版与桌面版的样式一致性未核对。本 task 做最终清零与收口。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 全局样式入口清零：仅保留 token 层、`@utility` 与极少量无法工具化的基础样式；残留手写组件类全部删除或收编，grep 可证。
- 图标按三类收口：操作/导航图标整体替换为 lucide-react，删除手绘 SVG 图标集；vendor logo 与品牌 mark 保留资产文件（明暗双份切换封装进组件），不属于清零范围；图表/sparkline 等数据可视化 SVG 不属于图标，不动。
- web 版（`src/web`）视觉与交互 parity 收口：同 token 渲染、样式加载差异修复；web bridge 中主题为 noop 的接口（主题三档、accent 切换与恢复）补齐真实实现或明确降级的用户可见行为，保证设置页切换主题/accent 在 web 版即时生效且刷新后保持。
- 更新 `docs/blueprint/` 相关条目（样式架构、约定、测试命令受影响处）与 `AGENTS.md` 中受影响表述；DESIGN.md 与实现对齐修订（如有执行期偏差）。

### 非范围

- 不新增组件形态、不改业务功能。
- 不重构与样式无关的代码。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 全局样式入口中不再有业务组件级手写类（grep 白名单可证）；全部窗口渲染无样式缺失。
- [ ] 操作/导航图标全部来自 lucide-react，旧手绘图标实现已删除且无残留引用；vendor logo 与数据可视化 SVG 不受影响的证据保留。
- [ ] web 版与桌面版同窗口视觉一致（同 token、同组件）；web 版设置页切换主题三档与五档 accent 即时生效、刷新后保持。[deploy]
- [ ] 门禁全绿：`pnpm check`、`pnpm build`、`pnpm test`、web e2e、electron e2e、`pnpm test:packaged`；黑盒启动全部窗口正常。
- [ ] blueprint 与 AGENTS.md 中样式相关表述与现状一致，无失效引用。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC 3：双端视觉一致属人工对照；web 版主题/accent 即时生效与刷新保持经 web e2e 自动验证。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 像素级视觉：同前序 task，人工对照。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 清零用 grep 白名单（允许保留的类名清单）做断言；web 一致性用现有 web e2e，并为 web 版主题三档/accent 五档的即时切换与刷新恢复新增 e2e 覆盖。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：残留类的动态拼接引用（字符串拼类名）grep 漏网，删除后运行期才暴露。
- 回退：单 commit，revert 即恢复；黑盒全窗口启动验证兜底。

### 依赖与约束

- 依赖 t273（全部窗口迁移完成）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：样式体系最终态条目。
- `docs/blueprint/conventions.md`：样式与组件约定。
- `docs/blueprint/testing.md`：受影响的测试/黑盒命令。
