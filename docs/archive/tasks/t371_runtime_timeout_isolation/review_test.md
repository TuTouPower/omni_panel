# Task review t371（reviewer_focus: 测试）

- task：`t371_runtime_timeout_isolation`
- spec：`docs/tasks/t371_runtime_timeout_isolation/spec.md`
- diff_anchor：`b5ce97eed1c7367ac430a6e748adeb8e7f014e5a`
- target：`git diff b5ce97eed1c7367ac430a6e748adeb8e7f014e5a`
- round：1
- reviewed_at：2026-08-14 16:18 UTC+8

## 验证记录

- `npx vitest run tests/integration/connector`：22 文件 240 tests 全绿（含 3 处改动测试）。
- 黑盒探针（`.scratch/t371_probe_overlap.ts` / `t371_probe_overlap2.ts`，tsx 直跑 runtime，仅取证未入库）：
  - 沙箱内 `setTimeout` 未定义：脚本 `new Promise(...setTimeout...)` 同步抛 `ReferenceError: setTimeout is not defined`。
  - 真实挂起窗口（受控 `ctx.http.get_json` stub 400ms）内第二个调用被拒（guard 机制本身有效）。
  - 超时结算后（timeout 100ms、脚本 400ms 才 settle）立即启动新执行：`error: null`，**不拦截**。

## Findings

### t371_test_f001 - AC-001「超时后残留脚本不再并发打上游」场景零覆盖，且实测行为与验收句相反

- 严重度：critical
- 锚点：AC-001（「脚本超时后不再有后台残留脚本继续打上游（并发拒绝或 signal 取消）」；范围区「至少对已超时实例的并发执行计数并拒绝重叠启动」）
- 位置：`tests/integration/connector/runtime.test.ts:150-161`（唯一 AC-001 测试）；`src/main/core/connector/runtime.ts:154-159`
- 问题：现有测试只覆盖「未超时 in-flight 窗口」的重叠拒绝。AC-001 与任务背景的核心场景——**超时结算后异步残留脚本仍在后台运行时**拒绝新启动——无任何测试触达。计数在 `finally`（`runtime.ts:156-159`）于 `run_connector_inner` 超时返回 error result 时即归零，而残留脚本 promise 仍挂起；探针实测此时新执行返回 `error: null`（不拦截）。即 AC-001 的「超时后」子句：测试缺失 + 行为不成立（signal 取消路径 diff 中也未实现）。`handoff.json:13`（「超时后异步残留脚本不再被新调用叠加打上游」）与 `docs/blueprint/architecture.md` t371 行同句声明与实测矛盾，AC-001 证据链基于未发生的行为。「跨进程强杀 [deploy]」豁免不覆盖此场景（该场景可用确定性 timer 自动化）。
- 建议：补测试：timeout 100ms + 受控 `ctx.http` stub 400ms settle 的脚本，`run_connector` 超时返回后立即第二次调用，断言被拒（当前实现下会红）。该测试红后由实现侧决定：残留 settle 前不释放计数，或暴露 AbortSignal 绑定 `ctx.http`，或经用户收窄 spec 语义。

### t371_test_f002 - AC-001 测试 premise 失效：沙箱无 timer，脚本同步抛错，测试靠单 microtask 窗口通过

- 严重度：important
- 锚点：AC-001 + 「测试可信」（异步时序：测试经非声称机制通过）
- 位置：`tests/integration/connector/runtime.test.ts:152`（script 用 `setTimeout`）、`:153-157`
- 问题：注释声称「第一个执行挂起（异步 promise 未 resolve）…挂起 50ms」，但 vm 沙箱不注入 timer（`docs/blueprint/architecture.md` 沙箱行明示「无 require/process/fs/fetch/timer」；探针实测脚本同步抛 `setTimeout is not defined`）。`first` 实际在首个 microtask 即以 error result 结束，从未产生 50ms 挂起窗口。测试仍通过是因为 `run_connector` 的 `await run_connector_inner(...)`（`runtime.ts:155`）使外层把 pending promise 返回给调用方时计数仍为 1，`finally` 在后续 microtask 才执行——第二调用的同步前缀确定性地读到 count=1。结果确定（非 flake），但被测「窗口」是一个 microtask 的实现巧合，而非声称的异步执行中窗口；且测试未断言 `first` 的结果（若断言 `first.error === null` 即暴露脚本立即失败），掩盖了 premise 破损。探针 B1 证实真实挂起窗口（受控 `ctx.http` stub）guard 确实拒绝，故修复方向是把挂起源换成沙箱可用的受控 http stub 并断言 `first` 结果。
- 建议：`stub_ctx.http.get_json` 换成 50ms 后 resolve 的 stub，脚本 `await ctx.http.get_json(...)`；补 `expect((await first).error).toBeNull()`。

