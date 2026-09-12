# Task review t470（reviewer_focus: 代码）

- task：`t470_antigravity_session_discovery_list`
- spec：`/home/testuser/testuser_ubuntu/omni_panel_t470/docs/tasks/t470_antigravity_session_discovery_list/spec.md`
- diff_anchor：`d25451d57a5e90e8a42e9dff23d8edc1bca33444`
- target：`git diff d25451d57a5e90e8a42e9dff23d8edc1bca33444`
- round：1
- reviewed_at：2026-09-11 23:36 UTC+8

## Findings

### t470_code_f001 - 增量复扫把索引行按回退重算，title/directory/calls 被降级覆盖

- 严重度：important
- 锚点：AC-001（索引行 `title/directory` 取索引行、`calls` 取 `step_count`；缺行才取 steps 行数）＋行为缺陷：summaries 未变但某会话库 mtime 变化一次，该行 title/directory 变 null、calls 变 steps 计数
- 位置：`src/main/core/token-stats/antigravity-reader.ts:290`（summaries 未变时 `index_ids` 恒空，注释自述）、`src/main/core/token-stats/antigravity-reader.ts:291`（沿用上轮 facts 要求 on-disk 在场，缺库索引行被丢弃）、`src/main/core/token-stats/antigravity-reader.ts:340`（回退循环在该路径对全部 on-disk 生效，`:341` 的 `index_ids.has` 恒 false）、`src/main/core/token-stats/antigravity-reader.ts:365`（降级 facts：title/directory 置 null、calls 取 `count_steps` 后 emit 覆盖存量索引行）
- 问题：复现序列——首轮索引行 A（含 title、step_count=2）＋同名库存在；次轮 summaries mtime 不变、A 库 mtime 变化（如同毫秒写盘、摘要写失败、库被外部触碰），回退分支 `count_steps` 成功即 emit `{title: null, directory: null, calls: steps行数}` 覆盖 A 的索引 facts；同理索引有行但库缺失时次轮直接从 `fresh.files` 丢弃 A（`:292` 要求 on-disk），库稍后出现即按回退 emit 降级。正常 CLI 双写同变时被掩盖，属状态机潜伏不一致。
- 建议：summaries 未变路径跳过已在 `fresh.files` 中的会话的回退重算（仅刷新其库 mtime），或在 `files` 值中记录索引/回退来源使回退循环只处理回退来源；缺库索引行保留上轮 facts 不丢弃。

### t470_code_f002 - 空索引表被当损坏上报，零会话/回退成功也报 failed

- 严重度：minor
- 锚点：行为缺陷：`conversation_summaries.db` 存在但表为空（零会话合法态）或空表＋回退成功时，仍置 `file_unreadable` 使 collector 报 `failed`
- 位置：`src/main/core/token-stats/antigravity-reader.ts:278`（`read.rows.length === 0` 即置 `file_unreadable=true`）、`src/main/core/token-stats/antigravity-reader.ts:161`（`read_summaries` 的 catch 与空表同返回 `{rows: []}`，调用方无法区分损坏与空表）
- 问题：新用户零会话（空表、无回退文件）每轮 sources_status 为 failed 并打 warn；空表＋回退文件有效时回退会话正常产出但状态仍为 failed，误导为源故障。代码注释称“保守上报”，但把合法空态与损坏混同。
- 建议：`read_summaries` 返回错误标志（仅读异常/表缺失置 `file_unreadable`），空表正常返回 0 行且状态 ok。

## 结论

