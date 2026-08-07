# Task review t256（reviewer_focus: 测试）

- task：`t256_session_first_open_main_unblock`
- spec：`docs/tasks/t256_session_first_open_main_unblock/spec.md`
- diff_anchor：`c701f36871cb57b9f7bdd46b1d9cd637f4c0812a`
- target：`git diff c701f36871cb57b9f7bdd46b1d9cd637f4c0812a`
- round：1
- reviewed_at：2026-08-07 23:35 UTC+8

## Findings

### t256_test_f001 - AC1 摘要/定位路径异步让路无自动测试覆盖

- 严重度：important
- 锚点：AC1；可测试性声明「以『该路径无同步 fs 调用』的静态/单测断言 + 集成测试中并发 IPC 响应断言代替事件循环延迟测量」
- 位置：`src/main/core/session-history/subscription-service.ts:675-694`（summaries 任务体加 `await setImmediate` 让路）；`tests/unit/main/core/session-history/subscription-service.test.ts`（未改动）
- 问题：AC1 锚定「首屏摘要批量加载期间主进程不被同步文件 I/O 长时间占满」。实现只对 `summaries` 任务体加 `await setImmediate(resolve)` 让路，但测试侧没有任何验证该让路行为的断言：spec 上下文「测试策略」明确「异步化后的摘要/定位路径用 tmp fixture + 并发请求断言结果一致性与响应性」，当前只有既有结果一致性测试（subscription-service.test.ts:982-1043，断言摘要文本/缓存命中，属 AC3），无并发响应或「任务间让出宏任务」断言。AC1 的自动测试完全缺失。
- 建议：为 summaries 补测「一次宏任务只处理部分 loc、结果延迟到全部完成」或「加载期间并发请求可返回」，复用 manager.test.ts 的 flush helper 模式。

### t256_test_f002 - 分批测试数据形态不真实，掩盖 apply_batches 静默截断 bug（AC3 数据丢失）

- 严重度：important
- 锚点：AC3（token 统计数字与现状一致）；范围「collector 写入结果与现状一致」
- 位置：`src/main/core/token-stats/manager.ts:63-93`（apply_batches）；`tests/unit/main/core/token-stats/manager.test.ts:119-144`（大批 update 测试构造 `daily: []` / `records: []`）
- 问题：`apply_batches` 以 `total = sessions.length` 为循环边界，offset 每批 `+UPDATE_BATCH_SIZE`，一旦 `offset >= total` 即 `on_update()` 退出。但 collector 真实数据中 daily 可至 sessions 的 5 倍（`collector.ts:26` `MAX_RECORDS=10000`，daily cap `MAX_RECORDS*5`、records cap `MAX_RECORDS*20`）。当 `daily/records.length > sessions.length` 时，超出部分的 daily/records 被静默丢弃。示例输入：sessions 1 条 + records 3000 条 → 首批 upsert records 前 2000 条后 `offset=2000 >= total=1` 即退出，后 1000 条 records 永不写入且无错误。原实现一次 `upsert_records(msg.records)` 全量写入，无此丢失。新测试只构造 sessions 长（5000）而 daily/records 为空，未覆盖该真实形态，AC3 数据一致性在真实输入下无测试保护。
- 建议：循环边界改为 `max(sessions, daily, records).length`（或按各数组分别分片）；补测「sessions 短、records 长」形态，断言全量写入且最终数据一致。此实现缺陷建议 code reviewer 同步跟进。

### t256_test_f003 - AC2 并发查询断言缺失（minor）

- 严重度：minor
- 锚点：AC2 可测试性声明「集成测试模拟回填批次写入期间发起查询，断言查询在阈值内返回」
- 位置：`tests/unit/main/core/token-stats/manager.test.ts:119-144`
- 问题：分批让路测试验证了「一次宏任务只处理 2 批」和「on_update 延迟到全部完成」，证明批次间宏任务让出机制；但未按测试策略「断言查询在批次交错中返回」实际发起并发查询。查询响应是让路机制的推论，机制本身已被测，故不 blocking。
- 建议：可选补一条「分批处理期间发起 store 查询/其他 IPC 可返回」断言。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无
- 改测方向复核：无「迁就实现」的改测。既有测试「stores session deltas」改动仅为 async + `flush_macrotasks()` 等待异步 upsert，断言内容（upsert 参数、on_update 次数）未变，属实现语义从同步改异步后的合法适配，非实现驱动测试。
- 本轮新发现：3 条（important × 2，minor × 1）
- 未进表的提示：`flush_one_macrotask` / `flush_macrotasks`（50 次上限）针对固定数据规模（5000 条 / 3 批）可靠，setImmediate 在真实 timer 下顺序稳定（该测试未开 fake timers），无不确定性 finding。另：apply_batches 的 catch 分支（store 抛错后停止调度且不调 on_update）无失败路径测试，覆盖可更广，归入 minor 范畴不再单列。
- 总体判断：AC1 无自动测试、AC3 在真实数据形态下存在数据丢失逃逸，两个未解决 important 阻断。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-07 23:47 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准，不采信处置表自述）