### t371_test_f003 - AC-002 组合链路无集成验证（net-client abort 错误 → is_timeout_error 归一化）

- 严重度：minor
- 锚点：AC-002（「abort 产生的错误可被 is_timeout_error 识别」）
- 位置：`tests/integration/connector/net-client.test.ts:531`；`tests/integration/connector/runtime.test.ts:184-206`
- 问题：net-client 层断言真实挂起服务器下错误消息匹配 `/timed? out/i`（实现消息 `HTTP request timed out after Nms` 含 "timed out"，正则按构造匹配，实测通过）；runtime 层 `is_timeout_error` 归一化只经 `race_with_timeout` 自产 `ConnectorTimeoutError` 路径测过。两层各自有据，但「net-client 超时错误经脚本抛出 → `runtime.ts:238` 归一化为 `Connector script execution timeout: HTTP request timed out…`」的组合链路无测试。正则 `/timed? out/i` 匹配 "time out"/"timed out"、不匹配无空格 "timeout"——现实现消息匹配，无问题。
- 建议：可选补一例：真挂起服务器 ctx + 脚本 `await ctx.http.get_json(...)`，脚本 timeout > HTTP timeout，断言 `result.error` 前缀 `Connector script execution timeout` 且含 `timed out`。

### t371_test_f004 - AC-003 断言偏弱：未锁定逐条计入语义

- 严重度：minor
- 锚点：AC-003
- 位置：`tests/integration/connector/runtime.test.ts:144-145`
- 问题：脚本返回 2 个非法条目（`:138`），断言仅 `length > 0` 与 `[0].error` 含片段。未锁定「每个非法 observation 各计一条」（length === 2）与 detail 内容（issue path/message），单条 vs 多条计入语义可退化而不被发现。新增断言确实触达新代码（`runtime.ts:214-227`），无 mock 冒充问题。
- 建议：`expect(result.failed_accounts).toHaveLength(2)`，可加一条断言 detail 含具体 issue path。

## 结论

- 改测方向复核：无迁就实现。`net-client.test.ts:531` `toThrow()` → `toThrow(/timed? out/i)` 是强化（任意错 → 超时错），对应 spec 背景第 3 点，归因成立；`runtime.test.ts:143-145` 为既有测试上叠加断言，旧断言原样保留。
- 本轮新发现：4 条（critical 1、important 1、minor 2）
- 未进表的提示：`run_connector` 超时归一化对 `ConnectorTimeoutError` 自身消息二次加前缀（`Connector script execution timeout: Connector script execution timeout after 100ms`，`runtime.ts:238`），非本 diff 引入，属 code reviewer 范围；模块级 `running_scripts` 跨同文件测试共享，全部用例均 await 收尾，无残留污染。
- 总体判断：AC-002/003 测试到位且全绿；AC-001 的「超时后残留」核心场景无测试且黑盒实测行为相反，handoff/architecture 的 AC-001 证据与实测矛盾——存在未解决 critical/important。
- 系统性 follow-up：AC-001 超时残留语义需实现侧闭环（计数释放时机 / AbortSignal / spec 收窄三选一），建议随 f001 红测在 t371 内修复。

verdict: FAIL

---

# Task review t371（reviewer_focus: 测试）

- task：`t371_runtime_timeout_isolation`
- spec：`docs/tasks/t371_runtime_timeout_isolation/spec.md`
- diff_anchor：`b5ce97eed1c7367ac430a6e748adeb8e7f014e5a`
- target：`git diff b5ce97eed1c7367ac430a6e748adeb8e7f014e5a`
- round：2
- reviewed_at：2026-08-14 18:35 UTC+8

## 验证记录

- `npx vitest run tests/integration/connector/runtime.test.ts`：16 tests 全绿；`npx vitest run tests/integration/connector`：241 tests 全绿（Round 1 为 240：删 1 个旧重叠测试、新增冷却 + 不冷却 2 个）。
- Mutation 取证（临时改 `src/main/core/connector/runtime.ts`，跑完即恢复，`git diff` 与原工作区改动逐字节一致；备份已清）：
  - M1 删冷却设置（注释 `script_cooldown_until.set(...)`）：cooldown 测试红——`second.error` 为 `null`，`toContain("cooling down")` 断言失败（`runtime.test.ts:166`）。删冷却检查逻辑同理（second 不再被拒，同一断言失败）。
  - M4 冷却时长 `2x`→`10x`：cooldown 测试红——第三段 `expect(third.error).toBeNull()` 失败，实测 `third.error` = `Connector cooldown-test is cooling down after a previous timeout...`（130ms < 500ms 仍处冷却）。
