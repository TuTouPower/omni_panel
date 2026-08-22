# Task review t438（reviewer_focus: 代码）

- task：`t438_wsl_auto_collect_win_agents`
- spec：`docs/tasks/t438_wsl_auto_collect_win_agents/spec.md`
- diff_anchor：`4c6a0b3a51a563dc62c336df5b9b9011d4ddfff6`
- target：`git diff 4c6a0b3a51a563dc62c336df5b9b9011d4ddfff6`
- round：1
- reviewed_at：2026-08-23 04:58 UTC+8

reviewed_scope: 6bfd55af8bac7bd3

## Findings

### t438_code_f001 - index.ts 一次性发现与 collector 重试发现不一致，win 会话可「采到但定位不到」

- 严重度：minor
- 锚点：行为缺陷——发现状态在运行期变化时，collector 与 locator 对 Windows home 的判定分叉
- 位置：`src/main/index.ts:499-500`；对照 `src/main/core/token-stats/collector.ts:413-424`
- 问题：collector 的 `effective_win_home_wsl` 空结果不缓存、每轮 collect 重试探测（自愈）；index.ts 在 `app.whenReady` 一次性同步 `discover_win_home`，结果固定整个进程生命周期，配置重载也不重建 `session_history_locator_paths`。失败场景：linux 宿主启动时 `/mnt/c` 暂未挂载或 powershell 回退失败（null），之后 Windows home 变为可发现（如挂载恢复、用户新装 agent 目录）。此时 collector 自愈后采得 `env=win` 会话入库（元信息搜索可命中），但 locator 的 `win_home_wsl` 恒为 null → `resolve_session_file` 返回 null → 会话库点开失败、内容搜索跳过该候选（AC-003 的 `kimi_code|win|<id>` 命中缺失）。当前窗口内两模块行为不一致。
- 建议：locator 侧改为与 collector 同策略——`win_home_wsl` 惰性探测、空结果不缓存（或复用 `effective_win_home_wsl` 的发现+缓存逻辑），使两模块发现结果在同一进程内收敛。

### t438_code_f002 - execFileSync 无 timeout，powershell.exe 挂起会阻塞主进程/utility 进程

- 严重度：minor
- 锚点：健壮性——同步子进程调用无超时
- 位置：`src/main/core/token-stats/win-home-discovery.ts:66-72`（`default_win_home_deps.exec_windows`）
- 问题：`execFileSync("powershell.exe", [...])` 未传 `timeout`。该 exec 在两条阻塞路径上被调：index.ts 的 `app.whenReady`（主进程启动路径，`src/main/index.ts:500`）与 collector 的 `effective_win_home_wsl`（utility 进程首个 collect）。Windows 侧 PowerShell 异常挂起时，两条路径无限期阻塞（主进程起不来 / 采集停摆）。正常场景 powershell.exe 返回快，属低概率风险，但零配置自动发现的新增系统调用应带超时兜底。
- 建议：`execFileSync` 加 `timeout`（如 5s），超时/异常统一返回 ""。

### t438_code_f003 - 多候选/回退决策无日志，误选 Windows 用户难排查

- 严重度：minor
- 锚点：可观测性——spike 规则「日志记录决策」未落地
- 位置：`src/main/core/token-stats/win-home-discovery.ts:110-121`（`discover_win_home`）
- 问题：s033 spike 结论（`docs/spikes/s033_wsl_win_home_discovery/report.md` 规则 3）要求「多个候选 → 取含标记目录最多者（并列取名字典序首），**日志记录决策**」；实现中 `discover_win_home` 是纯函数（无 logger 注入），调用方（collector `effective_win_home_wsl`、index.ts）也未记录选了哪个用户、为何选。多用户机器上误采错误 Windows 用户（spec 风险项）时，无从排查决策依据。
- 建议：在调用方或发现函数内记录决策（候选数、选中用户、是否走 powershell 回退），仅 warn/error 级或首次探测时记一次。

### t438_code_f004 - linux 宿主 win 源无逃生舱与关闭开关，spec 非范围/风险回退表述未落地

