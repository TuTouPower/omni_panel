# Task review t438（reviewer_focus: 测试）

- task：`t438_wsl_auto_collect_win_agents`
- spec：`docs/tasks/t438_wsl_auto_collect_win_agents/spec.md`
- diff_anchor：`4c6a0b3a51a563dc62c336df5b9b9011d4ddfff6`
- target：`git diff 4c6a0b3a51a563dc62c336df5b9b9011d4ddfff6`
- round：1
- reviewed_at：2026-08-23 04:58 UTC+8

## Findings

### t438_test_f001 - effective_win_home_wsl「null 不缓存、瞬态失败自愈」行为无测试

- 严重度：minor
- 锚点：AC-005 邻近鲁棒性行为；覆盖可更广，不阻断
- 位置：`src/main/core/token-stats/collector.ts:407-421`（`effective_win_home_wsl`）；`tests/unit/main/core/token-stats/collector.test.ts` t438 describe「发现结果进程内缓存」
- 问题：实现注释声明「null result is not cached so a transient failure self-heals next round」（对齐 `effective_wsl_user` 负缓存自愈语义）。现有缓存测试只验证成功路径一轮内只探测一次；「首轮发现失败（probe 返回 null）→ 下一轮探测恢复」的切换场景无测试。若未来实现误把 null 写进缓存，win 源将整进程永久 unavailable，现网测试拦不住——而 wsl 侧同语义（t254 f001）有专门测试。
- 建议：补一条测试——`set_win_home_wsl_probe(() => null)` 后 `configure`，断言 win 源 unavailable；再 `set_win_home_wsl_probe(() => "/mnt/c/Users/Karson")` 并再次 `collect`，断言 probe 被再次调用、win 源转 ok。

### t438_test_f002 - locator_paths_key 追加 win_home_wsl 的索引失效场景无专门测试

- 严重度：minor
- 锚点：AC-004 索引失效机制的扩展段；覆盖可更广，不阻断
- 位置：`src/main/core/session-history/session-locator.ts:63-67`（`locator_paths_key`）；`tests/unit/main/core/session-history/session-locator.test.ts` t438 describe
- 问题：paths 签名新增 `win_home_wsl` 段（旧五段索引条目不匹配 → 回退扫描重建，实现注释已说明）。机制与既有 host/homedir/win_home 变化失效一致（t310 AC-004 已测），但新输入段本身无「win_home_wsl 变化 → 索引条目失效、不命中旧路径」的直接测试；该字段恰好是本 task 引入的新可变量（发现结果变化即触发）。
- 建议：t438 describe 内补一条——同一 env/session 先以 `win_home_wsl=A` resolve（写入持久索引），再以 `win_home_wsl=B` resolve，断言重新扫描定位到 B 下文件而非命中 A 的旧索引条目。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无。
- 改测方向复核：无「迁就实现」的改测。唯一修改的既有断言是 `collector.test.ts`「AC-001: non-Windows host filters wsl sources」的 warn 数 5→10 并按消息内容拆分计数——对应 linux 宿主新增 5 个 win 源（发现失败 → `path unavailable`）的真实行为变化，且断言由单一正则弱匹配改为两段精确计数（各 `toHaveLength(5)`），是加强而非迁就；其余 7 个测试文件改动全部为新增。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示：
    1. `win-home-discovery.test.ts` 的 `deps` helper 用平台相关 `node:path.join` 拼 existing 集合，Windows 宿主上会与生产 `path.posix.join` 不一致；本项目单测在 linux/mac 跑，非当前问题。
    2. mac 宿主不挂 win 源（`WIN_SOURCES_LINUX` 仅 `hosts:["linux"]`），AC-005 的 mac 维度由既有平台源测试 + `paths.test.ts`（macos host env=win → null）覆盖，无 collector 级 mac 组合测试——设计如此，非缺口。
    3. 会话库「collector → store → query/searchContent → UI」全链路无端到端自动测试，靠各层真实实现单测拼接；AC-008 为 [deploy] 场景，未要求自动 e2e。
- 总体判断：8 条 AC 中 7 条有自动测试且验证真实行为（真实 kimi reader / 真实 store / 真实 extractor，mock 仅在 fs 边界与文档化 DI 探针处），危险模式零命中，无未解决 critical/important；仅 2 条 minor 覆盖扩展建议。
- 系统性 follow-up：无。