- 本轮新发现：2 条（important 1，minor 1）
- 未进表的提示：
    - 文件过大：`src/main/core/token-stats/collector.ts` 1077 行（≥800 线），本 task 净增约 90 行；按降级规则不进表，仅提示后续拆分。新建 `antigravity-reader.ts` 392 行未达实现源码 400 线阈值，无提示。测试源码与配置均未超阈值。
    - 复杂度：`scan_antigravity_sessions` 手算分支约 14（含三元/短路与双循环），达 ≥10 提示线；无工具计量故仅提示不进表，建议 f001 修复时顺手拆分（索引分支/回退分支各一函数）。
    - 范围外观察（不进表）：`collector.ts` 的 `reset_config` 顺带补 `codex_states.clear()`（t445 遗漏的一行），有益但属他 task 范围，建议在 task 收尾说明；`AGENT_COLOR_VAR` 未补 agy 分支系有意决定（DESIGN 无 agy token，沿 t456 回退 primary，`task.md` 已记录），vendor/logo 映射（`vendor_id_for_source`、Icon、AgentLogoRow 动态 counts、resume `agy --conversation`、locator/extractor t455 接线）均为 pre-existing 且满足 AC-001/AC-002，无需本 task 再改；AC-003 排序侧实现为 tokens 记 0（与 0 同序、不抛错），显式排序锁定测试归 test reviewer 覆盖。
- 总体判断：f001 的增量降级覆盖违反 AC-001 的索引口径，需修复后 PASS。
- 系统性 follow-up：无（f001/f002 均应在当前 task 内修复，不转 follow-up）。

verdict: FAIL

______________________________________________________________________

## Round 2（前轮复核 + 修复增量扫描）

- round：2
- reviewed_at：2026-09-11 23:41 UTC+8
- review_level：full
- target：`git diff d25451d57a5e90e8a42e9dff23d8edc1bca33444`（另直读未入库新建 `src/main/core/token-stats/antigravity-reader.ts` 439 行与 `tests/unit/main/core/token-stats/antigravity-reader.test.ts` 393 行，`git diff` 不含 untracked）
    -Implementer 自述修复：facts 加 `origin`（index/fallback，随 scan-state 持久化）、scan 拆分 `carry_index_entries/reconcile_index_rows/reconcile_fallback_dbs/push_session`、`read_summaries` 返回 `ok`（仅异常置 `file_unreadable`，空表合法）+ 3 个锁定测试

### 前轮 finding 复核（以 diff 与实测为准，不采信自述）

- t470_code_f001（important，增量降级覆盖）：已消除。`carry_index_entries`（`src/main/core/token-stats/antigravity-reader.ts:323`）在 summaries 未变时把上轮 `origin=index` 条目原样续存；`fresh_indexed_ids`（`:310`）以 `origin!=="fallback"` 为排除集，回退循环 `:406` 对索引行恒跳过，缺库索引行不再被丢弃；`reconcile_index_rows`（`:354`）仅索引 mtime 变化时按索引口径重算。锁定测试 `antigravity-reader.test.ts:320`（库 mtime 抖动零重发，旧码必 emit 降级行）与 `:358`（无库索引行跨轮保留、summaries 空转 mtime 不重发，旧码第三轮误重发）均覆盖旧码失败路径；本轮实测该文件 11/11 通过。
- t470_code_f002（minor，空表误报 failed）：已消除。`read_summaries`（`antigravity-reader.ts:167`）新增 `ok` 标志，仅 catch 置 `ok:false`（`:188`），空表返回 `ok:true`；调用方 `:288` 仅 `!read.ok` 置 `file_unreadable`。空表+回退成功锁定测试 `:307` 断言 `file_unreadable=false`；损坏仍报 failed 的既有测试 `:293` 保留通过，语义未反转（坏库仍 failed、合法空态 ok）。

### 本轮新 Findings

无。本轮新增 finding：0 条（新编号自 f003 起，未启用）。

### 未进表的提示（不 blocking）

