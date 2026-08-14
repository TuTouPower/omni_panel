# Task review t387（reviewer_focus: 代码）

- task：`t387_token_stats_rollup_directory_join`
- spec：`docs/tasks/t387_token_stats_rollup_directory_join/spec.md`
- diff_anchor：`f38ba45f879383dc83ef342589e0d304b91366dc`
- target：`git diff f38ba45f879383dc83ef342589e0d304b91366dc`
- round：1
- reviewed_at：2026-08-15 07:40 UTC+8

## Findings

### t387_code_f001 - AC-003 会话列表对跨多 directory 会话的 calls/tokens 被低估，rollup ready 与 records 路径展示不一致

- 严重度：important
- 锚点：行为缺陷——同 session 跨两 directory 时，rollup ready 路径会话列表显示单 directory 的 calls/tokens（低估），与 records 路径（全量）不一致。AC-001 的对齐目标（rollup == records）只覆盖 summary 汇总，会话列表这条消费者未对齐。
- 位置：`src/main/core/token-stats/token-stats-store.ts:790`（`dashboard_session_page_from_meta` 的 `GROUP BY source, env, session_id`）
- 问题：`GROUP BY source, env, session_id` 只分组不聚合，SQLite 对 `calls/input_tokens/output_tokens/cache_*` 等非聚合列取组内任意一行。rollup ready 路径 `session_meta` 按 `(source, env, session_id, directory)` 建行（`materialize_session_meta` from_records=false 分支，token-stats-store.ts:652-661），每 directory 一行都是「directory 级窗口聚合」，不是「session 级全量」。跨多 directory 会话在会话列表只显示一个 directory 的部分数字。用 .scratch 复验（同 s9 两目录各 1 条 record，input 10+20=30）：records 路径会话列表 s9 `calls=2 input=30`；rollup ready 路径 `calls=1 input=10 directory=/proj/a`。两路径 summary 均正确（calls=2），与 rollup 会话列表的 `calls=1` 自相矛盾。records 路径 `session_meta` 本就每 session 一行（rn=1 全量聚合），GROUP BY 是 no-op，故两读路径展示结果不一致。注释「calls/汇总为窗口级聚合一致」（:779-780）对单 directory 成立，对跨 directory 会话不成立，有误导。修复方向明确（对该组 SUM 各 token 列，`title/started_at/ended_at` 每 session 一致可取任意行或 `MAX/MIN`；`directory` 归属需按既有 records 路径语义定义——最新记录目录）。该低估在修复前同样存在（重复的 partial 行），本 diff 改变了形状但未修数字，属本 task 直接修复主题（rollup 跨多 directory 正确性）内的遗漏。
- 建议：`dashboard_session_page_from_meta` 改为对跨 directory 行做汇总：`SELECT source, env, session_id, title, directory, started_at, ended_at, SUM(calls), SUM(input_tokens), ... FROM session_meta GROUP BY source, env, session_id`（title/started_at/ended_at 每 session 一致）；并在 AC-003 测试中追加断言「会话列表 s9 的 calls/tokens == records 路径会话列表值（calls=2）」以锁住数字而非只锁去重。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：1 条（f001 important）
- 未进表的提示：
  - AC-001 已核对通过：LEFT JOIN 子查询 `GROUP BY source, env, session_id` 取 title 正确——from_records=false 分支的 UPDATE（:697-720）按 `(source, env, session_id)` 全量设置 title/started_at/ended_at，同 session 各行一致，SQLite 非聚合列取任意行无歧义；window_rows 每行只匹配一行 m，SUM 不再放大（复验两路径 summary 一致且 calls=2）；窗口裁剪语义不变（join 键仍仅 source/env/session_id）。该正确性依赖「物化保证同 session 各行 title 一致」这一前置，若未来 materialize_session_meta 改为按 directory 取 title 会静默错取，属耦合脆弱性提示，非当前缺陷。
  - AC-003 去重本身正确：`total` 用子查询 `COUNT(DISTINCT session)` 与 rows 的 GROUP BY 去重口径一致，LIMIT/OFFSET 与 has_more 计算无错位。
  - 文件过大：`src/main/core/token-stats/token-stats-store.ts` 1676 行（≥400 minor 阈值）、`tests/unit/main/core/token-stats/token-stats-store.test.ts` 2721 行（≥600 minor 阈值），但本 task 仅分别净增 15 / 72 行，不满足「本 task 净增超阈值」出 finding 条件，仅提示。
  - 复杂度：无新增分支，无 ≥15 函数。
  - 范围：diff 仅动 token-stats-store.ts、测试、task.md front matter，无越界；SQL 全参数化 prepare，无注入；无公开契约变更。
