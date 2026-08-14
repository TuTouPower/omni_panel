# Task review t384（reviewer_focus: 代码）

- task：`t384_token_stats_model_alias_expand`
- spec：`docs/tasks/t384_token_stats_model_alias_expand/spec.md`
- diff_anchor：`7db9320dfabc1edd7e93c167daa60728989d2518`
- target：`git diff 7db9320dfabc1edd7e93c167daa60728989d2518`
- round：1
- reviewed_at：2026-08-15 06:22 UTC+8

## 验证基线

- 仓库根：`/home/testuser/testuser_ubuntu/omni_panel_t384`，分支 `t384_token_stats_model_alias_expand`，anchor 存在。
- 测试：`token-stats-store.test.ts` 97 通过；`token_stats_view.test.tsx` 34 通过。
- `tsc --noEmit` 干净；改动文件 eslint 干净（含新归一 effect 的 eslint-disable 生效）。
- 依赖：`better-sqlite3` ^12.10.0，实测捆绑 SQLite 3.53.1。

## Findings

### t384_code_f001 - 大 alias 组绑定参数保护缺失（spec「依赖与约束」未满足）

- 严重度：minor
- 锚点：spec「依赖与约束：大 alias 组加绑定参数保护」；「风险与回退：超大 alias 组触发 SQLite 绑定参数上限（SQLITE_MAX_VARIABLE_NUMBER）」
- 位置：`src/main/core/token-stats/token-stats-store.ts:362-393`（`dashboard_model_filter_keys` / `dashboard_model_where`）、`:675-682`（materialize 位置参数 IN）
- 问题：三个模型过滤路径对 `keys` 数量无任何保护/截断/注释，直接铺满绑定参数（named `@model_0…` 与位置 `?`）。keys 数超过 SQLite 变量上限时 `prepare` 会抛错。实测该环境捆绑 SQLite 3.53.1，默认 `SQLITE_MAX_VARIABLE_NUMBER=32766`（3.32+），需单个 alias 组 >32766 个 key 才触发，模型别名配置实际不可达；spec 此项约束形同虚设但未落实。
- 建议：最小修复方向——在 `dashboard_model_filter_keys`/`dashboard_model_where` 加注释说明上限（或对超限 keys 做截断 + 回退单值），避免未来维护者在引入更大 key 集时踩 prepare 失败。

### t384_code_f002 - prefs 归一依赖 originalToAlias 先写获胜，与后端 resolver 后写覆盖在重复 key 配置下不一致

- 严重度：minor
- 锚点：AC-006；spec「复用同一 resolver（后写覆盖语义），不重写逆映射」
- 位置：`src/renderer/views/TokenStatsView.tsx:533-541`（`originalToAlias` 保留 `if (!map.has(m))` 先写获胜）与 `:302-311`（归一 effect）
- 问题：`originalToAlias` 先写获胜，后端 `dashboard_alias_resolver` Map.set 后写覆盖，二者在「同一 model key 出现在多个 alias 组」的配置下分叉。复现：`modelAliases=[{alias:"A",models:["x"]},{alias:"B",models:["x"]}]`、prefs `model="x"` 时，归一 effect 把 model 改写成 `"A"`（先写），而后端 `resolver("x")="B"`（后写）；选中 `"A"` 展开组为 `{A}`，不含 `x` 记录，反而比归一前发送 raw `"x"`（后端展开组 `{x,B}`）更窄——归一使筛选失真。规范碰撞场景（单 alias 组，如 `deepseek-v4-flash→__secondary__`）两映射结果一致，不受影响。
- 建议：最小修复方向——归一 map 构建改为后写覆盖（`map.set(m, alias)` 去 `if`），与后端 resolver 语义对齐；或注释说明该边界（重复 key 配置超 AC-006 规范范围）。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无前轮。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
  - 文件过大（降级规则，仅列路径与行数，不产生行为缺陷）：`src/main/core/token-stats/token-stats-store.ts` 1665 行（本 task 净增 ~67）；`src/renderer/views/TokenStatsView.tsx` 970 行（净增 ~38）；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 2593 行（净增 ~115）；`tests/unit/renderer/views/token_stats_view.test.tsx` 1065 行（净增 ~43）。均为既有超大文件，本 task 未引入由体积直接导致的可观测缺陷。
  - 复杂度：无函数 ≥10；`dashboard_model_filter_keys` / `dashboard_model_where` / 归一 effect 均低分支，无提示。
  - 范围外观察：无。
- 总体判断：六条 AC 全部落地且有后端/前端测试覆盖，四处替换完整（build_dashboard_conditions、union_builder rollup+records 两段共用同一 model_where、records_source、materialize_session_meta 位置参数路径），`dashboard_model_filter_keys` 复用 `dashboard_alias_resolver`（后写覆盖、按 resolver(k) 展开非 item.alias 匹配），`dashboard_model_where` 单值/多值 + 绑定参数无拼接注入，window_models 传 `model:undefined` 得空 clause 不破坏模型下拉，位置参数 `?` 顺序与 extra_params 一致，agent AND 归并正确，无 aliases 单值不变，IN 展开对 225846 条记录无性能回归（时间戳索引主导扫描，IN 仅作残差过滤）。仅 2 条 minor，无 critical/important，可 PASS。
- 系统性 follow-up：无。

reviewed_scope: e1e8db1b48b0efa4
verdict: PASS

## Round 2 复核（reviewed_scope: 856ae40a8f6d555c）

- 前轮 finding 复核：
  - f001（大组保护缺失）：已消除。`dashboard_model_where` JSDoc 补注释说明展开组大小受 model_aliases 配置约束（每 alias 的 keys 是有限声明列表）、实测捆绑 SQLite 变量上限 32766、keys 数远超实际配置、无越界风险、无需大组回退保护。materialize 位置参数路径（`:675-682`）复用同一 `dashboard_model_filter_keys` keys 生成源，注释通过引用覆盖。另新增测试「t384: 多 key alias 展开整组（spec 风险区）」覆盖展开路径。修复符合前轮建议最小方向，无副作用。
  - f002（originalToAlias 先写获胜分叉）：维持 minor。前端 `originalToAlias` 先写获胜未改，与后端 resolver 后写覆盖在「同一 key 多个 alias 组」配置下仍分叉；该配置超出 AC-006 规范碰撞场景，仅极端配置可观测，维持 minor 评级合理。implementer 新增后端测试「t384: resolver 后写覆盖——同 key 多个 alias 组只按最后声明的别名展开」锁定后端后写覆盖语义（选 AliasA=0 命中、选 AliasB 命中），为加分项，不改变前端 minor 判定。
- 本轮新发现：0 条。新增 2 条后端测试（多 key 展开、resolver 后写覆盖）均直接验证 spec「风险与回退」/「依赖与约束」声明语义，断言锚定 calls 计数，无 mock 误用、无行为分叉。变更集仍限于原 5 文件，无源码扩散。
- 未进表的提示：无。
- 总体判断：f001 已按建议修复并补测试覆盖；f002 维持 minor 不构成阻断。无未解决 critical/important，仍 PASS。
- 系统性 follow-up：无。

reviewed_scope: 856ae40a8f6d555c
verdict: PASS