- 文件过大：`antigravity-reader.ts` 439 行（≥400 实现源码线，本 task 新建即超阈值；按降级规则不进表）。`collector.ts` 1077 行（Round 1 已提示，本轮未再净增实质逻辑，仅 antigravity 接线约 60 行）——仍只提示后续拆分。
- 复杂度：拆分后 `scan_antigravity_sessions` 手算 CC≈5、`reconcile_fallback_dbs` CC≈6，均未达 ≥10 提示线；Round 1 的 CC≈14 已消除。
- 范围外观察：`summaries.db` 缺失路径（`:280`）视为空索引、fresh 不 carry 孤儿索引行——store 侧 upsert 保留故无用户可见丢失，重现即自愈；零日期索引行时间取库 mtime 后续库 mtime 抖动不跟（carry 按设计以 summaries 为变更信号），与 spec「索引口径」一致；`facts_equal`（`:224`）有意忽略 `origin`（可见字段一致即不重发，origin 翻转无需 emit）；`deserialize_bucket` 给 antigravity facts 附带 `records: []`/`daily: Map` 冗余键，`facts_equal`/`push_session` 均忽略，无行为影响。以上均不进表。
- 安全/契约/性能：新增路径均为本地只读 sqlite 静态 SQL（`:182`、`:206`），无外部输入拼接；`session_id` 拼路径仅源于本地 CLI 索引库，无远程攻击面；无循环内查库（索引单查 + 回退每库一次 COUNT，fixture 级规模，有意不测大规模已在 spec 声明）；`origin` 随 `{...facts}` 进 scan-state 持久化（`scan-state.ts:76`），跨重启语义保留；本 reader 为新建首入库，无旧态 `origin` 缺失迁移问题。

### 结论

- 前轮 finding 复核：f001 已消除、f002 已消除，无修不彻底、无需撤回项。
- 本轮新发现：0 条。
- 总体判断：增量降级与空表误报两处行为缺陷均已按建议方向修复并有回归测试锁定，未引入可观测新缺陷。
- 系统性 follow-up：无。

verdict: PASS

______________________________________________________________________

## Round 3（2026-09-12 08:04 UTC+8，scope 证据轮）

- round：3
- reviewed_at：2026-09-12 08:04 UTC+8
- review_level：full
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t470' diff d25451d57a5e90e8a42e9dff23d8edc1bca33444`
- 落点校验：不带 `-C` 的 `git rev-parse --show-toplevel` 输出为 `/home/testuser/testuser_ubuntu/omni_panel_t470`，通过
- 工作树：`git status --short` 为空（clean），分支 `t470_antigravity_session_discovery_list`，执行 commit `e63f012c` 单一；`git diff --name-only` 共 24 文件，与 Round 2 交付面一致，无新增未跟踪交付文件
- 指纹核验：`repo_task.monitoring.review_scope_fingerprint('d25451d57a5e90e8a42e9dff23d8edc1bca33444', 'docs/archive/tasks/t470_antigravity_session_discovery_list')` 重算为 `4b71b8989bf9c945`，与本轮 prompt 给定指纹一致
    reviewed_scope: 4b71b8989bf9c945
- 范围核实（`git diff` 为准）：业务交付无实质变更。`src/main/core/token-stats/antigravity-reader.ts` 仍 439 行、`src/main/core/token-stats/collector.ts` 仍 1077 行，f001/f002 修复结构原样保留；自 Round 2 后仅允许的流程/格式触动（测试文件 prettier 空格重排、归档 `task.md` 笔记文字），无生产逻辑增删。spec 已随 finish 归档为 `docs/archive/tasks/t470_antigravity_session_discovery_list/spec.md`，内容未变，渲染时 drift 警告按任务指示忽略。

### 前轮 finding 复核（以 diff 与代码为准，不采信自述）

- t470_code_f001（important，增量降级覆盖）：仍消除。`src/main/core/token-stats/antigravity-reader.ts:323` `carry_index_entries` 在 summaries 未变时原样续存 `origin=index` 条目；`:310` `fresh_indexed_ids` 以 `origin!=="fallback"` 为排除集；`:406` 回退循环对索引行恒跳过；`:354` `reconcile_index_rows` 仅索引 mtime 变化时按索引口径重算。锁定测试 `tests/unit/main/core/token-stats/antigravity-reader.test.ts` 内 f001 两用例（库 mtime 抖动零重发、无库索引行跨轮保留）仍在。
- t470_code_f002（minor，空表误报 failed）：仍消除。`src/main/core/token-stats/antigravity-reader.ts:167` `read_summaries` 返回 `ok` 标志，仅 catch 置 `ok:false`（`:188`）；调用方 `:289` 仅 `!read.ok` 置 `file_unreadable`。空表合法锁定测试与损坏仍 failed 测试均保留。