### AC 复验披露

- AC-001：`re_verified` — `collector-local.test.ts`「t438 AC-001/AC-002」用真实 kimi reader + 临时目录 fixture（`plant_kimi_session` 落盘 wire.jsonl/index），断言 id=session_k_win、source=kimi_code、env=win、status=ok；`collector.test.ts` mock 侧断言 win 会话投递与路径。两套均重跑通过（279 文件 3450 通过）。
- AC-002：`re_verified` — `token-stats-store.test.ts`「AC-002」真实 store：`query_sessions({search:"黑沙皇"})` 精确命中 1 行并断言 id/env，另验目录/会话 id 搜索；`collector-local` 验证 title 由真实 reader 从首条 user 文本提取。
- AC-003：`re_verified` — `subscription-service.test.ts`「t438 AC-003」真实 kimi extractor：title 候选文本与 session id 均不含关键词，仅正文（`append_loop_event content.part`）命中，断言精确 key `kimi_code|win|session_kwin`。
- AC-004：`re_verified` — `collector-local.test.ts`「t438 AC-004」同 id 双 home 真实采集 2 行、标题互异；`token-stats-store.test.ts`「AC-004」同 id 双 env upsert 并存、env 过滤各 1 行。
- AC-005：`re_verified` — `collector.test.ts`「发现失败 → win 源 unavailable」断言 5 win 源 unavailable/`path unavailable`、reader 不被 win 调、linux 会话照常投递；`collector-local`「t438 AC-005」真实 reader 复验；`session-locator.test.ts` 断言 win_home_wsl 缺省时 win 源全 null。
- AC-006：`re_verified` — `collector.test.ts`「AC-006」断言 costs/jsonl/opencode/grok/kimi 五 reader 均以发现 home 为根被调（env=win）；`paths.test.ts` 全部 5 类 win 路径构建非 null 且 POSIX。
- AC-007：`re_verified` — `SessionLibrary.test.tsx` 断言未勾选/勾选两态 placeholder 文案精确切换（真实组件渲染 + fireEvent.click）。
- AC-008：`trust_prior` — `[deploy]` 本机 WSL + 网页人工搜索，无法在单测复验；依赖实施侧部署验证证据（handoff/部署记录）。
- coverage = 7 / 8（re_verified 87.5%；trust_prior 12.5% ≤ 30%，无需人工抽查提示）。

reviewed_scope: 6bfd55af8bac7bd3

verdict: PASS

## Round 2 (2026-08-23 05:18 UTC+8)

reviewed_scope: c9d8e42e889828a6

### 前轮 finding 复核

- **t438_test_f001（null 不缓存自愈无测试，minor）→ 已消除**。实现：`collector.ts` 改为轮级缓存（`win_home_wsl_probed_this_round`，`collect()` 开头在 `win_home_wsl_cache === null` 时复位，null 仅缓存到本轮结束，成功结果跨轮缓存）。测试：`collector.test.ts` t438 describe 新增「发现失败（null）不长期缓存：下一轮重新探测自愈（review test_f001）」——probe null 桩，`configure` + `collect` 后断言 `probe` 恰被调 2 次。静态复核双向可拦：实现退化「null 长期缓存」→ probe 1 次 → 红；退化 Round 1 的「null 每 effective 重探」→ 一轮 15 源各探 → 远超 2 次 → 红。用例同时隐性覆盖「一轮内多源只探测一次」（与「发现结果进程内缓存」用例互补）。`collector.test.ts` 重跑全绿。
- **t438_test_f002（paths_key 追加 win_home_wsl 的索引失效无测试，minor）→ 已消除**。实现：`session-locator.ts` `locator_paths_key` 改用 `effective_win_home_wsl(paths)`（惰性发现结果参与签名）。测试：`session-locator.test.ts` 新增「发现结果变化 → paths_key 变化 → 旧索引条目失效重扫（review test_f002 / AC-004）」——probe home_a resolve 命中真实文件后切换 probe home_b，断言 resolve 返回 null。静态复核：旧实现（key 用原始 `win_home_wsl ?? ""` 字段）下 key 恒定，内存缓存命中错误返回 home_a 路径 → 断言红；Round 2 实现下 key 随发现结果变 → 缓存 miss → 重扫 home_b 未命中 → null。扫描命中写入的 entry 带当次 paths_key（`resolve_session_file` 第 3 步），非恒真。`session-locator.test.ts` 重跑全绿。