- anchor 基线核验：`git show b5ce97ee:src/main/core/connector/runtime.ts` 无 `running_scripts`/in-flight 计数——Round 1 期间的 guard 是实现期引入、重设计时移除，净 diff 只含冷却逻辑。

## Findings

### t371_test_f005 - handoff.json AC-001 证据仍描述重设计前的机制与测试名，收尾证据链失真

- 严重度：important
- 锚点：spec 契约区门禁「收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号」；Round 1 f001（handoff 证据与实测矛盾项未完全闭环）
- 位置：`docs/tasks/t371_runtime_timeout_isolation/handoff.json`（未跟踪收尾产物）：`ac_evidence.AC-001[0]`、`ac_evidence.AC-001[1]`、`tests` 字段
- 问题：AC-001 证据描述「`run_connector` 同 manifest 重叠执行拒绝（running_scripts 模块级计数，执行中拒绝新启动）」与引用测试名「`rejects overlapping execution for the same manifest`」在当前 diff 与测试文件中均不存在（实现已重设计为超时冷却，guard 已删；测试名实为 `rejects execution during cooldown after a timeout`）；`tests` 字段的「同 manifest 重叠拒绝」同病。integrate 阶段按 ac_evidence 核验时证据不可追溯。Round 1 已指出 handoff 的 AC-001 证据与实测矛盾，本轮代码侧修复但 handoff 未同步，属修不彻底。
- 建议：更新 `ac_evidence.AC-001` 与 `tests` 字段为冷却语义（超时结算后 2x timeout 冷却拒绝 + `rejects execution during cooldown after a timeout` / `does not cool down after a normal completion` 测试名），纯文字修正。

## 结论

- 前轮 finding 复核：
  - f001（critical）：已消除。实现重设计为超时冷却（超时结算且 `is_timeout_error` 命中才设 2x timeout 冷却，期内拒绝同 manifest 新执行，过期自动清理）；新测试三段断言（超时→拒绝→恢复）经 M1/M4 mutation 实测均红，真实触达 `race_with_timeout` 超时路径。既有超时测试改唯一 manifest id 隔离模块级冷却，全目录 241 全绿无污染。附带 `does not cool down after a normal completion` 防止误重引入 in-flight 互斥（并发双执行若被 guard 拒即红）。
  - f002（important）：已消除。挂起源改为 vm 内同步可达的 `return new Promise(function(){})`，race_with_timeout 50ms timer 超时，不再依赖沙箱不存在的 timer；首轮断言 `first.error` 含 timeout，premise 与机制一致。
  - f003（minor）：同意不修，可接受。链条两端各自有据（net-client reason 消息 `/timed? out/i` 实测、runtime 冷却测试覆盖 `is_timeout_error` 归一化路径），谓词为纯字符串匹配且错误消息字面量已被两端断言锁定；组合链集成用例属「可以再加 case」，不 blocking。
  - f004（minor）：已修复。`toHaveLength(2)` 锁定逐条计入，循环断言每条 `error` 含 `schema validation failed` 与 `account_id === "unknown"`（脚本两条非法观测均无 account_id，缺省语义锁定）。detail 具体 issue path 断言未加（原建议为可选项，zod issues 必非空，前缀断言已隐式覆盖）。
- 本轮新发现：1 条（important 1：handoff 证据失真）
- 未进表的提示：冷却测试的 hanging promise 永 pending，但 pending promise 非 libuv 资源不阻碍进程退出（实测 1.11s 正常结束），泄漏量级 KB 级且与既有 `async-timeout` 测试的 never-resolving stub 同模式；130ms 等待对 100ms 冷却的单调方向安全（until 在 sleep 前固定，Node timer 只晚不早，CI 延迟均把第三轮推后），理论残余仅 `Date.now()` 时钟回拨与 second 前 100ms+ 极端停顿，全仓测试普遍同水位；若 CI 极慢致 vm 同步段超 50ms，错误切换为 vm timeout 路径仍含 "timed out"，三段断言不破；`docs/blueprint/architecture.md` 表格整行 reformat 为 md 格式化噪音。
- 总体判断：AC-001/002/003 的实现与测试均到位且经 mutation 验证有区分度，但 handoff.json 的 AC-001 证据仍指向已删除的机制与不存在的测试名，收尾门禁要求未满足——存在未解决 important。
- 系统性 follow-up：f003 组合链用例（net-client 超时 reason 经脚本抛出→runtime 归一化→触发冷却）可随后续 connector task 顺带补，无需单独立项。

verdict: FAIL