- 严重度：minor
- 锚点：实现与 spec 描述不符（非 AC，不计 FAIL）
- 位置：`src/main/core/token-stats/collector.ts:301-313`（`WIN_SOURCES_LINUX` 无条件挂载）；对照 `src/main/core/token-stats/paths.ts:91-94`
- 问题：spec 非范围「可选覆盖仅作探测失败逃生舱」与「风险与回退：回退=关闭 win 源自动发现」在实现中均无对应：linux 宿主上 `cfg.win_home` 被 `paths.resolve` 完全忽略（逃生舱不存在），`WIN_SOURCES_LINUX` 在 host=linux 时无条件进入 `sources`（对比 wsl 源有 `config.wsl_enabled` 开关，collect 时跳过）。企业定制目录/误发现场景下用户无任何修正手段（只能接受 unavailable 或误采）。
- 建议：与 implementer 对齐处置——要么改 spec 表述（明确 linux 宿主逃生舱与开关不在本 task 范围），要么补最小逃生舱（发现失败时回退 `cfg.win_home` 转换）或 win 源开关。两者取一，避免 spec 承诺与实现长期脱节。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：4 条（全部 minor，无 critical/important）
- 未进表的提示：
    - 文件过大（≥ 阈值且本 task 净增，按降级规则仅列路径与行数）：`src/main/core/token-stats/collector.ts` 916（+80）、`src/main/core/session-history/subscription-service.ts` 755（+24）、`src/main/core/session-history/session-locator.ts` 528（+23）、`tests/unit/main/core/token-stats/collector.test.ts` 1575（+126）、`tests/unit/main/core/token-stats/token-stats-store.test.ts` 3172（+58）、`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 1484（+12）、`tests/unit/main/core/session-history/subscription-service.test.ts` 1382（+43）。均未发现由文件过大直接引致的可观测缺陷。
    - 圈复杂度：无函数 CC ≥ 15；`discover_win_home` CC≈4、`effective_win_home_wsl` CC≈3，均在低区。
    - 范围外观察：`pick_strategy` host 参数默认 `"windows"`（subscription-service.ts:185-195）——生产唯一调用点 `start_watcher` 传 `this.host`（已从 `host_from_platform` 派生），无遗漏调用方；macos 宿主 win 源 resolve 恒 null 与 pick_strategy 的 poll 分支均无实际影响。
- 总体判断：AC 全部有实现与测试覆盖，未发现 blocking 缺陷；4 条 minor 均为健壮性/可观测性/规格对齐改进项。
- 系统性 follow-up：无（f001 的发现一致性建议与 f004 的逃生舱均不构成跨 task 基础设施缺口，未发现等价 task）

### AC 复验方式

- AC-001：`re_verified` — collector-local.test.ts「t438 AC-001/AC-002」真实 kimi reader + 临时目录，重跑通过；断言 `kimi_code|win` 会话 id 等于 fixture、title 含「黑沙皇」。
- AC-002：`re_verified` — token-stats-store.test.ts `query_sessions({ search: "黑沙皇" })` 命中 `session_kwin`（env=win），重跑通过；store 查询 SQL 覆盖 `title || directory || id`（token-stats-store.ts:1411）。
- AC-003：`re_verified` — subscription-service.test.ts 用真实 kimi extractor，正文含「黑沙皇」、title/dir/id 均不含，`searchContent` 命中 `kimi_code|win|session_kwin`，重跑通过；IPC 链路确认（session-history-ipc.ts:300-329 经 `resolve_session_file(locator_paths)` 注入 win_home_wsl）。
- AC-004：`re_verified` — collector-local.test.ts（同 id 两 env 并存、title 各自主）+ token-stats-store.test.ts（主键区分、env 过滤不串），重跑通过。
- AC-005：`re_verified` — collector.test.ts 与 collector-local.test.ts 均断言发现失败时 5 个 win 源 `unavailable`（`lastError="path unavailable"`）、不读盘、linux 平台源照常投递，重跑通过。
- AC-006：`re_verified` — collector.test.ts 断言发现成功后 claude_costs/claude_jsonl/opencode/grok win 源路径基于发现 home 且被读取；watcher.test.ts 覆盖 `pick_strategy` 的 win+linux→poll。
- AC-007：`re_verified` — SessionLibrary.test.tsx 断言未勾选「包含消息内容」时 placeholder 为「搜索标题 / 目录 / 会话 ID」、勾选后切换，重跑通过。
- AC-008：`trust_prior` — `[deploy]` 项，本 diff 无自动化覆盖，依赖实施侧真实 WSL+网页人工验证证据。

coverage = re_verified / 总 AC 数 = 7/8

verdict: PASS
coverage = re_verified / 总 AC 数 = 7/8

verdict: PASS

## Round 2 (2026-08-23 05:18 UTC+8)

reviewed_scope: c9d8e42e889828a6

### 前轮 finding 复核（以 `git diff 4c6a0b3a51a563dc62c336df5b9b9011d4ddfff6` 与代码为准，不采信处置表自述）

- t438_code_f001（index.ts 一次性注入 vs collector 重试发现不一致）：核心已消除，但修复引入新问题（见 f005）。已验证：index.ts 改为 `win_home_wsl: null`（src/main/index.ts:499-500），不再启动时一次性发现；session-locator 新增 `effective_win_home_wsl`（session-locator.ts:238-256）resolve 时惰性发现 + 模块级缓存 + `set_win_home_wsl_probe` 测试注入；`locator_paths_key` 改用 effective 值（session-locator.ts:76-80）；`""` 显式禁用哨兵对齐 wsl_user 语义；index.ts 中 Round 1 引入的 `discover_win_home` import 已删除（grep 零引用）。新增测试覆盖惰性发现、哨兵禁用、发现结果切换→索引失效（session-locator.test.ts t438 describe）。**修不彻底**：发现失败（null）不缓存导致每次 resolve 同步重探（含 powershell.exe spawn），无节流——详见 f005。
- t438_code_f002（execFileSync 无 timeout）：已消除。`exec_windows` 加 `timeout: 5000`，超时按失败返回 ""（win-home-discovery.ts:80-84），符合 execFileSync options 契约。
- t438_code_f003（决策无日志）：已消除。`WinHomeDiscoveryDeps.on_decision` 可选钩子（win-home-discovery.ts:37-40），多候选取舍（:129-134）、零候选回退成功/失败（:140-150）均调用；locator 接 `log.warn`（session-locator.ts:249）、collector 接 `forward_log("warn", ...)`（collector.ts effective_win_home_wsl）。唯一候选分支无日志（无歧义，可接受）。
- t438_code_f004（无关闭开关）：同意遗留。处置表登记 p206（`docs/pending/todo/p206_win_source_disable_switch.md`），spec 非范围允许，符合流程。
- （test reviewer 的 t438_test_f001/f002 修复一并复核）：collector 侧新增 `win_home_wsl_probed_this_round` 轮级缓存（collector.ts:391-414 + collect() 开头 `if (win_home_wsl_cache === null) win_home_wsl_probed_this_round = false;`），发现失败仅缓存到本轮、下轮重探自愈；`locator_paths_key` 用 effective 值使发现结果变化失效旧索引。两者与代码行为一致，测试断言（collector.test.ts「发现失败不长期缓存：下一轮重新探测自愈」、session-locator.test.ts「发现结果变化 → paths_key 变化」）重跑通过。

### 本轮新发现

### t438_code_f005 - locator 惰性发现失败无节流：每次 resolve 同步 spawn powershell.exe 阻塞主进程

- 严重度：important
- 锚点：行为缺陷——AC-005 画像（发现失败）下主进程同步阻塞，内容搜索批量场景放大
- 位置：`src/main/core/session-history/session-locator.ts:238-256`（`effective_win_home_wsl`，缓存只存非 null）；调用点 `session-locator.ts:76-80`（`locator_paths_key` 对每次 `resolve_session_file` 无条件调用）
- 问题：f001 修复把 locator 侧发现改为「失败不缓存、下轮重探自愈」，但未加与 collector `win_home_wsl_probed_this_round` 等价的节流。失败场景可复现：linux 宿主 + `/mnt/c/Users` 可枚举但零 agent 标记目录（用户 Windows 侧未装任何 agent——正是 AC-005 画像），`discover_win_home` 走零候选回退 `execFileSync("powershell.exe", ...)`（win-home-discovery.ts:140-150，同步、主进程、单次 0.5-5s）。由于 null 不缓存，**每次** `resolve_session_file` 都重新探测：`locator_paths_key` 无条件调用 `effective_win_home_wsl`（任意 env 的会话 resolve 都触发，不只 win env），每次失败又经 `on_decision` 写一条 warn 日志。批量放大：内容搜索 IPC 对每个候选 loc 调一次 `resolve_session_file`（session-history-ipc.ts:300-305），N 个候选 = N 次 powershell spawn，主进程（utility 进程外的 IPC 所在主进程）同步阻塞约 N×0.5-5s，UI 冻结；单次点开会话也卡 1-2s。对照：collector 侧已用 `win_home_wsl_probed_this_round` 把探测压到每轮一次，locator 修复未对齐。功能不崩（符合 AC-005 字面），但 AC-005 画像下的主进程同步阻塞是可观测性能缺陷。
- 建议：locator 侧对失败结果加节流——对齐 collector：失败结果缓存一个时间窗（如本轮/60s）内不重探，或复用「轮级/时间戳」语义（`win_home_wsl_cache` 为 null 时记录 `last_probe_at`，间隔内直接返回 null 不再 spawn）；同时让 `locator_paths_key` 只在 host=linux 且 win_home_wsl 缺省时才触发探测（非 win env 的 resolve 不应为签名支付探测成本）。

### 结论

- 前轮 finding 复核（Round 2）：f001 修不彻底（引入 f005）；f002/f003 已消除；f004 同意遗留（p206）；test_f001/f002 修复核实通过。
- 本轮新发现：1 条（f005，important）
- 未进表的提示：
    - 文件过大：与 Round 1 相同 7 个文件继续净增（session-locator.ts 现 580 行 +52、collector.ts 现 931 行 +96、win-home-discovery.ts 159 行、collector.test.ts 现 1588 行 +148 等），无由此引致的可观测缺陷。
    - 圈复杂度：无函数 CC ≥ 15；`effective_win_home_wsl`（locator）CC≈4、`discover_win_home` CC≈4。
    - 范围外观察：`collector.test.ts` 的 skip 无新增——session-path-index.test.ts:197 的 `it.skipIf(!existsSync("\\\\wsl.localhost\\..."))` 为既有环境条件跳过（仅 Windows 宿主可达），非本 task 引入，不属危险模式；`on_decision` 在零候选失败时每轮（collector）或每次探测（locator，随 f005 一并放大）warn，日志噪音并入 f005。
- 总体判断：4 条 Round 1 finding 中 3 条已消除、1 条遗留合规；但 f001 修复引入 f005（locator 发现失败无节流、主进程同步 spawn 阻塞），未解决 important → 本轮 FAIL。
- 系统性 follow-up：无（f005 为 t438 内部修复回归，非跨 task 基础设施缺口；task.py list 未见等价 task）

### AC 复验方式（Round 2）

- 本轮 diff 变更集中在发现/缓存/日志路径，不改变 AC 断言面。逐条复验结论同 Round 1，全部相关测试重跑确认：
    - `vitest run`（token-stats 5 文件 + session-history 4 文件 + SessionLibrary）：197 + 149 passed，1 个既有环境条件 skip；`tsc --noEmit`、eslint（被改文件，`--max-warnings=0`）零错误。
    - AC-001/002/003/004/005/006/007：`re_verified`（断言与重跑证据同 Round 1；AC-005 补充确认 collector 侧 unavailable 语义未变、collector.test.ts 新增「发现失败不长期缓存」用例通过）。
    - AC-008：`trust_prior`（deploy 项，依赖实施侧人工验证证据）。

coverage = re_verified / 总 AC 数 = 7/8

verdict: FAIL
verdict: FAIL

## Round 3 (2026-08-23 05:23 UTC+8)

reviewed_scope: aa64c663f49fc333

### 前轮 finding 复核（以 `git diff 4c6a0b3a51a563dc62c336df5b9b9011d4ddfff6` 与代码为准）

- t438_code_f005（locator 惰性发现失败无节流，每次 resolve 同步 spawn powershell.exe）：已消除。修复为负缓存时间窗：`win_home_wsl_null_until` + `WIN_HOME_REPROBE_INTERVAL_MS = 60_000`（session-locator.ts:60-62），`effective_win_home_wsl` 成功结果长期缓存、失败（null）窗内直接返回 null 不重探、窗后重探自愈（session-locator.ts:246-271）；`set_win_home_wsl_probe` 与 `clear_resolution_cache` 均复位 `win_home_wsl_null_until`（:105、:239-242）。核对要点：①负缓存只在 linux 宿主 + 缺省发现路径生效，显式字符串/哨兵分支不受影响；②`locator_paths_key` 窗内调用仅 Date.now() 比较，无 spawn 成本；③自愈延迟 60s 与 collector 轮级节流粒度同量级，可接受；④未引入新问题——发现从成功转失败的 key 变化语义保守正确，probe 替换即时清除负缓存保测试隔离。新增两用例（session-locator.test.ts「发现失败负缓存节流：时间窗内重复 resolve 不重探」「负缓存时间窗过后重探自愈」，后者用 fake timers 推进 61s）重跑通过，断言 probe 调用次数 1 次/2 次与实现一致。
- t438_code_f001：已消除（Round 2 确认核心消除；f005 为其修复补丁，本轮复核 f005 已修 → f001 整体闭环）。
- t438_code_f002（timeout：5000）：已消除，无回归。
- t438_code_f003（on_decision 日志钩子）：已消除，无回归。
- t438_code_f004（无关闭开关）：同意遗留（p206 已登记，spec 非范围允许）。

### 本轮新发现

无。全量 diff 相对 Round 2 仅 session-locator.ts（负缓存节流，+40 行）与 session-locator.test.ts（+45 行）增量，其余 20 个文件未变；逐维度扫描（AC 覆盖/正确性/安全/契约/性能/架构/健壮性/文档一致性）未发现新问题。

### 结论

- 前轮 finding 复核（Round 3）：f005 已消除；f001/f002/f003 维持已消除；f004 维持遗留（p206）。
- 本轮新发现：0 条
- 未进表的提示：
    - 文件过大：与 Round 1/2 相同 7 个文件继续净增（session-locator.ts 现 621 行、collector.ts 931 行、collector.test.ts 1588 行等），无由此引致的可观测缺陷。
    - 圈复杂度：无函数 CC ≥ 15；`effective_win_home_wsl`（locator）CC≈4。
    - 范围外观察：无新增；session-path-index.test.ts:197 的 `it.skipIf` 为既有环境条件跳过（非本 task 引入）。
- 总体判断：4 条 Round 1 minor + 1 条 Round 2 important 全部闭环（f004 遗留走 p206 合规路径），无未解决 critical / important → PASS。
- 系统性 follow-up：无。

### AC 复验方式（Round 3）

- 本轮变更仅涉及发现节流路径，不改变 AC 断言面。全量相关测试重跑：session-history 4 文件 108 passed（1 个既有环境条件 skip）+ token-stats 5 文件 197 passed + SessionLibrary 43 passed，共 348 passed；`tsc --noEmit`、eslint（被改文件，`--max-warnings=0`）零错误。
- AC-001～007：`re_verified`（断言与重跑证据同 Round 1/2；AC-005 画像新增节流用例佐证：发现失败窗内不重探、窗后自愈，probe 次数断言通过）。
- AC-008：`trust_prior`（deploy 项，依赖实施侧人工验证证据）。

coverage = re_verified / 总 AC 数 = 7/8

verdict: PASS
verdict: PASS

## Round 4 (2026-08-23 05:29 UTC+8)（窄复核：Step 7a 文档固化）

reviewed_scope: 7de859bddd34d5fe

### 本轮范围

代码零改动（Round 3 后仅 docs 增量：6 个文件，diff 相对 Round 3 增 +22 行）。本轮只核 `git diff 4c6a0b3a51a563dc62c336df5b9b9011d4ddfff6 -- docs/blueprint docs/specs docs/specs_index.md`，逐条对照代码行为（win-home-discovery 规则、轮级/60s 负缓存、`""` 哨兵、on_decision、paths_key effective 值），发现文档与实现不符才报 finding。

### 前轮 finding 复核

- f001/f002/f003/f005：均已消除（Round 2/3 确认），本轮代码零改动，维持。
- f004：遗留 p206（合规），维持。

### 本轮新发现

无。逐文件核对结论：

- `docs/blueprint/domain.md`：采集对称性段落（Windows 宿主经 UNC 采 `wsl` ↔ WSL/Linux 宿主经 `/mnt/c/Users` 自动发现采 `win`；双向零配置、失败仅该 env 源 unavailable）与 AC-005、win-home-discovery.ts 行为一致。
- `docs/blueprint/architecture.md`：
    - token-stats 行：linux 宿主经 `win-home-discovery.ts` 发现 `/mnt/c/Users/<u>` 作 `win_home_wsl` 采 win 五源，发现失败 unavailable、「失败结果按轮负缓存重探自愈」——与 collector `win_home_wsl_probed_this_round` 轮级语义一致。
    - 持久索引行：paths_key 签名演进描述（t310 五段 → t438 加 effective win_home_wsl，发现结果变化旧条目失效）与 `locator_paths_key` 实现一致。
    - session-locator 行：`win_home_wsl` resolve 时惰性发现、`""` 显式禁用、失败负缓存 60s 节流——与 `effective_win_home_wsl` / `WIN_HOME_REPROBE_INTERVAL_MS=60_000` 一致。
- `docs/blueprint/decisions.md`：ADR 023 覆盖背景/选项/结论，全部表述与实现吻合（哨兵对齐 wsl_user 语义、collector 按轮 + locator 60s 负缓存、on_decision 留痕、关闭开关遗留 p206）；022 补「- 替代：无」收尾行与 017-023 全部 ADR 格式一致，纯格式修正。
- `docs/specs/ai-cli-token-stats-api.md`：文件树加 `win-home-discovery.ts` 行（实际文件存在）；t438 段落（发现规则、5s 超时回退、多候选并列字典序首、win 五源 env=win、`""` 哨兵、unavailable+path unavailable、轮级/60s 负缓存、on_decision warn 留痕）逐条与代码一致。
- `docs/specs/session-path-index.md`：t438 要点行（惰性发现、哨兵、60s 负缓存、paths_key effective 值）与实现一致；测试覆盖行列举的用例清单与 session-locator.test.ts 实际新增用例一致（含全文件 null probe hermetic）。
- `docs/specs_index.md`：ai-cli-token-stats-api 与 session-path-index 均挂 t438，符合 Finalization 清单（specs_index：挂 t438）。

无文档-实现偏差，无过期/误导表述。

### 结论

- 前轮 finding 复核（Round 4）：全部已消除/合规遗留，无回归。
- 本轮新发现：0 条
- 未进表的提示：无（窄复核仅 docs，代码文件过大/复杂度提示维持 Round 3 结论）。
- 总体判断：6 个 docs 增量与代码行为逐条核对一致，无文档与实现不符；无未解决 critical / important → PASS。
- 系统性 follow-up：无。

### AC 复验方式（Round 4）

- 本轮为文档一致性窄复核，AC 断言面未变；代码零改动，测试结论沿用 Round 3（348 passed，`tsc`/eslint 零错误）。
- AC-001～007：`re_verified`（沿用 Round 3 重跑证据；本轮额外核对 docs 表述与代码/测试一致）。
- AC-008：`trust_prior`（deploy 项）。

coverage = re_verified / 总 AC 数 = 7/8

verdict: PASS
