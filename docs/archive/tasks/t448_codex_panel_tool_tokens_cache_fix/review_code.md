# Task review t448（reviewer_focus: 代码）

- task：`t448_codex_panel_tool_tokens_cache_fix`
- spec：`docs/tasks/t448_codex_panel_tool_tokens_cache_fix/spec.md`
- diff_anchor：`2eb2aabba154ae7848cd9b5744f1210db9bd38b8`
- target：`git -C '/home/testuser/testuser_ubuntu/omni_panel_t448' diff 2eb2aabba154ae7848cd9b5744f1210db9bd38b8`
- round：1
- reviewed_at：2026-09-04 20:25 UTC+8

reviewed_scope: 95ab0499c9a458e4

## Findings

### t448_code_f001 - codex 暗色 token 已登记但未接入 `.dark` 翻转别名，暗色主题回退用亮色值

- 严重度：minor
- 锚点：行为缺陷——暗色主题下 codex 识别色不按 DESIGN「明暗成对」取值
- 位置：`src/renderer/styles/globals.css:245-249`（`.dark` 块 agent 翻转列，缺 codex 行）；对比 `DESIGN.md:95`、`src/renderer/styles/globals.css:101`
- 问题：本 diff 新增 DESIGN token `agent-codex-dark: #f06595` 并导出为 `--color-agent-codex-dark`，但 `.dark` 语义翻转区只登记了 claude/grok/opencode/kimi 四项（`--color-agent-*-dark`），未加 `--color-agent-codex: var(--color-agent-codex-dark)`。实测 grep：`--color-agent-codex-dark` 仅 globals.css:101 一处定义、零引用（其它 agent-dark 各被 .dark 别名引用一次）。后果：暗色主题下 `agent_color("codex", "dark")` 经 CSS 变量读到的是 `:root` 亮色值 `#d6336c`，`#f06595` 成为死 token；ECharts FALLBACK_PALETTES.dark.codex（`#f06595`，echarts_token_resolver.ts:162）也永远不生效。`pnpm designmd:check` 通过是预期的——别名区在 `designmd-export:end`（globals.css:149）之外属手写 t268 语义层，drift 不覆盖。其它四家同构，缺一行即漏。
- 建议：在 `src/renderer/styles/globals.css:248`（kimi 行后）补 `--color-agent-codex: var(--color-agent-codex-dark);`，与其余 agent 对齐。

### t448_code_f002 - agent 展示 label 映射散落四份副本，本 diff 新增第五处同形逻辑

- 严重度：minor
- 锚点：DRY——同形 label 映射 verbatim 重复多处，后续新增 agent 需同步 N 处
- 位置：`src/renderer/components/token-stats/SessionTable.tsx:43-49`（新增 `agentBadgeLabel`）；同义映射在 `src/renderer/lib/token-stats/chart-data.ts:43-49`（AGENT_LABELS）、`chart-data.ts:600-606`（BUCKET_AGENT_LABELS）、`chart-data.ts:761-767`（ROLLUP_AGENT_LABELS）
- 问题：本次为 codex 分支在 SessionTable 内新增了与 chart-data AGENT_LABELS 逐字重复的映射（claude-code→"Claude Code"、…、codex→"Codex"），而 AGENT_LABELS 顶部注释仍自称 "matches SessionTable chips"，实际两条映射已物理分离。t448 需在五处各加 codex 属既定范围（spec 已列出位点），但本 diff 的实现没有收敛：抽出 `agentBadgeLabel` 本可与 chart-data 已存在且同值的 AGENT_LABELS 合并为单一导出（如把 AGENT_LABELS 导出后复用），却再造一份副本。未来新增 agent 或改文案时 4~5 处需同步，漏改即 badge 与 donut 显示分叉。
- 建议：将一份权威 label 映射导出（chart-data AGENT_LABELS 提升为 export，或独立 `agent-labels` 模块），SessionTable/buckets/rollup 三处 import 复用，删本地副本。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均 minor，无 blocking）
- 未进表的提示：
    - 文件过大（达阈值且本 task 净增，按规则只列不进表）：`src/renderer/lib/token-stats/chart-data.ts` 1111 行、`src/renderer/components/token-stats/SessionTable.tsx` 414 行。均非本 task 新建，仅小幅增长。
    - 圈复杂度：`codex-reader.ts` `parse_rollout_file`（154-313）单循环多分支，McCabe 约 15，本 task 增缓存差分分支；建议拆分每行处理函数，属提示不进表。
    - 测试侧观察（交 test reviewer，未计入 code finding）：`codex-reader.test.ts` AC-006 的上界断言 `input+cache+output <= 2000+cache` 可化简为 `input+output <= 2000`，在「未归一 input 但透传 cache_delta」的错实现下仍可通过（1800+200=2000 恰好等于 2000 不越界），不能独立识别 input 归一缺失；AC-006「不双重计数」目前只有实现自洽性保障。
    - 范围外/风格：`globals.css:150-151` 在 `designmd-export:end` 下多出一个空行（与本 task 无关的空白改动）；`chart-data.ts:51` 注释「four agents」未随扩到 five 更新（纯文案）。`codex_panels_wiring.test.ts:30-32` 把 t447 旧断言（回退 primary）就地改成新断言——因 t448 设计 token 落地属语义变更，倾向整条删除旧测试更符合 TDD 约定，但语义确实被 spec 取代，未按 blocker 处理，交 test reviewer 判断。

