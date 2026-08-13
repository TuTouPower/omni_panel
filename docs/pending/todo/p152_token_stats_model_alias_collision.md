# p152 Agent 面板模型筛选：alias 名与真实 model 名冲突 + 单 value 无法按 alias 展开

- 现象：
    - 筛选「工具=claude code + 模型=deepseek-v4-flash」结果为空，期望显示该组合全部数据（数据表实际有 22.5 万条 `claude-code + deepseek-v4-flash` 记录）。复现：真实库 `~/.config/OmniPanel/observations.sqlite` 中 `token_stats_records` 有 `agent='claude-code' AND model='deepseek-v4-flash'` 225846 条；`.scratch/model_filter_repro.mjs` 确定性复现——下拉选中 `deepseek-v4-flash` 后查询参数 `model='__secondary__'`，后端 `WHERE model='__secondary__' AND agent='claude-code'` 命中 0 行。
    - **时间窗口被截断（2026-08-13 补录）**：选「最近一月（30d）」+ 模型=deepseek-v4-flash 只显示最近 7 天，7.31–8.6 的 85454 条 deepseek-v4-flash 真实数据不显示。根因同主点：value 反查发 `model='__secondary__'`，而真实库 `__secondary__` 数据全部从 2026-08-07 起（12352 条，全 kimi-code），「最近一月」窗口被 `__secondary__` 截成最近 7 天。修好主点（value=展示名 + IN 归并）后，选 deepseek-v4-flash 命中 `IN (deepseek-v4-flash, __secondary__)`，窗口即返回全部 30 天数据，本现象随之消失，无需独立修复。
- 用户意图（已确认）：`modelAliases=[{alias:"deepseek-v4-flash", models:["__secondary__"]}]` 表示「`__secondary__` 模型就是 v4 flash」，期望两者在筛选/聚合时归并显示为 `deepseek-v4-flash`。配置本身合理，不是用户配置错误。
- 影响：Agent 面板模型下拉在「alias 名恰好等于数据中真实 model 名」时筛选失效（当前配置触发）；且即使修掉反查，单 value `model='deepseek-v4-flash'` 仍不包含 `__secondary__` 的 11447 条 kimi-code 记录，不满足用户「**secondary** 都算 v4 flash」的归并意图。影响范围：`TokenStatsView` 的 dashboard / sessions 两条查询路径。
- 根因（两层）：
    1. **value 反查错误**：`TokenStatsView.tsx:523-551` 的 `modelOptions` 把后端返回的**展示名**（`dashboard.models`，已是 resolver 后的值）当作 **alias 名**用 `aliasToOriginal.get(alias)` 反向翻译成原始 key。当展示名恰好等于某 alias 配置的 alias 名（`deepseek-v4-flash` 同时是真实 model 名和 alias 名）时，`aliasToOriginal.get('deepseek-v4-flash')` 命中配置返回 `'__secondary__'`，value 错成 `__secondary__` → 后端精确匹配 0 行。
    2. **过滤不支持 alias 展开**：后端（`token-stats-store.ts:467/475` `build_dashboard_conditions` 与 `dashboard_window_union_builder` 的 `model_where`）只支持单 value `model = @model` 精确匹配；`model_aliases` 只在汇总展示（`dashboard_summary_from_rollup` 的 `model_resolver`）用，不进过滤条件。因此选 alias 归并名无法展开成 `IN (keys)` 匹配全部底层模型。
        分类：产品缺陷（筛选 value 构造错误 + 过滤不支持 alias 展开）。
- 已确认同类位点（同一机制「展示名当 alias 反向翻译」）：
    - 主点：`TokenStatsView.tsx:541-551`（`modelOptions`，同时驱动 dashboard 与 sessions 两条查询的 `model` 参数）
    - 关联点：`token-stats-store.ts:467/475` + `:494-496`（`build_dashboard_conditions` / `dashboard_window_union_builder` 的 model 过滤仅单值）
    - 已扫无其它：全仓 `aliasToOriginal` 仅此处使用（grep 确认）；`chart-data.ts` 的 alias resolver 只做图表聚合展示不反向翻译，不属本问题；Session 面板/用量面板无模型筛选。
    - 待确认位点：`aliasToOriginal`/`originalToAlias` 的单向去重语义（`if (!map.has(...))` 只保留首个 key）在多 key alias 下行为未验证，标待确认供修复时一并核实。
