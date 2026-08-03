# Task review t193（reviewer_focus: 测试）

- task：`t193_tokenstats_query_process_isolation`
- spec：`docs/tasks/t193_tokenstats_query_process_isolation/spec.md`
- diff_anchor：`4a0e294797c290f0f365f329727ba069b21b097f`
- target：`git diff 4a0e294797c290f0f365f329727ba069b21b097f`
- round：1
- reviewed_at：2026-08-03 19:56 UTC+8

## AC 覆盖核对

| AC  | 覆盖测试                                                                                                                                                                                                                                                               | 判定                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| AC1 | `tests/unit/ipc/token-stats-ipc.test.ts`「AC1: a pending dashboard query does not block the lightweight status IPC」：永不 resolve 的 promise 作慢查询屏障，dashboard handler 返回 pending，status handler 同步应答                                                    | 覆盖                                                 |
| AC2 | `query-worker.test.ts` 首测（正常结果 + data_version）；`token-stats-store.test.ts` readonly 块（读写 DTO 对比）；`token-stats-ipc.test.ts` delegate + QUERY_FAILED 错误映射；`server.test.ts`「routes through the isolated dispatcher」+ 既有 store 回退路径测试      | 覆盖（`previous` 区未对比，见 f003）                 |
| AC3 | `query-dispatcher.test.ts` 超时（timeout）、worker exit；`query-worker.test.ts` before-init / DB 打不开受控错误                                                                                                                                                        | 覆盖（过期响应丢弃路径无测试，见 f001）              |
| AC4 | `query-dispatcher.test.ts`「keeps only the newest queued request and supersedes an older one」：3 并发 → 1 active + 1 最新 queued，p2 收到 QuerySupersededError                                                                                                        | 覆盖                                                 |
| AC5 | `query-dispatcher.test.ts` exit→受控重启、stop()→reject in-flight + kill；worker close 消息                                                                                                                                                                            | 覆盖（crash 后 restart 间隙内新请求无测试，见 f002） |
| AC6 | `tests/e2e/packaged/smoke.spec.ts`「agent (token-stats) panel opens and the dashboard query runs in the packaged app」：真实启动打包 exe，打开 agent 面板，`.token-stats` 可见非空，getDashboard 完成（worker 失败会以 QUERY_FAILED 拒绝导致测试失败），pageerror 为空 | 覆盖                                                 |
| AC7 | `token-stats-store.test.ts` readonly 写拒绝（upsert_records / upsert_sessions / backfill_hour_rollup 抛 read-only）；worker 协议只收 `db_path` + `query` + `status`，不 import vault/config（结构性）                                                                  | 覆盖                                                 |

已实跑验证：`query-worker.test.ts`（4）、`query-dispatcher.test.ts`（5）、`token-stats-ipc.test.ts`（15）、`token-stats-store.test.ts`（68）、`server.test.ts`（23）全部通过。

## Findings

### t193_test_f001 - AC3 过期响应丢弃路径无测试

- 严重度：minor
- 锚点：AC3「返回过期响应时，调用方收到受控错误或最新有效结果」子句的部分缺失
- 位置：`tests/unit/main/core/token-stats/query-dispatcher.test.ts`（5 个测试均未覆盖）；实现 `src/main/core/token-stats/query-dispatcher.ts:136-151` `settle()`
- 问题：`settle()` 对「response 的 request_id 与当前 active 不匹配」时静默丢弃。任何测试都未构造「请求超时或被取代后，迟到的旧 request_id 响应到达」场景，无法证明旧响应不会错误 resolve 新请求或导致悬空。实现经代码检视正确（request_id 不匹配即丢），缺的只是回归护栏。超时（test 3）与取代（test 2）主路径已有测试，故不阻断。
- 建议：补一个 case——请求 1 超时（或被取代）后，再 `child.emit("message", { type: "query_dashboard_result", request_id: 1, dto })`，断言既不 resolve 也不影响随后 active 的请求 2 正常完成。