- 总体判断：AC-001/AC-002 正确落地、既有测试全绿（101 passed），但 AC-003 会话列表对跨多 directory 会话的数字低估且两读路径展示不一致，是修复主题内的数据正确性遗漏，未解决，判 FAIL。
- 系统性 follow-up：建议单列 task（slug 建议 `token_stats_session_list_multi_directory_totals`），或在 t387 内补修后重审。

reviewed_scope: 02e3e600f7bd3439

verdict: FAIL

---

## Round 2

- reviewed_at：2026-08-15 07:45 UTC+8
- reviewed_scope：`c063eda7673e01e2`
- target：`git diff f38ba45f879383dc83ef342589e0d304b91366dc`（当前工作区）

### 前轮 finding 复核

- **t387_code_f001（important）——已修**，以 diff 与实测为准：
  - `dashboard_session_page_from_meta` 改为 `GROUP BY source, env, session_id` + `SUM(calls/tokens)` + `MAX(title)/MAX(directory)/MIN(started_at)/MAX(ended_at)`（token-stats-store.ts:779-797）。
  - 实测复核（tsx 脚本，同 s9 跨两目录 /proj/a + /proj/b）：修复前 rollup 会话列表 `calls=1/input=10`（低估），修复后 `calls=2/input=30`，与 records 路径及 summary（calls=2）三方一致。
  - 无副作用核查：`started_at/ended_at/title` 在 from_records=false 分支按 session 全量 UPDATE（:697-720），同 session 各行一致，MIN/MAX 取回原值不引入新语义；records 路径 session_meta 每 session 一行（rn=1），SUM(单行) 不放大，无双重计数。
  - `ORDER BY ended_at DESC` 引用聚合别名合法（SQLite），语义升级为「按每 session 最近活跃排序」，正确。
  - `total`（去重子查询）与 rows（GROUP BY session）口径一致，LIMIT/OFFSET/has_more 无错位。
  - 测试补强到位：AC-001 补 `is_hour_rollup_ready()` 断言（防 rollup 未 ready 使 after 走 records 路径、对比空转）；AC-003 补 `sessions[0].calls === 2` 聚合断言（锁数字而非只锁去重）。

### 本轮新发现

### t387_code_f002 - 跨多 directory 会话的 directory 归属与 records 路径不一致（MAX(dictionary) vs 最新记录目录）

- 严重度：minor
- 锚点：行为缺陷——跨多 directory 会话，rollup ready 路径会话列表 directory 取 `MAX(directory)`（字典序最大），records 路径取窗口内最新记录目录（rn=1），可复现展示不一致。
- 位置：`src/main/core/token-stats/token-stats-store.ts:781`（`MAX(directory) AS directory`）
- 问题：修复 f001 时 directory 用 `MAX(directory)`，确定性但无语义依据。records 路径 session_meta 的 directory 来自 `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY timestamp DESC)` rn=1 行，即最新记录目录。tsx 复验（s9：`/z` @08:30 + `/a` @09:30，最新记录为 `/a`）：records 路径显示 `/a`，rollup 路径显示 `/z`（MAX 字典序）。calls/tokens 已一致（f001 修复），仅 directory 展示字段差异。spec 风险段已声明「同 session 多 directory 该取哪个 directory 归属」语义由方案自决，非 AC 违反；跨多 directory 会话罕见，directory 为展示字段，不构成数据汇总错误。
- 建议：对齐 records 语义则 rollup 路径也取最新记录目录（在 materialize_session_meta 的 UPDATE 一并写最新记录 directory）；或明确接受 `MAX(directory)` 语义并在测试补两路径 directory 断言锁死。

### 结论

- 前轮 finding 复核：f001 已修（数字复验三方一致，无副作用）。
- 本轮新发现：1 条（f002 minor）。
- 未进表的提示：`src/main/core/token-stats/token-stats-store.ts` 1676 行、测试 2721 行仍超阈值但本 task 净增（24/81 行）未达出 finding 条件，仅提示；无新增复杂度分支；范围仍收敛于本 task 文件。
- 总体判断：f001 修复正确，全量 token-stats 300 passed 复跑通过，AC-001/AC-002/AC-003 均落地，无未解决 critical/important；仅有 f002 minor（directory 归属语义，spec 已声明由方案自决），判 PASS。
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: c063eda7673e01e2