### AC 复验方式

- AC-001：re_verified —— `SessionTable.agentBadgeLabel` 含 codex 分支且默认不再落到 OpenCode；单测 `SessionTable.test.tsx`「agentBadgeLabel (t448 AC-001)」断言 `codex → "Codex"` 通过（全量 `pnpm test` 3488 passed）。
- AC-002：re_verified —— `chart-data.ts` 三套（AGENT_LABELS/BUCKET_AGENT_LABELS/ROLLUP_AGENT_LABELS 与各自 order 数组）均含 codex；单测三口径各断 codex 段独立且无「其他」分组，通过。
- AC-003：re_verified —— DESIGN token 落库并 export（designmd:check 通过），`slots.agent_accent("codex")`/`agent_color("codex")` 返回 codex 独立 var，palette/panel 单测断言非 primary 回退，通过。注：暗色分支存在 f001 回退用亮色值的缺陷，不影响「可分、非 accent」判定，已按 minor 报。
- AC-004：re_verified —— `server.ts` 四处 agent 收窄扩入 "codex"；integration 测试实际起 store+HTTP 断言 `agent=codex` 返回行且字段完整（input/cache_read 不丢），通过。
- AC-005：re_verified（语义层）—— `parse_rollout_file` 改 `delta>0 ? delta : 0` + prev 推 max；AC-005 单测 1000/1000/2500 断言去重后 = 2500 且 < 4500，若回退旧代码（delta\<=0 计全量）该测试会红，红绿有效。真实 rollout 数字（1356472098→196124034 量级）无法在本 worktree 独立重跑（`.scratch` 复现文件未随仓携带），该数值属 trust_prior，AC 已声明不逐字锁定。
- AC-006：re_verified（语义层）—— cache 独立差分 + input 归一 `in_delta - cache_delta` 应用于 sums/daily/records 三处；单测断言 cache>0、逐 record cache>=0 且 input 归一后 `input+cache+output` 不上溢，通过；~0.96 缓存率来自真实文件，属 trust_prior（同上未携带 fixture）。测试上界对「不归一」错实现不敏感，见「未进表提示」。

coverage = 6 / 6（语义层全部 re_verified；AC-005/006 的真实 rollout 数值口径为 trust_prior——复现 fixture 未随仓，建议合并前人工抽查该两项或回带复现文件复核）。

## 总体判断

实现精准贴合 spec 范围：六条 AC 均有对应实现与单测，reader 去重/缓存差分语义、input 归一方向、面板 codex 分支/labels/colors、local-api 收窄四处全部落地，未发现偏航或越界改动；仅 2 条 minor（暗色翻转漏一行、label 映射未收敛），无未解决 blocking。

## 系统性 follow-up

无（未发现跨 task 测试/公共代码/工具链缺口；AC-006 弱断言为 t448 自身测试层问题，由 test reviewer 处置）。

verdict: PASS

## Round 2 (2026-09-04 20:30 UTC+8)

- task：`t448_codex_panel_tool_tokens_cache_fix`
- diff_anchor：`2eb2aabba154ae7848cd9b5744f1210db9bd38b8`
- round：2

reviewed_scope: c4c00ae78589b579

### 前轮 finding 复核

- **t448_code_f001（minor，已修）**：`src/renderer/styles/globals.css:249` `.dark, [data-theme="dark"]` 语义翻转块已补 `--color-agent-codex: var(--color-agent-codex-dark);`，与其余 agent 对齐。`--color-agent-codex-dark`（globals.css:101）不再是死 token；暗色主题下 DOM Badge（`agent_color` 经 resolver 读 CSS 变量）与 ECharts FALLBACK_PALETTES.dark.codex（`#f06595`）取值一致。独立复核 `pnpm designmd:check` → drift check passed；`agent_color("codex","dark")` 单测（palette.test.ts:136-138，mock root `--color-agent-codex:#c5c5c5`）通过。DESIGN.md 五家说明同步（"四家"→"五家"）。已消除。
- **t448_code_f002（minor，已修）**：`src/renderer/lib/token-stats/chart-data.ts:52-54` 导出 `agentDisplayLabel`（唯一 dash 键 label 来源），`SessionTable.tsx:10` import、`:263` Badge 改用 `agentDisplayLabel(r.agent)`，本地三元副本删除。既有四家文案语义不变（AGENT_LABELS 保留 claude-code→"Claude Code"/kimi-code→"Kimi Code"/opencode→"OpenCode"/grok→"Grok"，新增 codex→"Codex"），SessionTable.test.tsx 覆盖 codex 与既有四家。已消除。

