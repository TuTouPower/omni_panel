# p061 代理面板模型下拉未应用模型映射（alias）

- 现象：代理面板右上角「模型筛选」下拉列出的是原始模型名（如 `claude-3-5-sonnet-20241022`），而柱状图、donut、会话表同窗口都显示映射后的别名（如 `Sonnet`）。期望：下拉选项显示文本应用同样的 modelAliases 映射。
- 影响：用户在下拉里看不到与图表一致的模型名，筛选时难以对照；alias 用户日常操作体验不一致。
- 根因：后端 `dashboard.models` 由 `token-stats-store.ts` 的 `SELECT DISTINCT model ... ORDER BY model`（`window_models` 临时表）直接取原始名，未过 `model_resolver`（alias 在 TopN 聚合前的 `model_token_totals`/`model_call_totals` 中已合并）。前端 `TokenStatsView.tsx` 的 `modelOptions` 直接用 `dashboard.models` 渲染下拉，未套 `modelAliases`。属产品缺陷。注意：后端 `build_dashboard_conditions` 的 model 筛选是原始名精确匹配（`model = @model`），所以下拉 value 必须保留原始名、只映射显示文本，否则筛选失效。
- 测试缺口：`tests/unit/renderer/views/token_stats_view.test.tsx` 的模型筛选测试（t204/t206）只断言 option 文本等于原始名（`sonnet`），未覆盖配置了 modelAliases 时下拉显示映射名；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 未断言 `dashboard.models` 的 alias 映射。补测：后端测试断言配置 model_aliases 后 `models` 返回映射名；前端测试断言带 modelAliases 时下拉显示别名且选中后查询仍发原始名。
- 线索：`.scratch/task-bug-model-dropdown/`（映射链路分析）。
- 处理：t230
