# Task review t042（reviewer_focus: 测试）

- task：`t042_web_usage_panel_sse_refresh`
- spec：`docs\tasks\t042_web_usage_panel_sse_refresh\spec.md`
- diff_anchor：`b7d438b7a37bfa44b3f1dc9c38c3ca87d13a3f70`
- target：`git diff b7d438b7a37bfa44b3f1dc9c38c3ca87d13a3f70`
- round：1
- reviewed_at：2026-07-22 15:10 UTC+8

## Findings

### t042_test_f001 - AC #3（无订阅/句柄泄漏）验证过弱：仅断言 not.toThrow，未验证 unsub

- 严重度：important
- 位置：`tests/integration/local-api/server.test.ts:308-318`（用例 `updateState after client disconnect does not crash`）
- 问题：AC #3 显式要求「SSE 连接关闭（客户端断开）时正确 unsub，无订阅/句柄泄漏」。该用例仅断言 `expect(() => { runtime_store.updateState(...) }).not.toThrow()`，属「存在即通过 / 弱化断言」——执行动作不抛异常即 PASS，未验证 AC 要求的实际结果（订阅被移除、无累积泄漏）。
    - 实现层 `handle_sse`（`src/main/core/local-api/server.ts:438-444`）的 `onStateChange` 回调内已有 `if (res.destroyed || res.writableEnded) return;` 早返，因此即使 `cleanup` 从未被调用（即 unsub 泄漏），`updateState` 也不会抛错——写入被 guard 吞掉。当前测试在这种泄漏实现下仍然 PASS。
    - 也就是说：测试无法区分「正确 unsub」与「泄漏但被 res.destroyed 静默吞掉」两种行为，未提供 AC #3 所要求的证据。
    - 测试名「does not crash」也只承诺不崩，不承诺 AC 行为。
- 建议：最小修复方向——替换或补强断言以观察「断开后 listener 不再持有」这一可观测结果。可行做法之一：
    1. 用一个包裹 `runtime_store` 的 spy（计数 `subscribe` 返回的 unsub 是否被调用），断言 `unsub` 在连接关闭后被调用一次；或
    2. 让 SSE handler 在 `cleanup` 中显式标记（如写一个测试可观察的 hook），测试检查该标记；或
    3. 至少在 close 触发后再做一次 `updateState`，并断言已关闭连接的 `res.write` 没有再被调用（通过 spy `res.write` / 计数写入次数）。
    - 注意：当前 50ms `setTimeout` 等待只能算防御性 wait，不构成对 unsub 的验证；无论是否等到 close 事件，`updateState` 都不抛。

## 结论

- 本轮新发现：1 条
- 范围外观察（不进 finding 表）：
    - AC #1 / #4 的覆盖走「集成（server.test.ts 真实 HTTP）+ 单元（usageboard-web.test.ts 用 FakeEventSource）」分层。单测在边界 mock 浏览器 `EventSource` 属合法边界 mock，未 mock 被测逻辑本身；分层组合可证明端到端路径，未达危险模式。如后续有 jsdom 级 e2e 想做更强覆盖属改进项，非本 task 阻塞点。
    - `tests/unit/web/usageboard-web.test.ts:59-77` 的单测只触发 message 分支并断言 `received.toEqual([["inst-1", { status: "idle" }]])`，是真实行为断言，非恒真；未测 `onStateChange` 返回的 unsub 函数，但该 unsub 属 web bridge 内部清理，不属 AC #3 服务端 unsub 的核心范围，按 minor 观察留待后续。
    - `server.test.ts:293-306` 的单次 `reader.read()` 假设数据块未分片；本机单次 `res.write` 下通常成立，flaky 风险低，非 finding。
- 总体判断：AC #2 覆盖到位、AC #1/#4 通过分层测试可接受，但 AC #3「无订阅/句柄泄漏」的核心证据被 `not.toThrow()` 弱化，测试在「 unsub 逻辑失效但 res.destroyed guard 兜底」的场景下会静默 PASS，须补强才满足验收。

verdict: FAIL

---

## Round 2

- round：2
- reviewed_at：2026-07-22 15:40 UTC+8
- 复核范围：`git diff b7d438b7a37bfa44b3f1dc9c38c3ca87d13a3f70 -- tests/integration/local-api/server.test.ts tests/unit/web/usageboard-web.test.ts`

### t042_test_f001 复核（已修）

原「does not crash」用例已删除，替换为「SSE connection unsubscribes on client disconnect」。新用例用 `vi.spyOn(runtime_store, "subscribe")` 包裹真实 subscribe，记录 `subscribe_count` 与 `unsub_count`：

- 断开前断言 `subscribe_count >= 1` 且 `unsub_count === 0`：锁定订阅已建立、未被提前清理。
- `reader.cancel()` + 80ms 等待后断言 `unsub_count >= subscribe_count >= 1`：锁定每个订阅至少被清理一次。
- 若实现层缺失 cleanup（不调 unsub），`unsub_count` 留 0，断言 `0 >= 1` 失败 → 测试能抓泄漏。作者已手动验证（注释 cleanup 后用例失败，恢复后通过）。
- `>=` 而非 `==`：正确处理 `req.close` + `res.close` 双触发幂等与 undici 多连接可能；注释说明充分。
- spy 既计数又调真实 `unsub()`（移除 listener），真实清理与可观测代理同时成立；`mockRestore` + `beforeEach` 重建 `runtime_store` 隔离干净。
- 80ms 等待：本机 HTTP 下 `reader.cancel()` 触发 socket teardown，`close` 事件下一 tick 内触发，80ms 裕量足够，flaky 风险低。

结论：finding 已实质性修复，新测试直接锁定 AC#3 的可观测结果（订阅计数 + unsub 计数），并能区分「正确 unsub」与「泄漏被 res.destroyed guard 静默吞掉」两种行为。无 flaky 时序风险，断言锁死期望行为。

### 新发现

无。

verdict: PASS