- **t256_test_f001（important）— 仍存在（修不彻底）**：新增测试 `tests/unit/main/core/session-history/subscription-service.test.ts:1046-1075` 命名「多个摘要任务经 setImmediate 让出，非同步串行阻塞」，但断言仅 3 行结果一致性（`expect(result["grok|wsl|g0"]).toBe("msg0")` 等，1067-1069），无任何断言区分同步/异步执行。注释（1048-1049）自称「记录各任务实际执行顺序」但从未记录也从未断言。回退 `src/main/core/session-history/subscription-service.ts:678` 的 `await setImmediate` 让路（恢复同步任务体）后本测试仍绿：AC1 测试性声明要求的「无同步 fs 调用」或「加载期间并发 IPC 及时返回」断言仍缺失。结果一致性本已由既有 AC3 测试覆盖（982-996 返回首条 user 文本前 80 字符），此测试对 AC1 不构成证据。
- **t256_test_f002（important）— 已消除**：`tests/unit/main/core/token-stats/manager.test.ts:146-169` 构造 sessions=1、records=5000，断言 `upsert_records` 恰 3 批、第 3 批 `slice(4000,5000)`、`upsert_sessions` 3 次、`on_update` 1 次。回退到 Round 1 的 `total = sessions.length`（=1）边界时仅 1 批（slice(0,2000)）后 `offset>=total` 退出，`toHaveBeenCalledTimes(3)` 红——回归覆盖真实。实现侧 `manager.ts:70` 改 `Math.max(...)` + 每数组独立切片后全量写入。本地运行通过。
- **t256_test_f003（minor）— 已消除**：`manager.test.ts:119-144` flush 一个宏任务后仅 2 批且 `on_update` 未触发，flush 满后 3 批 + `on_update` 1 次；setImmediate FIFO 时序稳定（该测试未开 fake timers），批次间隔真实断言，覆盖「每批间让出」。

### 改测方向复核

无「迁就实现」的改测。既有「stores session deltas」改 async + `flush_macrotasks()` 等待，upsert 参数与 `on_update` 次数断言语义未变，为同步→异步语义的合法适配。

### 本轮新发现

0 条独立新 finding；f001 残留以同名沿用原 ID。

### 未进表的提示

- `apply_batches` 失败路径（store 抛错后停批且不触发 `on_update`）仍无测试，Round 1 已提示，归 minor。
- 新 summaries 测试 `unsubscribe_all()` 位于断言之后，断言失败时服务句柄未释放（仅 tmp dir 由 finally 清理），资源清理顺序，归 minor。

### 总体判断

f002（AC3 数据截断）、f003（AC2 让路机制）已真修并真测；f001（AC1 异步让出）仍无有效自动测试——新增测试以结果一致性冒充异步让出覆盖，测试名/注释与断言不符，AC1 依旧无测试。存在未解决 important，阻断。

verdict: FAIL

## Round 3 (2026-08-07 23:55 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准，不采信处置表自述）

- **t256_test_f001（important）— 已消除**。实现侧 `subscription-service.ts:668-698` `summaries` 任务体 `await new Promise((resolve) => setImmediate(resolve))` 让路；测试侧 `subscription-service.test.ts:1046-1088` 新增「summaries 异步让出」describe，用 `vi.spyOn(service, "extract_first_user")` 计数。**经验证**：
    - spy 方案可靠区分同步/异步：`with_concurrency_limit` 构造期同步 `start_next()` 启动任务，`summaries(locs)` 同步返回前，同步实现（无 yield）会把 3 个任务体跑完 → `extract_count=3`；setImmediate 实现任务暂停在宏任务 → `extract_count=0`。`expect(extract_count).toBe(0)` 在调用后、任何微任务 drain 前同步执行，无时序抖动。
    - **回退验证（红）**：临时移除 line 678 `await setImmediate`（任务体变同步）后，`npx vitest run ... -t "summaries"` 该测试红，`expected 3 to be +0`（line 1077）。恢复后绿。
    - 断言顺序合理：await 后 `extract_count===3`（全部 extract 完成）+ 结果正确，补足「让出后仍完成」语义。
    - 结论：f001 核心诉求（回退 setImmediate 后测试应变红）已达成，AC1 由「机制级」单测覆盖（spec 可测试性声明允许的静态/单测代理形式），不阻塞。

### 本轮新发现

- **t256_test_f004（minor）— sync 检查不区分微任务让出与宏任务让出**：`subscription-service.test.ts:1077` 的 `expect(extract_count).toBe(0)` 只证明「存在某种 await 让出」，未证明是宏任务（setImmediate）。**经验证**：临时把 `setImmediate` 换成 `await new Promise((resolve) => resolve())`（微任务让出，不释放事件循环 I/O，会回归 AC1）后，该测试仍绿。测试名/注释（1047、1049-1050）声称「setImmediate 让出」超出实际断言强度。建议加固：在 `const pending = service.summaries(locs);` 后插入 `await Promise.resolve(); expect(extract_count).toBe(0);`（drain 微任务后仍是 0 才证明让出发生在宏任务；微任务实现此处已=3 会红）。当前实现正确、同步回归已被捕获，故非阻断。

### 改测方向复核

无「迁就实现」的改测。本轮新增测试断言的是实现应然行为（异步让出存在），spy 只计数不改变被测调度语义；f002 测试（records 5000 分 3 批）断言的是修复后应然全量写入，非迁就。

### 未进表的提示

- Round 2 已提示、仍存在且无害：`unsubscribe_all()` 与 `spy.mockRestore()` 位于断言之后，断言失败时未执行（新测试服务未启动 watcher，无句柄泄漏，仅 tmp 由 finally 清理）。
- `apply_batches` 失败路径（store 抛错后停批不触发 on_update）仍无测试，Round 1 已列 minor，本轮不重复计数。

### 总体判断

f001 已真修并真测（回退 setImmediate 变红已亲自验证）；f002/f003 前轮已消除。仅新增 minor（微任务/宏任务区分可更精确），无未解决 critical/important。本 task 测试侧达到可信，放行。

verdict: PASS
