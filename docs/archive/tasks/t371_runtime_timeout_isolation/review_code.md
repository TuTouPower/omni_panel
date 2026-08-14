# Task review t371（reviewer_focus: 代码）

- task：`t371_runtime_timeout_isolation`
- spec：`docs/tasks/t371_runtime_timeout_isolation/spec.md`
- diff_anchor：`b5ce97eed1c7367ac430a6e748adeb8e7f014e5a`
- target：`git diff b5ce97eed1c7367ac430a6e748adeb8e7f014e5a`
- round：1
- reviewed_at：2026-08-14 16:20 UTC+8

## Findings

### t371_code_f001 - AC-001 并发拒绝对「超时后僵尸」无效：计数生命周期与僵尸生命周期错位，ctx.signal 未实现

- 严重度：critical
- 锚点：AC-001 + 行为缺陷——超时后重试仍叠加新脚本实例，后台残留照常打上游，与改前行为一致
- 位置：`src/main/core/connector/runtime.ts:143-159`、`runtime.ts:203`、`src/main/core/connector/host-io.ts:14-57`、`src/main/core/connector/net-client.ts:298-307`、`docs/blueprint/architecture.md:91`
- 问题：`running_scripts` 计数在 `run_connector` 的 `finally` 递减（runtime.ts:156-159），递减时机是 `run_connector_inner` 返回——超时路径下即 `race_with_timeout` 在 timeout_ms 时 reject（runtime.ts:203）、catch 返回 error 的那一刻（runtime.ts:236-241）。而僵尸脚本恰从这一刻起继续存活（`vm.runInContext` 的 `timeout` 只断同步执行，runtime.ts:197-199，异步 promise 残留）。时序推演：
  1. t=0 实例启动，计数 0→1；
  2. t=15s 外层超时返回，计数 1→0，僵尸继续在 VM 后台发 HTTP；
  3. refresh-service 重试（`retry_delay_ms=1000`，refresh-service.ts:267-268、487-489）在 t=16s 调 `run_connector`，计数已为 0——**不会被拒绝**，新实例照常启动；
  4. 每轮超时各留一个僵尸，无限叠加——正是 spec 背景描述的原缺陷场景（「同一实例并发多个脚本实例反复打上游」）未被修复。
  计数唯一覆盖的窗口是首个执行的 t=0..timeout 区间，该区间内同实例非 force 重叠本就被 t370 per-instance 锁挡住（refresh-service.ts:230-233）；spec 提供的另一机制「signal 取消」也未实现：`ConnectorContext` 无 `signal` 字段（host-io.ts:14-57），net-client 每请求独立 AbortController（net-client.ts:298-307），外层脚本超时不取消僵尸在途请求。scope 第 1 项「超时时向脚本暴露 AbortSignal（ctx.signal）」与「风险与回退」指定的轻量路径「AbortSignal 透传 + 并发拒绝」两半均缺：拒绝窗口错位、透传未做。新增测试只覆盖超时前重叠窗口（tests/integration/connector/runtime.test.ts:150-161），未触及超时后窗口。`architecture.md:91` 写「超时后异步残留不再并发打上游」与实际行为不符。
- 建议：二选一：(a) 实现 ctx.signal——`run_connector_inner` 创建 AbortController 注入 ctx，超时时 abort 并由 net-client `perform_request` 绑定该 signal（满足 scope 第 1 项原文）；(b) 若维持拒绝语义，把计数持有期改为「执行 promise（含超时后残留）真正 settle 才清零」或超时后保留计数直到冷却窗口结束。同步修正 architecture.md 的行为描述。

### t371_code_f002 - per-manifest 互斥误伤同 manifest 多实例并发刷新，并回退 t370 force 刷新语义

