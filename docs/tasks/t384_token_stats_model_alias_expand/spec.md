# Task spec

## 背景

Agent 面板筛选「工具=claude code + 模型=deepseek-v4-flash」结果为空（数据表实际有 225846 条该组合记录）。两层根因：(1) 前端 `modelOptions` 把后端返回的展示名当 alias 用 `aliasToOriginal` 反向翻译成原始 key，当展示名恰等于真实 model 名又恰等于某 alias 名（用户配置 `modelAliases=[{alias:"deepseek-v4-flash",models:["__secondary__"]}]`）时 value 错成 `__secondary__`，后端精确匹配 0 行；(2) 后端 `model = @model` 单值精确匹配，不支持按 `model_aliases` 归并展开，即使 value 修对也不包含 `__secondary__` 的 11447 条 kimi-code 记录，不满足用户「`__secondary__` 都算 v4 flash」意图。方案 Y（查询层 IN 展开 + 前端停反查），经 Grok-4.6 咨询确认并由用户拍板。

## 契约区

### 范围

- 后端 `src/main/core/token-stats/token-stats-store.ts`：新增 `dashboard_model_filter_keys(selected, model_aliases)` 与 `dashboard_model_where(keys)`（紧贴 `dashboard_alias_resolver`）；改 `build_dashboard_conditions`（:459-479）、`dashboard_window_union_builder`（:491-542，rollup 整小时与 records 边缘两段共用同一 model_where）、`dashboard_records_source`（:551-563）与 `materialize_session_meta`（:589-614）。语义：一行 raw `M` 进入窗口 iff `resolver(M) === resolver(selected)`；`keys = {selected, resolver(selected)} ∪ {k | resolver(k) === resolver(selected)}`；单值仍 `= @model`，多值 `IN (@model_0,…)`（绑定参数，禁拼接）。
- 前端 `src/renderer/views/TokenStatsView.tsx`：删除 `aliasToOriginal`（:523-531）；`modelOptions`（:541-551）改为 `value=label=展示名`（`dashboard.models` 已是 resolver 后值）；`originalToAlias` 保留仅用于 prefs 残留 raw key 归一（aliases 到达后把已存的 raw key 改写成 alias 再 `save_prefs`）。
- 同步更新/替换相关测试（见测试策略）。

### 非范围

- 不改 `token-stats.ts` schema（`model` 仍为 string）、不改 local-api querystring、不改 web client（`model_aliases` 已随 `/v1/dashboard` 下发，自动覆盖）。
- 不改 `query_heatmap` / `query_hour_buckets` / `query_range_rollup` / `query_records` 的独立接口（统一 dashboard 不走它们；标注为遗留边界，将来若有组件用独立接口做模型筛选需另行展开）。
- 不改 `__secondary__` 的采集语义（方案 X 采集层归一已被用户否决，归并放查询层）。
- 不动其它 alias 展示的传递闭包——按 resolver 去重语义（`dashboard_alias_resolver` 实际为 Map.set 后写覆盖，非「先写获胜」；实现时必须复用同一 resolver 做展开，不重写逆映射）。

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

- [ ] AC-001：alias 名与真实 model 名碰撞时筛选有数据——配置 `modelAliases=[{alias:"deepseek-v4-flash",models:["__secondary__"]}]`、数据存在 `agent='claude-code' AND model='deepseek-v4-flash'` 记录时，Agent 面板筛选「工具=claude code + 模型=deepseek-v4-flash」返回非零记录（此前为 0）。
- [ ] AC-002：归并展开——选展示名 `deepseek-v4-flash` 时，结果同时包含 `model='deepseek-v4-flash'` 与 `model='__secondary__'` 两批记录（`COUNT(DISTINCT session)` 对跨 model 同 session 不重复计数）。
- [ ] AC-003：下拉 value 正确——前端模型下拉 option 的 `value` 与 `label` 均为展示名（`deepseek-v4-flash`），选中后 `getDashboard`/`getDashboardSessions` 收到的 `model` 为展示名而非原始 key。
- [ ] AC-004：归并不破坏 agent 过滤——`agent='claude-code'` 且选 `deepseek-v4-flash` 时，`__secondary__` 的 kimi-code 记录被 `agent` 条件正确排除（仅当 agent=all 时两路合并）。
- [ ] AC-005：无 aliases 时行为不变——`modelAliases=[]` 时单值相等过滤，与旧行为一致。
- [ ] AC-006：prefs 兼容——bug 期已写入的 raw key（如 `__secondary__`）在 aliases 到达后归一成 alias 展示名，首屏/API 直传 raw key 也能经后端 resolver 展开命中整组。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：后端用真实 sqlite fixture 断言记录数/会话去重/归并展开；前端用 testing-library 断言下拉 option value/label 与查询参数。

## 上下文区

- 来源：p152（`docs/pending/todo/p152_token_stats_model_alias_collision.md`；方案 Y 经 Grok-4.6 read-only 咨询确认、用户拍板；`.scratch/model_filter_repro.mjs` 复现）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 后端（`tests/unit/main/core/token-stats/token-stats-store.test.ts`）：挂在已有 `query_dashboard model alias mapping (t230)`（:2403-2455）旁，每条用例均跑 records fallback 与 `backfill_hour_rollup` 后的 union 两路径（对齐 :2200-2227）。覆盖：碰撞合并（claude-code/`deepseek-v4-flash` + kimi-code/`__secondary__` 同时命中）、agent AND（`agent='claude-code'` 排除 `__secondary__`）、多 key alias（`{alias:"X",keys:["m1","m6"]}` 两路并入）、resolver 去重语义（按代码实际「后写覆盖」）、选 raw key 仍展开整组、无 aliases 单值相等、models 列表带 model 过滤仍返回窗口全展示名（:1379-1387）、分页 `total`/`has_more`/offset 与 distinct session 数一致。
- 前端（`tests/unit/renderer/views/token_stats_view.test.tsx`）：整段替换 :543-570（t230「value=original」为碰撞 bug 预期，禁止只改 expect）；新增——碰撞配置下 option `value===label==='deepseek-v4-flash'` 且查询参数为展示名；prefs 预置 `__secondary__` 时 aliases 到达后归一成展示名；无碰撞路径（sonnet）保持绿。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：IN 展开误伤聚合去重（跨 model 同 session 重复计数）；展开式与 resolver 去重语义分叉（代码实际「后写覆盖」，须复用同一 resolver 而非新写逆映射）；超大 alias 组触发 SQLite 绑定参数上限（`SQLITE_MAX_VARIABLE_NUMBER`）；改动 `build_dashboard_conditions` 影响 dashboard 与 sessions 两条路径回归。
- 回退：git 回退；聚合去重由 AC-002 用例锁定；大 alias 组加保护/截断说明。

### 依赖与约束

- 无前置依赖。实现约束：展开逻辑必须复用同一 `dashboard_alias_resolver`（不重写逆映射）；IN 用绑定参数禁拼接；大 alias 组加绑定参数保护。

### Finalization 时更新的 blueprint

- 无
