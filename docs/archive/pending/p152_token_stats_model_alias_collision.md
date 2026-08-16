# p152 Agent 面板模型筛选：alias 名与真实 model 名冲突 + 单 value 无法按 alias 展开

- 现象：
    - 筛选「工具=claude code + 模型=deepseek-v4-flash」结果为空，期望显示该组合全部数据（数据表实际有 22.5 万条 `claude-code + deepseek-v4-flash` 记录）。复现：真实库 `~/.config/OmniPanel/observations.sqlite` 中 `token_stats_records` 有 `agent='claude-code' AND model='deepseek-v4-flash'` 225846 条；`.scratch/model_filter_repro.mjs` 确定性复现——下拉选中 `deepseek-v4-flash` 后查询参数 `model='__secondary__'`，后端 `WHERE model='__secondary__' AND agent='claude-code'` 命中 0 行。
    - **时间窗口被截断（2026-08-13 补录）**：选「最近一月（30d）」+ 模型=deepseek-v4-flash 只显示最近 7 天，7.31–8.6 的 85454 条 deepseek-v4-flash 真实数据不显示。根因同主点：value 反查发 `model='__secondary__'`，而真实库 `__secondary__` 数据全部从 2026-08-07 起（12352 条，全 kimi-code），「最近一月」窗口被 `__secondary__` 截成最近 7 天。修好主点（value=展示名 + IN 归并）后，选 deepseek-v4-flash 命中 `IN (deepseek-v4-flash, __secondary__)`，窗口即返回全部 30 天数据，本现象随之消失，无需独立修复。
    - **2026-08-16 核实：两现象均已消除**——t384 修复（后端 IN 归并展开 + 前端 value=展示名）已合入 main，见下方根因改写。
- 用户意图（已确认）：`modelAliases=[{alias:"deepseek-v4-flash", models:["__secondary__"]}]` 表示「`__secondary__` 模型就是 v4 flash」，期望两者在筛选/聚合时归并显示为 `deepseek-v4-flash`。配置本身合理，不是用户配置错误。
- 影响（历史，已修复）：Agent 面板模型下拉在「alias 名恰好等于数据中真实 model 名」时筛选失效（当前配置触发）；且即使修掉反查，单 value `model='deepseek-v4-flash'` 仍不包含 `__secondary__` 的 11447 条 kimi-code 记录，不满足用户「secondary 都算 v4 flash」的归并意图。原影响范围：`TokenStatsView` 的 dashboard / sessions 两条查询路径。t384 修复后两现象均不再复现（测试验证，见测试缺口段）。
- 根因（两层，历史机制——已由 t384 修复，2026-08-16 核实现状已不成立）：
    1. **value 反查错误**：`TokenStatsView.tsx`（当时 :523-551）的 `modelOptions` 把后端返回的**展示名**（`dashboard.models`，已是 resolver 后的值）当作 **alias 名**用 `aliasToOriginal.get(alias)` 反向翻译成原始 key。当展示名恰好等于某 alias 配置的 alias 名（`deepseek-v4-flash` 同时是真实 model 名和 alias 名）时，`aliasToOriginal.get('deepseek-v4-flash')` 命中配置返回 `'__secondary__'`，value 错成 `__secondary__` → 后端精确匹配 0 行。**现状：`aliasToOriginal` 已删除**，`modelOptions` 现为 `value=label=展示名`（`TokenStatsView.tsx:542-551`，t384 AC-003）。
    2. **过滤不支持 alias 展开**：后端 `token-stats-store.ts`（当时 `build_dashboard_conditions` 与 `dashboard_window_union_builder` 的 model 过滤）只支持单 value `model = @model` 精确匹配；`model_aliases` 只在汇总展示用。**现状：已新增 `dashboard_model_filter_keys`（:362-376）+ `dashboard_model_where`（:381-395，单值 `=` / 多值 `IN (@model_0,…)` 绑定参数），接入 `build_dashboard_conditions`（:521）、`dashboard_window_union_builder`（:545）、`dashboard_records_source`、`materialize_session_meta`（:677-684/:738）共 4 处；分页 `dashboard_session_page_from_meta` 不改**。
        分类：产品缺陷（筛选 value 构造错误 + 过滤不支持 alias 展开）。
- 已确认同类位点（同一机制「展示名当 alias 反向翻译」）：
    - 主点：`TokenStatsView.tsx` `modelOptions`（同时驱动 dashboard 与 sessions 两条查询的 `model` 参数）——**已修**（value=label=展示名）。
    - 关联点：`token-stats-store.ts` `build_dashboard_conditions` / `dashboard_window_union_builder` 的 model 过滤仅单值——**已修**（IN 归并展开）。
    - 已扫无其它：全仓 `aliasToOriginal` 仅原 TokenStatsView 一处使用（**2026-08-16 复核：代码中该符号已删，仅 :531 注释残留**）；`chart-data.ts` 的 alias resolver 只做图表聚合展示不反向翻译（**复核一致**，`build_resolver` 4 处全为正向 key→alias 映射），不属本问题；Session 面板/用量面板无模型筛选（**复核一致**，「模型筛选」label 仅 `TokenStatsView.tsx:718` 一处）。
    - 待确认位点：`aliasToOriginal`/`originalToAlias` 的单向去重语义（`if (!map.has(...))` 只保留首个 key）在多 key alias 下行为未验证，标待确认供修复时一并核实——**2026-08-16 复核：`aliasToOriginal` 已删，该半已不存在；`originalToAlias` 先写获胜与后端 resolver 后写覆盖的分叉由 t384 reviewer 独立登记为 p182（todo 未归档，处理未开）；多 key 展开与后写覆盖语义已由 t384 测试覆盖（token-stats-store.test.ts:2667-2721），待确认项关闭**。
