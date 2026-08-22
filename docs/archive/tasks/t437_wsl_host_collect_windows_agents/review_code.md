# Task review t437（reviewer_focus: 代码）

- task：`t437_wsl_host_collect_windows_agents`
- spec：`docs/tasks/t437_wsl_host_collect_windows_agents/spec.md`
- diff_anchor：`80398ac99707accadaa30d343374f813873da901`
- target：`git diff 80398ac99707accadaa30d343374f813873da901`
- round：1
- reviewed_at：2026-08-23 03:53 UTC+8

## Findings

### t437_code_f001 - 过期 `local` 注释残留于 diff 触及文件（JSDoc 与已改语义不一致）

- 严重度：minor
- 锚点：AC-006（文档与代码不再声称旧 env 模型）；「文档与实现不一致」维度
- 位置：`src/main/core/session-history/session-locator.ts:102,104`；`src/main/core/session-history/subscription-service.ts:7`
- 问题：这两个文件是本次 diff 重写 env 模型的目标文件（头注释已更新为 t437 四值语义），但局部注释漏改，仍在描述 pre-t437 的 `local` 模型：
    1. `session-locator.ts:102` `/** os.homedir()；非 Windows 宿主 local 源基路径。 */` 与 `:104` `/** Windows 宿主 user home（win_home；非 Windows 宿主 local 源不用）。 */` —— 新语义应为 `linux`/`mac` 源基路径、`win` 源用 win_home；
    2. `subscription-service.ts:7` 模块头「- local + claude_code（本机 JSONL）→ fs.watch；」—— 与下方已改的 `pick_strategy`（`env !== "wsl" && claude_code → watch`，`:179-181`）及其 doc 注释（`:176`「win/linux/mac + claude_code」）直接矛盾。
        注释不产生行为影响，但给后续维护者留下与 t437 语义冲突的描述，且全仓 `local` 清零（AC-005 精神）不彻底。
- 建议：改写为四值语义（`linux`/`mac` → homedir、`win` → win_home；`win/linux/mac + claude_code → fs.watch`）。`src/main/index.ts:489,514` 的同类过期注释不在 diff 内，见结论段提示。

## 结论

- 前轮 finding 复核（Round 1，无）
- 本轮新发现：1 条（全 minor）
- 未进表的提示：
    - **文件过大**（已达阈值且本 task 净增，按降级规则列于此，不进 finding 表）：
        - `src/main/core/token-stats/token-stats-store.ts`：1856 行（净增 +164，超 800 重要阈值）
        - `tests/unit/main/core/token-stats/token-stats-store.test.ts`：3100 行（净增 +167，超 1200 重要阈值）
        - `src/main/core/token-stats/collector.ts`：842 行（净增 +3，超 800 阈值）
        - `tests/unit/main/core/token-stats/collector.test.ts`：1432 行（净增 +17，超 1200 阈值）
            均为既有大文件本 task 持续堆大，未见不可拆硬约束说明；v8 迁移块（store.ts:343-494）本身模块化良好（纯函数 + 表驱动），可考虑后续提取独立文件。
    - **复杂度**：`migrate_legacy_table`（store.ts:374-443）手算 McCabe ≈10（基数 1 + 9 分支），本 task 新建、恰达提示阈值；逻辑为表驱动 + 单一职责，可读性尚可，仅提示不阻断。
    - **范围外观察**（不进 finding 表）：
        - `src/main/index.ts:489,514` 过期注释（「local 源基路径」「对齐为 local|wsl」）——文件不在 diff 内，与 f001 同类，建议 implementer 一并清理。
        - `paths.ts` `resolve()`（:62-80）对未知 env（含 `local`）静默回退 wsl 分支——既有 fall-through 模式（pre-t437 同样回退），现无现实触发路径（UI 枚举与迁移后数据均已无 local）；HTTP 层对 `env` 参数本就无 schema 校验（既有设计），不构成新回归。
        - 迁移后 scan-state JSON / session-path-index 中旧 `*_local` / `claude_code|local|…` key 永不被消费但随 save 反复写盘，首次启动全量重扫一次——一次性迁移副作用，可接受；如需可后续清理旧 key（与 test reviewer 结论一致）。
        - v8 迁移对理论「local+win 同主键判到同一目标」行取 MAX 合并（较小计数丢弃）而非 SUM——spike s032 结论 #7 已批准该策略；且 v7 先执行（win→local 原地改写，冲突即 PK 违例）保证该路径在实际迁移链中不可达，不构成 AC-002「行数/合计不减少」的违规。