### 本轮新发现

无（0 条）。

### 结论

- 前轮 finding 复核：f001 / f002 均以 diff 与代码核实为**已消除**（未采信处置表自称；逐行验证见上）。
- 本轮新发现：0 条。
- 未进表的提示：
    - f002 收敛不彻底属**前存债、非本轮新增**：buckets/rollup 的 `BUCKET_AGENT_LABELS` / `ROLLUP_AGENT_LABELS` 仍与 AGENT_LABELS 各持一份同文案 map，因键域不同（`claude_code` 下划线 vs 会话 `claude-code` 连字符）无法与 AGENT_LABELS 直接合并；t448 删除的只是本 diff 新增的 SessionTable 第五份副本，剩余三份为 t447 前已存在结构，非本 task 引入，不构成新 finding。
    - 行为细节变化：SessionTable Badge 对**域外未知 agent** 的兜底由旧「一律显示 OpenCode」改为显示原始键（`agentDisplayLabel` 的 `?? agent`）。当前 reader/store 只产出五个已知 agent 值（claude-code/opencode/kimi-code/grok/codex，claude-reader.ts:398、opencode-reader.ts:275、kimi-reader.ts:248、grok-reader.ts:270、codex-reader.ts:286），域外不可达，无可观测缺陷；旧兜底本身是 AC-001 误标根因，新兜底更诚实，不进表。
    - 文案遗留：`chart-data.ts:56` agentSegments JSDoc 仍写 "across the four agents"（codex 已含，应为 five）；`globals.css:150-151` designmd-export:end 下多余空行（Round 1 已提示、非本 task 引入、仍存在）。均纯风格，不进表。
    - 文件过大 / 复杂度：与 Round 1 结论同（chart-data.ts 1116 行、SessionTable.tsx 405 行、codex-reader parse_rollout_file 分支多）；本轮修复未显著增行，只列不进表。
- 门禁复跑（read-only 验证，未改代码）：`codex-reader / chart-data / palette / codex_panels_wiring / SessionTable` 单测 93 passed；`tests/integration/local-api/server.test.ts` 95 passed（含 AC-004 新用例）；`tsc --noEmit` 与 eslint（全部改动文件）零错误零 warning；`pnpm designmd:check` passed。

### AC 复验方式

- AC-001：re_verified —— 单测 `agentDisplayLabel("codex")==="Codex"` 且既有四家文案不变；`SessionTable` 生产路径改用共享映射。
- AC-002：re_verified —— 三套口径 order/labels 均含 codex；chart-data.test 三口径 codex 独立段断言通过（records/buckets/rollup）。
- AC-003：re_verified —— codex token 落 DESIGN 并经 designmd:check；`agent_accent("codex")` 返回 `var(--color-agent-codex)` 非 primary；`agent_color("codex","dark")` 取独立色；f001 补漏后暗色不再回退亮色值。
- AC-004：re_verified —— integration 实际起 store+HTTP，`agent=codex` 返回唯一 codex 行且 input_tokens/cache_read_tokens 不丢。
- AC-005：re_verified（语义层）—— reader 零增量事件计 0；单测重复 total 用例红绿有效；真实 rollout 1.3B→0.19B 量级数值未随仓携带复现文件，属 trust_prior（AC 已声明不逐字锁定）。
- AC-006：re_verified（语义层）—— cache 独立差分 + input 归一；单测强断言 `panel_total==2000`（归一错位会 3500）；~0.96 缓存率数值属 trust_prior（同 AC-005）。

coverage = 6 / 6（AC-005 / AC-006 真实数值口径 trust_prior，依赖实施侧复现证据，建议合并前人工抽查或回带复现文件复核）

### 总体判断

f001（暗色翻转漏行）与 f002（SessionTable 第五份 label 副本）均已按建议最小改动消除；修复未引入新问题（域外兜底文案变化仅在 reader/store 封闭 agent 域外不可达，非缺陷）。门禁全绿，无未解决 critical / important。

### 系统性 follow-up

无（本轮未发现跨 task 测试/公共代码/工具链新缺口；残留三份 label map 与文案属既有债务，如要收敛可另立 small task，非本 task 阻断项）。

verdict: PASS