- 测试缺口：
    - （历史）`token_stats_view.test.tsx` t230 只测 alias 名与真实名不同的正常路径，未覆盖「alias 名 == 真实 model 名」的冲突场景，假绿放过主点。**现状：t230 value=original 用例已替换为 t384 AC-003（`token_stats_view.test.tsx:571-601`，value=label=展示名、不反翻译成原始 key）+ AC-006（:459-485，prefs 残留 `__secondary__` 归一为展示名）。**
    - （历史）后端无「过滤条件按 model_aliases 展开 IN」的用例。**现状：t384 已补 AC-001 碰撞（token-stats-store.test.ts:2564-2588）、AC-002 归并展开 + 反向选 raw key（:2527-2562）、union 路径（:2644-2665）、AC-004 agent AND（:2590-2621）、AC-005 无 aliases 单值（:2623-2642）、多 key（:2667-2689）、后写覆盖（:2691-2721）。2026-08-16 实测两文件 135 用例全绿。**
    - 遗留扩展（t384 reviewer 另登记，处理未开）：p183——union 路径缺 agent+model 组合过滤、`is_hour_rollup_ready()` 断言、跨 model 同 session 的 `COUNT(DISTINCT session)` 去重三项覆盖；p182——前后端去重语义分叉统一。
- 线索：`.scratch/model_filter_repro.mjs` + `.scratch/PixPin_2026-08-13_14-01-56.png`（模型别名配置表单截图）+ `.scratch/p152_verify.md`（2026-08-16 核实笔记）
- 处理：t384

## Grok（grok-4.6）方案（2026-08-13，read-only 咨询，详见下文转述）

**2026-08-16 核实：方案已落地**——t384「模型筛选 alias 归并展开」按此方案实现（commit `c9e2a17e`，2026-08-15，已在 main 历史；`docs/archive/tasks/t384_token_stats_model_alias_expand/` status=done），下述转述与现码一一对应（`dashboard_model_filter_keys`/`dashboard_model_where`、前端删 `aliasToOriginal`、`modelOptions` value=label=展示名、`originalToAlias` 保留 prefs 归一、测试替换与新增均兑现）。本条目除 p182/p183 遗留扩展外无未落地项。

**选型：后端展开变体**——`model` 保持**展示名字符串**（不改 schema、不改 local-api/web querystring），前端停止反查，后端用已有 `model_aliases` 在 WHERE 处按 `dashboard_alias_resolver` 逆映射扩成 `IN (...)`。聚合 / `COUNT(DISTINCT session)` / session 分页留在 SQL。

- 语义：一行 raw `M` 进入窗口 iff `resolver(M) === resolver(selected)`；`keys = {selected, resolver(selected)} ∪ {k | resolver(k) === resolver(selected)}`。单值仍 `= @model`，多值 `IN (@model_0,…)`（绑定参数，禁拼接）。
- 后端改动（`token-stats-store.ts`）：新增 `dashboard_model_filter_keys(selected, model_aliases)` + `dashboard_model_where(keys)`（紧贴 `dashboard_alias_resolver:341-349`）；改 3 处共用 helper：`build_dashboard_conditions`(:459-479)、`dashboard_window_union_builder`(:491-542 rollup 与 records 两段同 model_where)、`dashboard_records_source`(:551-563)/`materialize_session_meta`(:589-614) 已调前者。`session_meta` 用同一 IN，分页 `dashboard_session_page_from_meta`(:645-658) 不改。
- 前端改动（`TokenStatsView.tsx`）：删 `aliasToOriginal`(:523-531)；`modelOptions`(:541-551) 的 `value=label=展示名`（`dashboard.models` 已是 resolver 后值）；`originalToAlias` 保留用于 prefs 残留 key 归一。查询发 `model=deepseek-v4-flash`（非 `__secondary__`）。删/改 t230 注释 :519-522。
- prefs 兼容：bug 期可能已写入 `__secondary__`；aliases 到达后把 raw key 归一成 alias 再 `save_prefs`；后端按 `resolver(selected)` 展开，raw key 也能命中。
- 待确认位点（`aliasToOriginal`/`originalToAlias` 去重）结论：跟 resolver **先写获胜**（:345-347）对齐，不做 key 集合传递闭包；多 key alias `IN (X,m1,m6)` 展开；alias 的 key 本身是真实名时按 resolver 归并。
- 测试：`token_stats_view.test.tsx:543-570`（t230 value=original）整段替换为「value=label=展示名」碰撞用例；`token-stats-store.test.ts` 在 :2403-2455 旁新增「碰撞合并 / agent AND / 多 key / 先写获胜 / 选 raw key / 无 aliases / models 列表 / 分页」用例，均跑 records fallback 与 rollup union。