### t193_test_f002 - AC5 crash→restart 间隙内新请求无测试，且该路径存在双 fork 泄漏风险

- 严重度：important
- 锚点：AC5「执行端受控恢复后可继续查询」、AC3「异常后受控恢复」；可观测缺陷 = 资源泄漏（遗留 utilityProcess + 空闲 SQLite 连接）
- 位置：测试缺口 `tests/unit/main/core/token-stats/query-dispatcher.test.ts`（无「crash 后 restart timer 触发前新请求到达」用例）；实现 `src/main/core/token-stats/query-dispatcher.ts:116-131`（exit 处理设 restart timer）、`:197-199`（`request_dashboard` 在 `!child` 时立即 `spawn()`）
- 问题：dispatcher 测试 4 只覆盖「crash 时 in-flight 被拒 + timer 到点重启」。代码检视确认：crash 后 restart 间隙（默认 1000ms）内若 renderer 发来新查询，`request_dashboard` 因 `child === null` 立即 `spawn()` 新 child A；随后 restart timer 到点再次 `spawn()` child B，覆盖 `child` 引用。A 无引用被清、无 kill，成为泄漏的常驻子进程并持有只读 SQLite 连接（Electron 内部进程注册表持有，不会被 GC）。该路径无测试，泄漏对测试套件不可见。
- 建议：补一个「crash 后立即发新请求」测试（restart_delay_ms 设长，断言 timer 到点后不产生第二个 child / 或 spawn() 在已有 child 时跳过）。该测试会暴露上述泄漏；修复方向是 restart timer 回调先判 `if (!stopped && !child)`，或新请求 spawn 时清掉 restart_timer。

### t193_test_f003 - readonly 契约对比未覆盖 `previous` 区