- 总体判断：实现与 spec 六条 AC 对齐——schema 四值枚举、v8 迁移（分类规则与 d048 一致、事务原子、幂等、buckets 重建、hour_rollup 置 unready）、collector 平台源按宿主派生、UI 筛选四平台中文标签 + 旧 prefs 回退、全仓生产代码无 local 写入路径、t308 注释改写合规。唯一 finding 为注释过期（minor），无未解决 critical / important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。读 `token-stats.ts:10`（`z.enum(["win","wsl","linux","mac"])`）与 dashboard platform schema（:296）；`tests/unit/shared/token-stats.test.ts:323-342` 显式断言 `safeParse("local").success === false`（env 与 dashboard platform 两处），重跑 31 tests 全绿。
- AC-002：`re_verified`。重跑 `token-stats-store.test.ts` 110 tests 全绿；逐行核对 v8 迁移（store.ts:343-494, 1085-1102）：三表分类（daily 先 join sessions 取 directory、孤儿 → 宿主默认）、同键 merge、整体 DELETE+INSERT 规避 PK 冲突、buckets 全量重建、hour_rollup 清空置 unready、迁移整体包在事务内、`user_version` 门控幂等；测试断言分类/merge/行数/聚合/幂等。
- AC-003：`re_verified`。重跑 collector/paths/readers/session-locator 测试全绿；核对 collector.ts:242-353（平台源按宿主生成：windows→win、linux→linux、macos→mac，key 与 env 一致；`set_collector_host` 重建 sources；WSL 五源不变）、paths.ts:62-80（win→win_home+win32、linux/mac→homedir+posix）。
- AC-004：`re_verified`。重跑 `token_stats_view.test.tsx` 37 tests 全绿；PLATFORM_OPTIONS = `all/win/wsl/linux/mac` 中文标签（TokenStatsView.tsx:39-45）；prefs 残留 `local` 回退 all（:187-197 + 专测「t437: prefs 残留旧平台值 local 时回退 all」）；选 win 请求 platform=win 参数断言。
- AC-005：`re_verified`。grep 全仓 `env` 赋 `local` 字面量：src 生产代码仅剩 v7 迁移 SQL（迁移链输入，AC 明确允许）与 connector/observation 无关概念（非范围）；无任何新写入路径产出 local。测试侧残留两处（`SessionShell.test.tsx:242`、`collector.test.ts:1243`）已由 test reviewer f002 覆盖，不重复。
- AC-006：`re_verified`。读 store.ts:1071-1075 v7 注释已改写为「t308 历史命名，被 t437 v8 逆转废止，仅保留迁移链兼容」，不再声称「Windows 原生源叫 local」；v7 SQL 保留属旧库迁移链必需，非死分支。
- 覆盖率：`coverage = 6 / 6`。无 trust_prior 项（全部本地单测可复验）。

reviewed_scope: d3c98960e942ff46

verdict: PASS

## Round 2 (2026-08-23 04:04 UTC+8)

### 前轮 finding 复核