### 本轮新 Findings

无。本轮新增 finding：0 条（新编号自 f003 起，未启用）。7 视角（规格合规/正确性/安全/契约·Breaking/性能·资源/架构·可维护性/健壮性·可观测）已扫 diff 触及路径：新增路径为本地只读静态 SQL（`antigravity-reader.ts:183`、`antigravity-reader.ts:206`），无外部输入拼接；`session_id` 拼路径仅源于本地 CLI 索引库；无循环内查库（索引单查＋回退每库一次 COUNT）；`origin` 随 facts 进 scan-state 持久化（`scan-state.ts:76` 泛型路径）；`tokenStatsSourceSchema` 仅新增 `antigravity` 枚举值（`src/shared/types/token-stats.ts:13`），无公开签名 breaking；UI 侧仅 `format_session_tokens` 分支（`session-library-utils.ts:40`）其余为调用点替换。

### 未进表的提示（不 blocking）

- 文件过大：`antigravity-reader.ts` 439 行（≥400 实现源码线，新建即超阈值，按降级规则不进表）；`collector.ts` 1077 行（Round 1 已提示，本轮无新增实质逻辑）——仍只提示后续拆分。
- 复杂度：拆分后 `scan_antigravity_sessions` CC≈5、`reconcile_fallback_dbs` CC≈6，均未达 ≥10 提示线。
- 范围外观察：`AGENT_COLOR_VAR` 未补 agy 系有意决定（DESIGN 无 agy token，沿 t456 回退 primary，`task.md` 已记录）；vendor/logo/resume/locator/extractor 接线均为 t455/t456 pre-existing，满足 AC-001/AC-002；`summaries.db` 缺失视为空索引、全量回退，store 侧 upsert 保留故无丢失。以上均不进表。

### 结论

- 前轮 finding 复核：f001 仍消除、f002 仍消除，无修不彻底、无需撤回项。
- 本轮新发现：0 条。
- 总体判断：自 Round 2 后无实质变更，前轮 blocker 仍消除且无新 blocker。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001（会话库出现 agy 行/`source_counts`/logo）：`re_verified`——直查 `antigravity-reader.ts:335` emit `source: "antigravity"`、`collector.ts:704` `antigravity_index` 接线、`token-stats.ts:13` schema 接纳、`token-stats-store.ts:1578` `source_counts` 按 source 通用 GROUP BY（无需改码即含 agy），测试断言见 `antigravity-reader.test.ts:102` 与 `token-stats-store.test.ts` sources 过滤用例。
- AC-002（预览与续接可用）：`re_verified`——`session-library-utils.ts` 外预览/卡片/行/同屏四处统一走 `format_session_tokens` 且正文提取沿 t455 链（`subscription-service.ts:417`/`session-locator.ts:320` pre-existing，无需本 task 再改）；`session-resume.ts:15` `agy --conversation {session_id}` 预存。
- AC-003（tokens 显示未知、排序有定义）：`re_verified`——`session-library-utils.ts:40` agy 返回“未知”；生产 tokens 全 0（`antigravity-reader.ts:338` push）；排序/过滤锁定见 `token-stats-store.test.ts` agy/zero/big 用例与卡片未知断言。
- AC-004（代理面板排除 agy）：`re_verified`——`src/renderer/lib/token-stats/types.ts:6` `AgentFilter` 无 agy、`TokenStatsView.tsx:31` `AGENT_OPTIONS` 无 agy，records/dashboard schema 拒绝断言见 `antigravity_panels_wiring.test.ts`。

coverage = 4 / 4。

verdict: PASS