- 严重度：important
- 锚点：行为缺陷——同 manifest 两个实例并发刷新，后者被「already running」误判失败；force 手动刷新在自动刷新飞行窗口内被拒
- 位置：`src/main/core/connector/runtime.ts:145-151`（key=`manifest.id`）、`src/main/core/scheduler/refresh-service.ts:248-250`、`refresh-service.ts:267-268`、`refresh-service.ts:487-489`、`refresh-service.ts:556-560`、`refresh-service.ts:520-524`
- 问题：runtime 拒绝按 `manifest.id` 互斥，refresh-service 并发控制按 `instanceId`（t370 锁），两个模型冲突。`refreshAll` 对启用实例并发刷新（with_concurrency 上限 5，refresh-service.ts:556-560）；同一 `executablePath` 的多账号实例（execute_connector 注释明示支持「two Firecrawl accounts」，refresh-service.ts:193-196）共享同一 definition 即同一 `manifest.id`（refresh-service.ts:248-250）。时序：A、B 同时进入 `run_connector`，B 必然撞上计数被拒（`execute_connector` 把 error 转抛，refresh-service.ts:181-182）；重试预算 `max_attempts=3`、`retry_delay_ms=1000`，B 总容忍窗口仅约 2s，而连接器默认超时 15s（`DEFAULT_TIMEOUT_MS`）、真实多账号脚本常超 2s——B 三次全败后被标 failed（refresh-service.ts:520-524），UI 显示失败卡片且全部观测标 stale。即多账号同 provider 用户每轮刷新必有一个实例假失败。另一失败模式：t370 AC-001 让 `force=true` 绕过锁以支持「自动刷新持锁时手动刷新不静默跳过」（refresh-service.ts:228-233），t371 的互斥在飞行窗口内把 force 调用同样拒绝，force 三次重试同样撑不过 2s 窗口，部分回退 t370 的 AC-001。
- 建议：互斥粒度对齐刷新模型——拒绝 key 从 `manifest.id` 收窄到实例级（如把 instanceId 传入 run_connector，或按 `manifest.id + instanceId`；f001 若改为 ctx.signal/冷却方案则本条随之消解）。force 与多实例场景补集成测试。

### t371_code_f003 - schema 失败合成 failed_accounts 条目：account_id 恒为 "default"、逐条无去重，失败计数与 stale 日志失真

- 严重度：minor
- 锚点：行为缺陷——N 条非法观测产生 N 条同 key 假账号失败记录；若观测真实使用 account_id "default"（测试 fixture 即用该值，runtime.test.ts:53），会误标无关账号 stale
- 位置：`src/main/core/connector/runtime.ts:221-226`、`src/main/core/scheduler/refresh-service.ts:337-349`
- 问题：每条非法 observation 各 push 一条 `account_id: "default"`、`account_label: manifest.provider` 的合成记录。后果：(1) N 条非法条目→N 条重复 failed 记录，refresh-service 日志「Marked N observation(s) stale for M failed account(s)」计数放大；(2) stale 副本循环按 `failed.account_id` 匹配 prior 观测（refresh-service.ts:341），若某连接器观测恰好用 account_id "default"（现有连接器未用，第三方脚本可能用），一条非法观测会把刚刷新成功的账号误标 stale；(3) `account_label` 与 provider 同值，UI 失败展示无区分度。
- 建议：同 manifest 同轮 schema 失败合并为一条（error 里带条数与 detail 列表），或 account_id 用不与真实账号空间冲突的哨兵值（如 `__schema__`）。

## 结论

- 前轮 finding 复核：不适用（Round 1）
- 本轮新发现：3 条（critical 1、important 1、minor 1）
- 未进表的提示：文件过大——`src/main/core/connector/net-client.ts` 493 行（≥400 阈值，本 task 净增 +6，降级为提示）；`tests/integration/connector/net-client.test.ts` 701 行（≥600 阈值，本 task 净增 +3，降级为提示）。验证复核：`npx tsc --noEmit` 通过；eslint 四文件 `--max-warnings=0` 通过；`npx vitest run tests/unit tests/integration` 3118 passed / 9 skipped，全绿。undici 8.3.0 abort reason 传播经独立 node 探针验证（3 次稳定）：`abort_controller.abort(new Error("HTTP request timed out after Nms"))` 使 undici `request` 以该 reason reject，AC-002 机制成立。
- 总体判断：AC-002、AC-003 落地且经独立验证；AC-001 的两个可选机制（并发拒绝/信号取消）一个窗口错位无效、一个未实现，核心缺陷未修复，且互斥引入多实例/force 假失败回归。
- 系统性 follow-up：建议 spike task 落实进程级隔离（spec 未知契约清单已标 `UNVERIFIED-SPIKE`）；f002 若不随 f001 修复可立独立修复 task。

verdict: FAIL

---

# Task review t371（reviewer_focus: 代码）

- task：`t371_runtime_timeout_isolation`
- spec：`docs/tasks/t371_runtime_timeout_isolation/spec.md`
- diff_anchor：`b5ce97eed1c7367ac430a6e748adeb8e7f014e5a`
- target：`git diff b5ce97eed1c7367ac430a6e748adeb8e7f014e5a`
- round：2
- reviewed_at：2026-08-14 18:41 UTC+8