- **t437_code_f001（minor）**：已消除，修复无副作用。证据（以 `git diff 80398ac9` 为准）：
    - `session-locator.ts:100,103`（原 :102,104）注释已改：「`os.homedir()；linux/mac 源基路径。`」「`Windows 宿主 user home（win_home；仅 win 源使用）。`」；头注释与 `resolve_grok` 内注释（:335）同步改四值语义。
    - `subscription-service.ts:7` 模块头已改：「`win/linux/mac + claude_code（本机 JSONL）→ fs.watch；`」与 :176-181 `pick_strategy` doc 及实现一致。
    - 配套语义更新（不止注释）：`Env` 类型 `"local" | "wsl"` → 四值（:43-44）；`pick_strategy` 条件 `env === "local"` → `env !== "wsl"`（:179-181）。
    - 行为等价核查：pre-t437 `local` 语义 = 三平台本机源（win_home/POSIX home），新 `env !== "wsl" && claude_code → watch` 恰好覆盖 win/linux/mac；wsl（UNC 9P）恒 poll 不变。无回归。
    - 测试配套：`watcher.test.ts` pick_strategy 表驱动扩为 win/linux/mac × claude_code → watch、wsl × 全部 → poll；`subscription-service.test.ts` / `session-locator.test.ts` / `session-path-index.test.ts` 全部 `"local"` 值改对应平台值（linux_paths→linux、macos_paths→mac、win_paths→win），语义与路径输入一致。

### 本轮新发现

0 条。全 diff 复审（含 f001 修复波及面）未见新的 critical / important / minor。

复审覆盖要点：

- **AC-001/005 防线**：`token-stats.ts:10` `z.enum(["win","wsl","linux","mac"])`；新增 `paths.test.ts:152` 与 `session-locator.test.ts:337` 正则守卫扫 `env\s*(?::|={1,3}|!==|!=)\s*["']local["']`（AC-005 持续防线）；`shared/token-stats.test.ts` 新增 `rejects the removed local label`。grep 全仓 src/scripts：残留 `"local"` 均为注释、connector source（`auth-flow-registry.ts:28`，非范围）、plugin schema（`shared/schemas/`，无关概念）。
- **v8 迁移**（`store.ts:343-497` 迁移块 + `:1085-1102` 入口）：三表分类规则与 d048 一致；`daily` 先于 `sessions` 迁移，用迁移前 `(id,source)→directory` 快照 join，孤儿 → 宿主默认；碰撞 merge（token MAX / started_at MIN / ended_at MAX / 其余首非 NULL / updated_at MAX）；整体 DELETE 源行 + INSERT 规避 PK 冲突；事务原子 + `user_version` 门控幂等；buckets 全量重建、hour_rollup 清空置 unready。核实三表主键列全为 TEXT（`store.ts:196-248`），`migrate_legacy_table` 的 key 拼接对非 string 列退化 `""` 的风险不触发。
- **collector 平台源**（`collector.ts:242-296`）：`PLATFORM_ENV_BY_HOST` + `platform_source_defs(host)` 按宿主生成五源（key `claude_costs_win`/`kimi_linux` 等），`set_collector_host` 重建 sources；任一宿主只有一个平台变体参与（sources_status 不增噪音）；wsl 五源静态不变。生产路径（index.ts）不调用 `set_collector_host`。
- **paths.ts `resolve`**（:62-80）：win→`win_home`+win32、linux/mac→`homedir`+posix、wsl→UNC；与原 `local` 分支逐宿主持平（windows 宿主用 win_home 是 pre-t437 既有行为，非新回归）。
- **UI**（`TokenStatsView.tsx:39-45,187-197`）：PLATFORM_OPTIONS 五值中文标签、prefs 残留 `local` 回退 all，均有专测。
- **server.ts**：仅 cast 类型收窄为 `TokenStatsEnv`（4 处），无行为变更；HTTP 层 env 不校验为既有设计（:333 注释），dashboard 的 platform 走 schema 五值校验。
- **测试配套**：47 个 diff 文件全部改值合理（无「把断言改成接受 local」的弱化，`token_stats_dashboard.test.ts:251` 仍以 `env:"local"` 断言 schema 拒绝——语义正确）。

### 未进表提示