### 连带改动复核（code f001 惰性发现 + hermetic probe）

- 惰性发现接线：`locator_paths_key` 无条件调 `effective_win_home_wsl`（无论 env），凡 host=linux 且 `win_home_wsl` 缺省的 resolve 都会触发真实 `/mnt/c` 探测——三个测试文件装 `set_win_home_wsl_probe(() => null)` 均**必要**：`session-locator.test.ts` 文件级（t210/t310 describe 大量 host=linux 用例）、`session-path-index.test.ts` 文件级（该文件 mock `node:fs` 计 readdir 数，惰性探测会污染计数断言）、`subscription-service.test.ts` 仅 t310 describe（该 describe 走 `resolve_session_file`；t210 describe 订阅直接传 `file_path` 不触发，未装 probe 正确）。三处均在 afterEach 复位 probe 并清发现缓存，无跨用例泄漏。
- 新增用例断言质量：惰性发现用例断言精确 `file_path`（真实临时目录文件）；`""` 禁用哨兵用例断言 `locator_source_path` 双源 null；发现结果变化用例首末两次 resolve 均为强断言。无恒真、无存在即通过。
- `index.ts` 改为传 `win_home_wsl: null`（惰性发现）——与 `DEFAULT_LOCATOR_PATHS` 语义一致，未引入新分支。

### 改测方向复核

无。Round 2 未改写任何既有断言预期（warn 5→10 拆分为 Round 1 已审的合法行为适应）；本轮全部为新增用例与 hermetic 注入。

### 危险模式扫描（Round 2 增量）

恒真断言 / 删反转 expect / 注释断言 / 弱化断言 / 删测试 / skip·only / 静默错误 / mock 误用 / 阈值掩盖 / 条件跳过 / 程序赋值替代交互 / 存在即通过——逐条扫过，均无命中。probe 桩使用生产代码自带的注入点，discover 纯逻辑另有独立全分支单测，非 mock 被测逻辑。

### 本轮新发现

0 条。

### 未进表的提示

1. `on_decision` 钩子（code f003 修复：多候选取舍 / shell 回退留痕）在 `win-home-discovery.test.ts` 无调用断言——纯日志副作用，属 code review 修复伴生，测试维度不要求。
2. collector / locator 的 `(probe ?? discover_win_home)` 接线在 probe null 时走真实 discover 的路径无测试——discover_win_home 本身全分支单测，接线仅一行 `??`，且单测不能真跑 `/mnt/c`（有意不测场景），不阻断。
3. locator 侧「发现失败 null 不缓存、下轮重探自愈」无 locator 级用例（collector 侧已有）——locator 为 on-demand 无轮概念，语义与 `effective_wsl_user` 一致，机制简单，可加可不加。

### AC 复验方式（Round 2 增量）

AC-001～007 覆盖集合与 Round 1 相同，无 AC 增删；本轮复验动作：9 个受影响测试文件重跑全绿（303 passed / 1 既有环境门控 skip），全量单测 279 文件 / 3454 passed / 2 既有 skip（较 Round 1 多 4 个 = 新增 4 用例），`check_review_status.py` 复核 `test_verdict=PASS`。指纹 `c9d8e42e889828a6` 已按 `review_scope_fingerprint` 实现实算验证与 prompt 一致（排除 task.md / review\_\*.md / handoff / pending / findings / archive / spikes / tasks_index 后 SHA1 前 16 位）。

- 总体判断：两条 Round 1 minor finding 均已由「实现变更 + 针对性新用例」真实消除（非弱化、非换形式），新增用例触达生产逻辑且能拦截对应回归；连带 hermetic 注入必要且完整；本轮无新 blocking 与 minor。
- 系统性 follow-up：无（p206 为 code f004 遗留开关决策，非测试维度）。

verdict: PASS

## Round 3 (2026-08-23 05:25 UTC+8)

reviewed_scope: aa64c663f49fc333

### 前轮 finding 复核

- Round 2 无 finding（PASS 后进入本轮）。Round 1 两条 minor（f001 自愈、f002 索引失效）在 Round 2 已核实消除，本轮未回归：collector 轮级缓存与 locator 惰性发现相关既有用例（含「发现结果变化 → paths_key 变化 → 旧索引条目失效重扫」）重跑仍全绿，实现未改动其语义。