## Findings

### t371_code_f004 - AC-001 冷却测试并行负载下 flake：实测 1/9 失败（second.error 为 null）

- 严重度：minor
- 锚点：测试可信——正确实现下测试间歇性红，CI 门禁可靠性受损
- 位置：`tests/integration/connector/runtime.test.ts:161-166`
- 问题：全目录并行跑（22 文件 forks、20 核 WSL2）9 次中 1 次（2026-08-14 18:30 run，`1 failed | 21 passed`）失败于 `expect(second.error).toContain("cooling down")`，报错 `the given combination of arguments (null and string)`——`second.error === null`，即第二次调用时冷却条目已过期或缺失（冷却窗 50ms×2=100ms）。代码复核排除「未设置」路径（设置在 `run_connector` 返回前同步完成、manifest id 唯一），剩余解释是 first 结算到 second 检查之间 wall-clock 间隔 ≥100ms——CPU 饥饿下相邻 await 间的同步段被调度器抢占可超 100ms，50/100/130ms 固定边距对此无冗余。复跑同命令 8 次全绿，低概率 flake。测试 reviewer Round 2（review_test.md:99）将其归为「理论残余」，本观测为其反例。
- 建议：放宽边距（如 timeout 200ms → 冷却 400ms、等待 500ms），使同步段抢占余量远小于冷却窗；无需改产品代码。

### t371_code_f005 - handoff.json AC-001 证据仍描述已删除的 in-flight 计数机制与不存在的测试名

- 严重度：important
- 锚点：文档/配置一致性 + spec 契约区门禁「收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖」；Round 1 f001 代码侧修复未同步收尾产物
- 位置：`docs/tasks/t371_runtime_timeout_isolation/handoff.json`（未跟踪收尾产物）：`ac_evidence.AC-001[0]`（「running_scripts 模块级计数，执行中拒绝新启动」）、`ac_evidence.AC-001[1]`（测试名「rejects overlapping execution for the same manifest」）、`tests` 字段（「同 manifest 重叠拒绝」）
- 问题：当前 `runtime.ts` 已无 running_scripts（重设计为超时冷却），引用的测试名在测试文件中不存在（现为 `rejects execution during cooldown after a timeout (t371 AC-001)` 与 `does not cool down after a normal completion (t371 AC-001)`）。integrate/finish 按 ac_evidence 核验不可追溯；archive 内文件只准新增，事后修正困难。测试 reviewer 已独立登记同问题（`review_test.md` t371_test_f005），两轴一致。
- 建议：`ac_evidence.AC-001` 与 `tests` 字段改写为冷却语义（超时结算后 2x timeout 冷却拒绝 + 两个新测试名），纯文字修正。

### t371_code_f006 - spec 缺陷(2)（await 后同步死循环饿死事件循环）未缓解：scope「或文档明示+耗时监控」分支未做，新注释「vm timeout 只断同步执行」表述不精确

- 严重度：minor
- 锚点：范围合规——契约区范围第 2 项「或文档明示『await 后不得长同步循环』并加执行耗时监控日志」两分支均未执行；行为先于本 diff 存在（非本轮引入），AC 区无对应 AC，处置为改 spec/补文档
- 位置：`src/main/core/connector/runtime.ts:143`（注释）、`docs/blueprint/architecture.md` t371 行（「vm timeout 只断同步」）、spec 范围第 2 项
- 问题：探针验证（`.scratch/` 临时复现后已删：`await Promise.resolve(); while(true){}` + `vm.runInContext` timeout 100ms，进程 5s 被外层强杀且无任何输出）：vm watchdog 只覆盖首个同步段，await 后 continuation 的同步死循环既不被 vm timeout 中断，也饿死事件循环使 `race_with_timeout` 的 setTimeout 永不触发——`run_connector` 永不结算、主进程冻结，冷却机制在该场景无法生效（冷却只在超时结算后设置）。runtime.ts:143 与 architecture.md 的「vm timeout 只断同步执行」易读成「同步执行均被断」，实际仅首段。进程级隔离按 spec 未知契约清单（`UNVERIFIED-SPIKE`）与风险回退留 spike 属既定决策，但便宜的「或」分支（文档一行声明 + 执行耗时监控日志）未做。
- 建议：二选一：(a) spec 范围第 2 项收窄为「进程隔离留 spike」（改 spec，缺陷(2) 显式转 backlog/spike）；(b) architecture.md connector 沙箱行补「await 后不得长同步循环（vm timeout 不覆盖 continuation，事件循环饿死使一切超时失效）」声明。注释措辞顺带修正为「vm timeout 只断首个同步段」。