- **文件过大**（同 Round 1 四文件，本轮净增仅注释/测试值替换，无实质增长，按降级规则列于此）：`token-stats-store.ts` 1856 行、`collector.ts` 842 行、`token-stats-store.test.ts` 3100 行、`collector.test.ts` 1432 行。
- **复杂度**：`migrate_legacy_table`（store.ts:374-443）手算 McCabe ≈10，恰达提示阈值；表驱动 + 单一职责，可读性尚可，仅提示。
- **范围外观察**：`src/main/index.ts:489,514` 过期注释（「local 源基路径」「对齐为 local|wsl」）仍存——不在本 diff 内（f001 修复未触及 index.ts），与 f001 同类，建议后续顺手清理，不进 finding。

### AC 复验方式

- AC-001：`re_verified`。读 `token-stats.ts:10` 四值 `z.enum`；重跑 `shared/token-stats.test.ts`（`rejects the removed local label`）与 `paths.test.ts` 守卫用例全绿。
- AC-002：`re_verified`。重跑 `token-stats-store.test.ts`（v8 迁移分类/merge/守恒/幂等 + `legacy_env_from_directory` 4 用例）全绿；逐行核对迁移 SQL 与事务边界。
- AC-003：`re_verified`。重跑 `collector.test.ts`（`host=macos 平台源 env=mac`、`host=linux`、windows host 路径）与 `paths.test.ts` 全绿；断言平台源 env 与宿主一致、wsl unavailable、无 local 残留。
- AC-004：`re_verified`。重跑 `token_stats_view.test.tsx`（五值选项无 local、prefs 回退、selectOptions win → platform=win）与 dashboard schema 测试全绿。
- AC-005：`re_verified`。grep src/scripts 无新写入 local 路径；两处正则守卫测试存在且覆盖被扫文件清单；测试侧 local 字面量仅存于「构造迁移前旧库」输入（AC 明确允许）。
- AC-006：`re_verified`。读 `store.ts:1071-1075` v7 注释已改写，不再声称「Windows 原生源叫 local」。
- 覆盖率：`coverage = 6 / 6`。无 trust_prior 项。

### 总体判断

Round 1 唯一 finding（t437_code_f001）已修且修复无副作用；全 diff 复审未发现新的 critical / important / minor。测试验证：`vitest run` 48 文件 888 测试（session-history/token-stats/shared/ipc/local-api/main-panel/renderer/web）全绿，`tests/integration/` 34 文件 528 测试全绿，剩余 renderer 20 文件 259 测试全绿。可进入收尾。

reviewed_scope: d3c98960e942ff46

verdict: PASS

## Round 3 (2026-08-23 04:10 UTC+8)

窄范围复核：Round 2 PASS 后仅 2 处测试文件改动（无生产代码）。

### 生产代码零变化核验

- 抽查 Round 2 报告引用的关键锚点，与报告描述逐字一致：`token-stats.ts:10` 四值 `z.enum(["win","wsl","linux","mac"])`；`session-locator.ts:100,103` 注释「linux/mac 源基路径」「仅 win 源使用」；`store.ts:1071-1095` v7 注释改写 + v8 迁移（分类规则/merge/buckets 重建/hour_rollup 置 unready/事务+user_version 门控）；`collector.ts:241-296` `PLATFORM_ENV_BY_HOST` + `platform_source_defs` + 静态 WSL 五源；`paths.ts:62-80` `resolve`（win→win_home+win32、linux/mac→homedir+posix、wsl→UNC）；`TokenStatsView.tsx:39-45` 五值中文标签、`:187-197` prefs 残留 local 回退 all；`subscription-service.ts:7` 模块头 + `:176-181` `pick_strategy`（`env !== "wsl" && claude_code → watch`）。
- grep `src/` `scripts/`：`local` 残留仅 v7/v8 迁移 SQL 输入（`WHERE env IN ('local','win')`，AC 允许的迁移链输入）与「替代 pre-t437 的 local」注释，与 Round 2 描述一致；无任何新写入路径产出 local。
- 说明：改动未 commit（无 Round 2 时点快照可做 diff 级比对），以上基于父 agent 声明 + 锚点抽查 + 两处测试文件全量内容核验，未发现生产代码被触碰。