### 本轮增量复核（code f005 负缓存节流 + 两用例）

- **实现**：`session-locator.ts` `effective_win_home_wsl` 加 `win_home_wsl_null_until`（60s 负缓存窗）：成功结果仍进程内缓存（`win_home_wsl_cache` 优先返回）；发现失败置 `null_until = Date.now() + 60_000`，窗内直接返回 null 不探测，窗外重探；`clear_resolution_cache` / `set_win_home_wsl_probe` 均清 `null_until`，无残留。
- **用例 1「发现失败负缓存节流：时间窗内重复 resolve 不重探」**：计数 probe 返回 null，3 次调用（2 次 `locator_source_path` + 1 次 `resolve_session_file`）断言 calls === 1。真实触达生产逻辑（走 `effective_win_home_wsl` 全链路，含 `locator_paths_key` 内联调用）；静态红绿推导：退化无负缓存（Round 2 行为）→ 3 次探测 → calls=3 → 红；退化探测永不触发 → calls=0 → 红。非恒真。
- **用例 2「负缓存时间窗过后重探自愈」**：`vi.useFakeTimers()` + try/finally `useRealTimers()` 清理正确；probe 计数并先 null 后 `discovered=win_home`；窗内断言再调不重探（calls=1），`vi.setSystemTime(Date.now() + 61_000)` 后 resolve 断言 calls=2 且精确 `file_path` 命中。fake timers 使用正确且自证生效：若 Date 未被 fake，setSystemTime 不影响 `Date.now()` → resolve 仍窗内 null → `file_path` 断言红；该用例绿即证明 fake Date 生效。红绿推导：退化「窗内也重探」→ 第 3 步 `toBeNull` 红（探测返回 win_home 非 null）；退化「窗外不重探」→ calls 仍 1 → 红。
- **假绿与泄漏检查**：无 `await`/异步间隙（resolve 全同步）；`null_until` 在 beforeEach `clear_resolution_cache` 与 `set_win_home_wsl_probe` 双保险清零；fake timers 唯一使用点且有 finally 清理；calls 闭包计数无跨用例泄漏。
- **节流语义与 collector 对称性**：collector 为轮级节流（poll 间隔天然节流），locator 为 60s 窗（on-demand resolve 需显式节流），二者语义一致无分叉；`WIN_HOME_REPROBE_INTERVAL_MS` 是 code finding 要求的性能防护且有双向用例验证（抑制 + 自愈），不构成「阈值掩盖」。

### 改测方向复核

无。本轮未改写任何既有断言预期，全部为新增用例与实现新增行为（负缓存）配套。

### 危险模式扫描（Round 3 增量）

恒真断言 / 删反转 expect / 注释断言 / 弱化断言 / 删测试 / skip·only / 静默错误 / mock 误用 / 阈值掩盖 / 条件跳过 / 程序赋值替代交互 / 存在即通过——逐条扫过，均无命中。

### 本轮新发现

0 条。

### 未进表的提示

1. 负缓存窗（60s）时长本身无常量级测试（如「59s 内不重探 / 61s 重探」边界值），现有用例以 61s 推进验证窗外重探，边界值±1s 属「可再细」级别，不阻断。
2. `effective_win_home_wsl` 在 `locator_paths_key` 与 `locator_path_input` 两处调用共享同一负缓存状态——窗内 key 中 win_home_wsl 段为空、窗外成功则 key 变化触发 f002 失效机制，交互已被既有用例覆盖，无新增缺口。

### AC 复验方式（Round 3 增量）

AC 集合无变化（AC-001～008）。本轮复验动作：`session-locator.test.ts` 25 用例重跑全绿（较 Round 2 +2）；全量单测 279 文件 / 3456 passed / 2 既有环境门控 skip（较 Round 2 +2）；指纹 `aa64c663f49fc333` 按 `review_scope_fingerprint` 实现实算验证与 prompt 一致。AC-001～007 复验类别同 Round 1/2（re_verified），AC-008 `[deploy]` trust_prior；coverage = 7/8。

