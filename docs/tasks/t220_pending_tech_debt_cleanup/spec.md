# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

合并三条独立的 pending 技术债（均为 minor 品味/整洁度项，单条不值得独立 task，合并成一批）：

- p041（t203 审阅）：`CollapsibleCard` 的 `collapsible` prop 已消除不可折叠卡片死箭头，但 `UpcomingResetCard`、`ProviderAccountRow`、PopupView token 面板仍用 `onToggle ?? (() => undefined)` / `can_collapse ? fn : () => undefined` 的旧模式，镜像树（aria-hidden）仍渲染死按钮。
- p042（t203 审阅）：`tests/e2e/electron/auto_seed.spec.ts` 的 `BUNDLED_PLUGIN_NAMES` 是 7 条历史插件名，与 connectors/ 实际 16 个连接器脱节，断言靠 `>=` 兜底，语义只剩「种子未清空既有配置」。
- p047（t208 审阅）：(1) `TrendApi.get` 注释「返回长度=days、缺失日期填 null」已过时（t208 改 ≤max_points 桶、不填充）；(2) `observation-store.ts` 接口前置 docstring 与 t208 补充段表述矛盾；(3) `provider_account_row.test.tsx` 窗口选择器「切回缓存」断言用 `setTimeout(50)` 负向等待，CI flaky 风险。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 死折叠箭头：`UpcomingResetCard`、`ProviderAccountRow`、PopupView token 面板改传 `collapsible={false}`（或等效）消除无回调时的 no-op 箭头；镜像树不再渲染死按钮。
- auto_seed 断言：`BUNDLED_PLUGIN_NAMES` 改为与 `discover_connector_definitions` 结果对齐（或删去常量改用真实连接器计数），断言语义回到「种子覆盖全部 bundled 插件」。
- trend 注释：`TrendApi.get` / `observation-store.ts` 前置 docstring 更新为 t208 语义（≤max_points 桶、不强制 null 填充）。
- provider_account_row 负向等待：`setTimeout(50)` 改 `waitFor` 配「调用次数未变」或伪时钟。

### 非范围

- 各组件业务行为（折叠/展开功能本身）。
- auto_seed 生产逻辑（auto-seed 行为不变）。
- trend 查询实现（纯注释订正）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 无回调时不可折叠卡片不渲染折叠箭头（DOM 无 chevron 按钮）；有回调卡片行为不变。
- [ ] `auto_seed.spec.ts` 断言基于真实连接器计数或对齐的常量，不再依赖 `>=` 宽松兜底；测试仍过。
- [ ] `TrendApi.get` 与 `observation-store.ts` 注释与实际行为一致（≤max_points 桶、不填充）。
- [ ] `provider_account_row.test.tsx` 不再含 `setTimeout` 负向等待，测试在整批跑稳定。
- [ ] 相关组件/测试全量回归绿。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（组件测试断言无箭头 + 行为；e2e auto_seed 可跑）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 组件测试：断言不可折叠卡片 `queryByRole("button")` 无 chevron / aria-expanded。
- e2e：`pnpm test:e2e:electron` 或验证 auto_seed 断言逻辑单测化。
- 负向等待：`waitFor` + 断言调用次数不变。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：删死箭头后某些样式依赖箭头占位。
- 回退：保留箭头容器但加 `aria-hidden` 或 pointer-events:none（仍算死按钮，优先删除）。

### 依赖与约束

- 依赖 t203（ProviderCard collapsible 先例）、t208（trend 语义）。
- 无平台/安全约束。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：无可累积（纯债清理）；如涉及组件约定写 conventions。