### 本轮改动复核（code 视角，评审测试层之外的命名/数据一致性）

1. `SessionLibrary.test.tsx:1212-1213`（mock summaries key env local→linux）：
    - key 格式与生产一致（`source|env|session_id`，`session-path-index.ts:37` / `subscription-service.ts:171` / `session-history-ipc.ts:85`）；与 fixture 一致（`sess()` 默认 `env: "linux"`，SESSIONS a/b/c 全 linux）；与断言一致（`:1223-1225` 期望 `env: "linux"`）。纯数据值对齐，正确。
    - 未引入新问题。运行该文件 42 tests 全绿。
2. `session-locator.test.ts`（7 处 describe/it 名与注释「local 源」→平台称谓）：
    - 全文件通读：describe/it 名与注释已全部为平台称谓（linux 源/mac 源/win 源/wsl 源），与测试内容一致；残留 `local` 字样仅 `.local`（opencode 真实 XDG 目录，`:122,210,291,306`）、`wsl.localhost`（UNC 路径，`:223-312`）、守卫测试自身（`:337-351`），均非 env 称谓，正确保留。
    - 未引入新问题。运行该文件 17 tests 全绿。

### 前轮 finding 复核

- t437_code_f001（minor）：Round 2 已判消除，本轮生产零变化核验未发现回退，维持已消除。
- Round 2 零新发现，无遗留项。

### 本轮新发现

0 条。

### 未进表提示

- `SessionLibrary.test.tsx` 运行中有既存 act 警告（SessionCard2 异步 setState 未包 act）——与本轮纯字符串 mock 值改动无关，属既有测试结构问题，仅提示，不进 finding。
- 文件过大/复杂度：与 Round 1/2 同（token-stats-store.ts 1856、collector.ts 842、token-stats-store.test.ts 3100、collector.test.ts 1432），本轮无实质增长。
- 范围外观察：`src/main/index.ts:489,514` 过期注释仍存（Round 1/2 已提示），不在本 diff。

### AC 复验方式

- 本轮为窄范围复核：生产代码零变化（锚点抽查一致），AC 复验以 Round 2 结论为准（`coverage = 6 / 6`，全部 re_verified）。
- 本轮新增复核点：AC-005 精神延续——两处测试改动均把残留 local 字面量清零（mock key、describe/it 名与注释），无把断言改成接受 local 的弱化；`re_verified`（grep + 全文件通读 + 59 tests 全绿）。
- 覆盖率：`coverage = 6 / 6`（承 Round 2 复验结果，本轮无 trust_prior 项）。

### 总体判断

Round 2 后仅 2 处测试文件改动，均属 AC-005 清零的收尾（mock key 与 describe/it 名/注释 local→平台称谓），数据与命名一致、无弱化断言、两文件 59 tests 全绿；生产代码锚点抽查零变化。无未解决 critical / important / minor，可进入收尾。

reviewed_scope: f8e1dc627217cdfe

verdict: PASS

## Round 4 (2026-08-23 04:16 UTC+8)

文档轮：Step 7a 收尾文档更新（纯 markdown，无代码/测试改动）。指纹已自行验证：`monitoring.review_scope_fingerprint` 实算 = `e1470192903fa97f`，与重渲染 prompt 一致（MATCH）。

### 本轮新增 docs 改动核对（git diff 80398ac -- docs/，对照已审实现）