- 总体判断：两个新用例真实触达生产负缓存逻辑（calls 计数 + 精确 file_path 双端断言），fake timers 使用正确无泄漏，红绿推导可拦三类退化，无假绿；本轮无新 finding，无未解决 critical/important。
- 系统性 follow-up：无（p206 仍为 code f004 遗留开关决策，非测试维度）。

verdict: PASS

## Round 4 (2026-08-23 05:29 UTC+8)

reviewed_scope: 7de859bddd34d5fe

### 窄复核范围与结论

本轮为文档固化窄复核（Step 7a）：测试文件零改动（`git diff --stat -- tests/` 与 Round 3 一致：10 文件 928 行，无新增/修改）；delta 仅 `docs/blueprint/`、`docs/specs/`、`docs/specs_index.md`、p204 归档。逐条核对涉及测试的表述与实际一致：

- **`docs/specs/session-path-index.md` 测试覆盖段**（本轮唯一改写的测试相关表述）：「t438 新增 win 源经 `win_home_wsl` 定位（kimi/claude）、缺省惰性发现、`""` 禁用哨兵、发现失败负缓存节流与窗后自愈、发现结果变化 → `paths_key` 变化 → 旧索引条目失效重扫；全文件默认装 null probe 保 hermetic」——与实际 `session-locator.test.ts` t438 describe 8 例逐一对照：kimi/claude 定位 ✓、缺省惰性发现 ✓、`""` 哨兵 ✓、负缓存节流 ✓、窗后自愈 ✓、paths_key 失效重扫 ✓、文件级 beforeEach/afterEach 装 null probe ✓。仅「缺省且发现失败（probe null）→ 不可达」用例未逐一列举（语义被「缺省惰性发现」覆盖，文档为列举式非详尽清单），非事实错误，不构成 finding。
- **`docs/blueprint/architecture.md`**：「t438 起 `paths_key` 含 effective win_home_wsl——发现结果变化旧条目即失效」（与实际 `locator_paths_key` 一致）；「linux 宿主 win 源 resolve 时惰性发现，`""` 显式禁用，失败负缓存 60s 节流防批量 resolve 反复 spawn powershell.exe」（与 `effective_win_home_wsl` 实现一致）。
- **`docs/blueprint/decisions.md` ADR 023**：「失败结果短窗负缓存（collector 按轮、locator 60s）重探自愈；多候选取舍与回退经 `on_decision` 留痕；不默认提供 UI 关闭开关（遗留 p206）」——与实现及 task.md 处置一致。
- **`docs/blueprint/domain.md` / `docs/specs/ai-cli-token-stats-api.md`**：win-home-discovery 发现顺序、`env=win` 五源、失败 `unavailable` 不阻塞平台源、`win_home_wsl` 语义——与 `collector.ts` / `paths.ts` / `win-home-discovery.ts` 实际行为一致（`unavailable` + `path unavailable` 已在 collector 测试断言）。
- **`docs/specs_index.md`**：`ai-cli-token-stats-api` 与 `session-path-index` 挂 t438——与 Finalization 要求一致。p204 归档至 `docs/archive/pending/`（流程文件）。

### 前轮 finding 复核

Round 1 两条 minor 与 Round 2/3 全部 finding 均已消除/零发现；本轮无代码与测试改动，无回归面。

### 改测方向复核

无（本轮测试零改动）。

### 本轮新发现

0 条。

### 未进表的提示

1. session-path-index.md 测试覆盖段未逐一列举「缺省且发现失败 → 不可达」用例（列举粒度，语义无冲突）；如需文档与用例一一对应可补一词，非阻断。
2. 文档列举为快照式，未来用例增删需同步更新（项目既有文档纪律，非本 task 问题）。

### AC 复验方式（Round 4 增量）

AC 集合与复验类别无变化（AC-001～007 re_verified、AC-008 trust_prior；coverage 7/8）。本轮为文档核对，未重跑测试（测试零改动，Round 3 全量 3456 passed 仍有效）；指纹 `7de859bddd34d5fe` 按 `review_scope_fingerprint` 实算验证与 prompt 一致（本轮 delta 全部落在不入排除清单的 `docs/blueprint` / `docs/specs` / `docs/specs_index.md`，指纹变化符合预期）。

- 总体判断：docs 中全部涉及测试的表述与实际测试文件一致，无事实出入；本轮无 finding，无未解决 critical/important。
- 系统性 follow-up：无。

verdict: PASS
