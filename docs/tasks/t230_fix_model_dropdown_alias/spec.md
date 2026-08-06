# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p061。

代理面板（`TokenStatsView`）右上角「模型筛选」下拉列出的选项是原始模型名（如 `claude-3-5-sonnet-20241022`），而柱状图、donut、会话表同窗口均显示映射后的别名（如 `Sonnet`）。根因：后端 `dashboard.models` 由 `token-stats-store.ts` 的 `window_models` 临时表 `SELECT DISTINCT model ORDER BY model` 取原始名，未过 `model_resolver`（alias 仅在 TopN 聚合前的 `model_token_totals`/`model_call_totals` 合并）；前端 `modelOptions` 直接用 `dashboard.models` 渲染下拉。后端 model 筛选 `build_dashboard_conditions` 是原始名精确匹配（`model = @model`），故下拉 value 必须保留原始名、仅映射显示文本。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 代理面板「模型筛选」下拉选项的显示文本应用 `modelAliases` 映射，与柱状图/donut/会话表一致。
- 下拉选中项回传给查询的 `model` 值仍是原始名（后端精确匹配依赖），映射只发生在显示层。
- 覆盖 Electron 与 Web 两条展示路径（共享 `TokenStatsView`，后端 `dashboard.models` 为共同契约）。

### 非范围

- 不改后端模型筛选逻辑（`build_dashboard_conditions` 的 `model = @model` 精确匹配保持）。
- 不改 `model_token_totals`/`model_call_totals` 的既有 alias 合并行为。
- 不改下拉的排序、去重与「全部模型」兜底逻辑语义。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 配置了 `modelAliases` 时，代理面板模型下拉的选项文本显示别名（如 `Sonnet`），不再显示原始名。
- [ ] 在下拉选中某别名后，发往 `getDashboard`/`getDashboardSessions` 的 `model` 查询参数仍是该别名对应的原始模型名，筛选结果正确。
- [ ] 未配置 `modelAliases` 或模型无匹配别名时，下拉显示原始名，行为与现状一致。
- [ ] 后端 `dashboard.models` 返回已映射的显示名，同一窗口内柱状图/donut/下拉的模型命名一致。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：AC1/AC2/AC3 由 `tests/unit/renderer/views/token_stats_view.test.tsx` 覆盖（mock `getDashboard` 返回已映射 models + 断言下拉文本与请求 model）；AC4 由 `tests/unit/main/core/token-stats/token-stats-store.test.ts` 覆盖（配置 `model_aliases` 后断言 `dashboard.models` 内容）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 前端：`token_stats_view.test.tsx` 在 `get_config` mock 注入 `modelAliases`（如 `{ alias: "Sonnet", models: ["claude-3-5-sonnet-20241022"] }`），断言下拉 option 文本含 `Sonnet`，`selectOptions` 后 `getDashboard` 末次调用 `model` 为原始名。
- 后端：`token-stats-store.test.ts` 的 dashboard 用例传入 `model_aliases`，断言 `models` 数组返回映射名且 `model_token_totals` key 为映射名。
- Web 与 Electron 共享 `TokenStatsView`，前端测试即覆盖两路径；后端测试覆盖共同契约。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无（modelAliases 结构与 build_resolver 语义已从代码核实：`chart-data.ts:30-36` keys→alias，未命中返回原 key）。

### 风险与回退

- 风险：多个原始模型映射到同一别名时，下拉去重后只显示一次别名；选中该别名查询仍只精确匹配其一个原始名（`model = @model`），别名覆盖多原始名的「全选」语义目前不成立。此风险属既有 alias 设计边界（图表系列同样按别名合并展示），非本 task 引入；AC2 只保证选中别名返回其对应原始名，不做多原始名展开。
- 回退：后端 `dashboard.models` 改回原始名 + 前端下拉不映射，仅涉及 `token-stats-store.ts` 与 `TokenStatsView.tsx`。

### 依赖与约束

- 依赖 p061 登记（根因已定位）。
- 约束：后端 model 筛选保持原始名精确匹配；下拉 value 用原始名、显示文本用别名；不改 IPC/DTO 字段结构（`models: string[]` 类型不变，仅内容为映射名）。

### Finalization 时更新的 blueprint

- 无