01. **env 四值表述**：architecture.md:44（`win|wsl|linux|mac`，t437 废除 t308 的 `local`，按数据所在平台；homedir 只服务 linux/mac 源、win_home 只服务 win 源）、domain.md §3.4（四值定义逐字与 spec 范围一致）、api spec:133（env 标签段）、ui spec（会话表环境列 + 筛选表四值 + prefs 残留回退「全部」）——全部与实现（token-stats.ts / paths.ts / TokenStatsView.tsx）一致。
02. **迁移 v8 规则**：api spec:283 与 store.ts 实现逐条一致（`env IN ('local','win')` 按 directory 分类：盘符→win、/Users/→mac、其余 POSIX→linux、NULL/daily 孤儿→宿主默认；同主键碰撞 merge token MAX/started_at MIN/ended_at MAX；buckets 由迁移后 daily 重建；hour_rollup 清空置 `hour_rollup_ready=0`；user_version=8）。spec.md 未知契约清单已由 `UNVERIFIED-SPIKE` 替换为 d048 结论（Round 1 前完成，本轮复核与 s032 证据一致）。
03. **源 key 命名**：architecture.md:148、api spec §2.4、domain.md §3.2 的 `grok_linux`/`grok_mac`（原 `grok_local`）与 collector.ts `platform_source_defs`（key `grok_${env}` 等，t437）一致。
04. **ADR 022 与 ADR 016 关系**：decisions.md:211-215 废止 016 的「local=进程所在 OS」语义、保留 016 路径层纯函数结构；016/017（:166-177）作为历史 ADR 原文保留、由 022 显式废止——无矛盾。p204 背景、选 B 理由、破坏性升级不留 local 兼容读写、connector observation `source:"local"` 不受影响、为 t438 铺路，均与 spec 决策一致。
05. **无「Windows 原生源叫 local」现役表述**：全仓 blueprint/specs 残留 local 均为历史标注（「t437 前为 local」「v7（t308，历史）…已被 v8 逆转废止」）或 ADR 016/017 历史正文，无现役声称。
06. **specs_index 挂 t437**：ai-cli-token-stats-api / ai-cli-token-stats-ui 两行追加 t437、日期 2026-08-23 ✓。
07. **p205 登记**：`docs/pending/todo/p205_index_stale_local_env_comments.md`（未跟踪新文件）登记 index.ts:489-490,514 过期注释（Round 1-3 结论段反复提示的范围外残留），处理未开——收尾闭环正确。
08. **task.md 收尾**：验收「全部满足」+ 证据摘要、处置表 Round 1/2（f005/f006 即 Round 3 复核的两处测试改动）、verdict 汇总（code/test 各 Round PASS）与本轮前各报告一致。
09. **d048 / s032**：内容与 spec 上下文区引用一致（Round 1 前定稿，本轮复核未发现漂移）。
10. **会话库 UI spec**：无独立平台筛选 spec（SessionLibrary 仅 source 维度）；「会话库平台筛选文案」对应 ai-cli-token-stats-ui.md 环境筛选，已更新，无遗漏。

### 本轮新发现

### t437_code_f002 - 收尾新增文档的编号顺序错乱（组织偏好）

- 严重度：minor
- 锚点：「文档与规格一致性（仅 diff 相关）」维度；风格/文件组织偏好
- 位置：`docs/blueprint/domain.md:51,59,63`；`docs/specs/ai-cli-token-stats-api.md:281-284`
- 问题：两处新增内容破坏了编号/顺序可读性：
    1. domain.md 新增 `## 3.4 token-stats env 平台标签（t437）`（:59）插在 `## 3.1`（:51）与 `## 3.2`（:63）之间，顺序 3.1→3.4→3.2 跳号（既有 3.1/3.2/3.3 本就乱序、3.3 为三级标题归属 §3，新增节延续既有乱序但自身编号 3.4 未重排）。
    2. api spec 迁移版本列表新增 v7/v8（:282-283）插在 v6 前，列表顺序 v2,v3,v4,v5,v7,v8,v6——v6 排在 v8 后，读者按序读会误以为 v6 是最新迁移（实际执行顺序 v6→v7→v8）。
- 建议：domain.md 将 §3.4 移至 §3.2 之后并按既有编号体系重排；api spec 迁移列表按版本升序重排（v6 移至 v5 后）。纯排版，无行为影响。

### 前轮 finding 复核

- t437_code_f001（minor）：Round 2 已判消除，本轮 docs 核对未见相关回退，维持已消除。
- Round 2/3 零 finding，无遗留。

### 未进表提示