- 严重度：minor
- 锚点：AC2「正常查询结果…与隔离前一致」
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:1088-1116`（对比 current/chart/heatmap/sessions）；`query-worker.test.ts:100-110`（只断言 data_version/sessions.total/current.calls）
- 问题：readonly 与 writable 的 DTO 对比漏掉 `previous` 区。`freshness`/`status` 属时间戳/外部传入不可比，可豁免；但 `previous` 是纯数据（上一窗口聚合），若 readonly 读路径在 previous 窗口分裂处理上分叉，测试无法察觉。当前实现 previous 与 current 共用同一 window-expansion 代码，风险低。
- 建议：补 `expect(dto_readonly.previous).toEqual(dto_writable.previous)`。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：无「迁就实现」的改测。ipc 测试中 dashboard handler 由同步变 async 后，`toThrow` → `rejects.toThrow`、`store.query_dashboard` mock → `dispatcher.request_dashboard` mock，均是对合法接口变更的适配，断言语义不变（未知 sender 拒绝、无效 query 不触达、合法 query 委托、错误映射 QUERY_FAILED）。
- 本轮新发现：3 条（f001 minor、f002 important、f003 minor）。
- 未进表的提示：
    - 测试策略写「集成测试覆盖并发上限、队列淘汰、超时、异常退出、恢复、退出清理和只读数据库行为」，实际全部以单测覆盖（dispatcher mock `electron.utilityProcess.fork`、worker mock `parentPort`，均为合法系统边界）。两侧从未经真实消息端口对接；真实 fork + 真实 better-sqlite3 对接由 packaged smoke（AC6）兜底。属覆盖方式与策略措辞的偏差，非阻断。
    - `query-dispatcher.test.ts:1` 文件级 `eslint-disable @typescript-eslint/no-non-null-assertion`：经调查为风格规则（与 `token-stats-store.test.ts:1` 既有约定一致），不掩盖类型错误或测试失败，判定 benign，不出 finding。
    - worker `close` 消息在 `query-worker.test.ts:111` 仅隐式触达（emit 后无断言）；AC5「退出清理」主断言在 dispatcher stop() 测试（reject + kill）。
    - packaged smoke 对 `data_version`/`sessions.total` 只查类型；AC6 定位是 ABI 与资源路径正确性，值正确性由单测/集成覆盖，可接受。
- 总体判断：测试对 AC1-AC7 主路径覆盖充分、断言用户可观察、mock 边界合法、实跑全绿；唯一 blocker 是 AC3/AC5 恢复间隙路径无测试且实现存在双 fork 泄漏风险（f002）。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-03 20:14 UTC+8)

前轮 finding 复核以 `git diff 4a0e294797c290f0f365f329727ba069b21b097f`（含工作区）与代码/测试为准，不采信处置表自称。实际实跑 `tests/unit/main/core/token-stats/{query-dispatcher,query-worker,token-stats-store}.test.ts`：79 全绿（dispatcher 7 / worker 4 / store 68），与实施侧自述一致。

### t193_test_f001（minor，stale response 丢弃路径无测试）— 已修

`tests/unit/main/core/token-stats/query-dispatcher.test.ts:106-130` 新增「drops a stale response whose request_id no longer matches the active request (AC3)」：p1 超时（active 置 null）后迟到 request_id=1 的 result，随后新请求 p2 正常完成。该测试在 `settle()`（`query-dispatcher.ts:138-153`）丢弃分支上建立回归护栏：若旧响应污染 dispatcher 状态（清错 active / 误发 queued），p2 的 resolve 断言会失败。未覆盖「被取代后迟到旧响应（active 非空时丢弃）」变体，但走同一 `active?.request_id === request_id` 判断，属可再加 case，不阻断。

### t193_test_f002（important，crash→restart 间隙双 fork 泄漏且无测试）— 已修

实现侧 `query-dispatcher.ts:127` restart timer 回调加 `!stopped && !child` 守卫；测试侧 `query-dispatcher.test.ts:155-186` 新增「does not double-fork when a request arrives during the restart gap (AC5)」：exit 后间隙内新请求立即 spawn（fork 计数 2），等 300ms（restart_delay 100ms）后仍断言 fork 计数 2（修复前该处会 fork 第三次，child 引用被覆盖泄漏，测试必红）。两处相互印证，泄漏路径被测试可见。

### t193_test_f003（minor，readonly 对比漏 previous 区）— 已修

`tests/unit/main/core/token-stats/token-stats-store.test.ts:1122` 补 `expect(dto_readonly.previous).toEqual(dto_writable.previous);`。readonly 与 writable 五区（current/previous/chart/heatmap/sessions）全对比，AC2 契约对比闭环。

### 附带复核

- t193_code_f002（stop() 先 close 再 kill）：`query-dispatcher.ts:259-260` 实测为 `child.postMessage({ type: "close" })` 先于 `child.kill()`；`query-dispatcher.test.ts:198` 新增 `expect(child.postMessage).toHaveBeenCalledWith({ type: "close" })`，close 协议主进程侧可达。worker 侧 `query-worker.ts:86-91` 处理 close（store 关闭并置 null），Round 1 未进表提示中「close 仅隐式触达」已在主进程侧补强；worker 侧仍为 emit 后无断言，属可选扩展。

### 结论

- 前轮 finding 复核：f001 已修；f002（含 code f001 同源修复）已修，回归测试在修复前实现上必红，证明测试真触达泄漏路径；f003 已修。无遗留、无撤回。
- 改测方向复核：无「迁就实现」的改测。本轮全部改动为新增（2 个新用例、previous 与 close 两处断言），未削弱或反转任何既有断言。
- 本轮新发现：0 条。
- 未进表的提示：stale 测试仅覆盖超时后（active 为 null）丢弃，未覆盖被取代后（active 非空）丢弃；同分支、minor 级可选扩展。dispatcher 侧 close 断言已补，worker 侧 close 处理无独立断言，可选。
- 总体判断：Round 1 唯一 blocker（f002）已修复且修复后 79 单测全绿，无未解决 critical / important。
- 系统性 follow-up：无。

verdict: PASS