- 测试缺口：
    - `tests/unit/renderer/views/token_stats_view.test.tsx:543`（t230）只测 alias 名与真实名不同（`Sonnet` → `claude-3-5-sonnet-20241022`）的正常路径，未覆盖「alias 名 == 真实 model 名」的冲突场景，假绿放过主点。
    - 后端无「过滤条件按 model_aliases 展开 IN」的用例（`token-stats-store.test.ts:2421/2444` 只测展示 resolver）。
    - 补测：前端用例——`modelAliases=[{alias:'deepseek-v4-flash',models:['__secondary__']}]` 且 `dashboard.models=['deepseek-v4-flash']` 时，下拉 option value 应为 `deepseek-v4-flash`（而非 `__secondary__`），选中后 `get_dashboard` 收到 `model:'deepseek-v4-flash'`；若实现 alias 展开，则补后端用例断言 `model IN ('deepseek-v4-flash','__secondary__')` 命中两批数据。
- 线索：`.scratch/model_filter_repro.mjs` + `.scratch/PixPin_2026-08-13_14-01-56.png`（模型别名配置表单截图）
- 处理：未开

## Grok（grok-4.6）方案（2026-08-13，read-only 咨询，详见下文转述）

**选型：后端展开变体**——`model` 保持**展示名字符串**（不改 schema、不改 local-api/web querystring），前端停止反查，后端用已有 `model_aliases` 在 WHERE 处按 `dashboard_alias_resolver` 逆映射扩成 `IN (...)`。聚合 / `COUNT(DISTINCT session)` / session 分页留在 SQL。

- 语义：一行 raw `M` 进入窗口 iff `resolver(M) === resolver(selected)`；`keys = {selected, resolver(selected)} ∪ {k | resolver(k) === resolver(selected)}`。单值仍 `= @model`，多值 `IN (@model_0,…)`（绑定参数，禁拼接）。
- 后端改动（`token-stats-store.ts`）：新增 `dashboard_model_filter_keys(selected, model_aliases)` + `dashboard_model_where(keys)`（紧贴 `dashboard_alias_resolver:341-349`）；改 3 处共用 helper：`build_dashboard_conditions`(:459-479)、`dashboard_window_union_builder`(:491-542 rollup 与 records 两段同 model_where)、`dashboard_records_source`(:551-563)/`materialize_session_meta`(:589-614) 已调前者。`session_meta` 用同一 IN，分页 `dashboard_session_page_from_meta`(:645-658) 不改。
- 前端改动（`TokenStatsView.tsx`）：删 `aliasToOriginal`(:523-531)；`modelOptions`(:541-551) 的 `value=label=展示名`（`dashboard.models` 已是 resolver 后值）；`originalToAlias` 保留用于 prefs 残留 key 归一。查询发 `model=deepseek-v4-flash`（非 `__secondary__`）。删/改 t230 注释 :519-522。
- prefs 兼容：bug 期可能已写入 `__secondary__`；aliases 到达后把 raw key 归一成 alias 再 `save_prefs`；后端按 `resolver(selected)` 展开，raw key 也能命中。
- 待确认位点（`aliasToOriginal`/`originalToAlias` 去重）结论：跟 resolver **先写获胜**（:345-347）对齐，不做 key 集合传递闭包；多 key alias `IN (X,m1,m6)` 展开；alias 的 key 本身是真实名时按 resolver 归并。
- 测试：`token_stats_view.test.tsx:543-570`（t230 value=original）整段替换为「value=label=展示名」碰撞用例；`token-stats-store.test.ts` 在 :2403-2455 旁新增「碰撞合并 / agent AND / 多 key / 先写获胜 / 选 raw key / 无 aliases / models 列表 / 分页」用例，均跑 records fallback 与 rollup union。