- 文件过大/复杂度：与 Round 1-3 同（token-stats-store.ts 1856、collector.ts 842、token-stats-store.test.ts 3100、collector.test.ts 1432），本轮无代码改动无增长。
- 范围外观察：p205 已登记 index.ts 过期注释（Round 1-3 提示项，收尾闭环）；architecture.md:187「t310 env win→local 重构」为历史事实描述，非现役表述，无需改。
- 范围外观察：domain.md §3.1/3.2/3.3 乱序为既有状态（非本轮引入），仅新增 §3.4 延续，故 f002 定 minor 而非要求重构整个编号体系。

### AC 复验方式

- 本轮为文档轮（纯 markdown），AC 复验承 Round 2 结论（`coverage = 6 / 6`，全部 re_verified）；本轮核对项（env 四值 / v8 迁移规则 / 源 key / ADR 关系 / local 清零 / specs_index）均为 `re_verified`（逐条对照 diff 与已审实现，见上 1-10）。
- 覆盖率：`coverage = 6 / 6`（承 Round 2 复验结果，本轮无 trust_prior 项）。

### 总体判断

收尾文档与已审实现一致：env 四值、迁移 v8、源 key 命名、ADR 022/016 关系、local 表述清零、specs_index 挂 t437、p205 遗留登记全部正确；仅 1 条 minor（编号顺序错乱，无行为影响）。无未解决 critical / important，可进入收尾。

reviewed_scope: e1470192903fa97f

verdict: PASS

## Round 5 (2026-08-23 04:22 UTC+8)

窄复核：f002（文档排序）修复核验。指纹已自行验证：`monitoring.review_scope_fingerprint` 实算 = `2aa5f2cafcdbc4c8`，与重渲染 prompt 一致（MATCH）。

### f002 修复核验（git diff 80398ac -- docs/blueprint/domain.md docs/specs/ai-cli-token-stats-api.md）

1. **domain.md §3.4 位置**：已从 §3.1 与 §3.2 之间移至 §3.2 之后（现顺序 `## 3.1` → `## 3.2` → `## 3.4` → `## 4`），跳号消除。§3.4 正文逐字未变（四值定义、v8 迁移、connector observation 区分，与 Round 4 核对文本一致）。§3.3 为三级标题归属 §3（既有状态，非本轮引入），f002 建议的「按既有编号体系重排」已按最小修复完成位置调整。
2. **api spec 迁移列表顺序**：恢复升序 v4 → v5 → v6 → v7 → v8（v6 移至 v7 前），v7/v8 行文字逐字未变（v7 历史标注「已被 v8 逆转废止」、v8 分类/merge/buckets/rollup 规则）。
3. **内容未变确认**：两文件除位置重排外无文字改动；其余 docs 文件清单与 Round 4 完全一致（10 文件，无新增）；src/tests/scripts 43 文件与 Round 1-3 一致。Round 4 后无其它新改动。

### 本轮新发现

0 条。

### 前轮 finding 复核

- t437_code_f002（minor）：已修，修复为纯位置重排、文字未动、无副作用，消除。
- t437_code_f001（minor）及 Round 2/3/4 其余项：无回退，维持。

### 未进表提示

- 文件过大/复杂度：与 Round 1-4 同（无代码改动，无增长）。
- 范围外观察：domain.md §3.3 三级标题归属 §3 的编号体系混合为既有状态，f002 已按最小修复处理 §3.4 位置，不另起任务。

### AC 复验方式

- 本轮为窄复核（纯文档位置重排），AC 复验承 Round 2/4 结论（`coverage = 6 / 6`，全部 re_verified）；本轮核验项（文档顺序、内容未变）为 `re_verified`（逐字对照 diff）。
- 覆盖率：`coverage = 6 / 6`（承 Round 2 复验结果，本轮无 trust_prior 项）。

### 总体判断

f002 已修且修复无副作用（纯顺序重排，文字未动），指纹与当前 diff 一致，Round 4 后无其它新改动。无未解决 critical / important / minor，可进入收尾。

reviewed_scope: 2aa5f2cafcdbc4c8

verdict: PASS