## 结论

- 前轮 finding 复核：
  - f001（critical）：已消除。重设计为超时冷却：`run_connector_inner` 返回后 `is_timeout_error(result.error)` 命中即设 `timeout_ms*2` 冷却（`runtime.ts:159-166`），冷却期内拒绝同 manifest 新执行（`runtime.ts:147-157`）。三条超时路径均验证会设冷却——同步 `while(true)`（Node 消息 `Script execution timed out after Nms`，探针实测 regex `timed? out` 命中）、异步 never-resolve（`ConnectorTimeoutError`，端到端测试锁定）、脚本内 HTTP 超时（`HTTP request timed out after Nms`）；normalized 前缀路径同被 regex 覆盖。refresh-service 重试链复核：拒绝错误经 `execute_connector` 抛出（`refresh-service.ts:181-182`），`is_auth_error` 无命中（不触发假 relogin）、`is_connection_error` 匹配 `etimedout` 而非 `timed out`（不误升 fresh connection），+1s/+2s/+3s 三次重试全落在 2x15s=30s 冷却内被拒，循环退出后 stale 副本 + `updateState failed` 且错误信息含 "cooling down"（`refresh-service.ts:499-524`）——符合「可见反馈」，残留不再叠加。冷却窗覆盖结算后 2x timeout 的残留生命周期；更长残留为已知不可知，architecture.md 如实表述「防残留与重试叠加」而非「消灭残留」。`ctx.signal` 如实标注预留未填充，与 architecture.md 一致。即 Round 1 建议 (b) 的「超时后保留计数直到冷却窗口结束」方案。
  - f002（important）：已消除。in-flight 互斥整体移除（当前 `runtime.ts` 无 running_scripts；anchor 基线亦无——系实现期引入后随重设计移除，净 diff 只含冷却逻辑）。正常完成不设冷却，新增 `does not cool down after a normal completion`（Promise.all 双并发均成功）防互斥回归。残留语义观察（非缺陷）：超时后同 manifest 另一实例（多账号场景）在冷却期内同样被拒、该实例标 failed——按 manifest 防叠加的有意设计，失败信息含 cooling down 可辨识、冷却过期后下轮即恢复，不构成 f002 式常态化误伤。
  - f003（minor）：已消除。account_id 取观测自身字段（string 且非空），缺省 "unknown"——不再合成 "default"，真实 default 账号 stale 误匹配消除；观测自身携带 account_id 而因其它字段非法时按该账号标 stale 属如实反馈。残留（不单列）：N 条非法 → N 条记录（"unknown" 可重复）不合并、account_label 与 provider 同值——仅日志计数观感，"unknown" 不匹配真实账号观测，无行为危害。
- 本轮新发现：3 条（important 1、minor 2）
- 未进表的提示：冷却 Map 泄漏评估——条目仅超时后创建、过期后下次执行 lazy delete，上界为曾超时的 manifest 数，无按执行增长，不构成泄漏。模块级 Map 测试隔离——vitest 默认 forks+isolate（配置未覆写）每测试文件独立模块注册表，跨文件不可能污染；文件内三个超时测试用唯一 id（cooldown-test / sync-timeout-test / async-timeout-test），poll_manifest（id "test"）各用例错误均不匹配 is_timeout_error 不触发冷却；其余 connector 测试文件（grok/firecrawl 等）用各自真实 manifest id，仅自身先超时（本身就是失败）才可能设冷却。abort reason 变更无其它消费方（grep 全仓仅 net-client 一处 abort）。验证复核：`npx vitest run tests/unit tests/integration` 262 文件 3119 passed / 9 skipped 全绿；`npx vitest run tests/integration/connector` 241 passed（另见 f004 的 1/9 flake 观测）。
- 总体判断：Round 1 三条 finding 全部消除，冷却机制经探针（同步/异步/HTTP 三路径 + await-starvation 反例）与测试双验证；但 handoff.json 收尾证据未随重设计同步（f005，important），须文字修正后方可收尾。
- 系统性 follow-up：进程级隔离已留 spike（`UNVERIFIED-SPIKE`）；spec 缺陷(2) 若不走 spike，按 f006 补文档声明或改 spec。

verdict: FAIL
