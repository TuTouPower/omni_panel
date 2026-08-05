# Task review t219（reviewer_focus: 测试）

- task：`t219_session_history_per_subscriber_push`
- spec：`docs/tasks/t219_session_history_per_subscriber_push/spec.md`
- diff_anchor：`6a5c5ebf80c3e6b43345ef32a5be48aeca08f96b`
- target：`git diff 6a5c5ebf80c3e6b43345ef32a5be48aeca08f96b`
- round：1
- reviewed_at：2026-08-05 23:07 UTC+8

## Findings

### t219_test_f001 - 每订阅方注销的「最后一个订阅方 → 停 watcher」分支未直接测（AC-3 无残留句柄）

- 严重度：minor
- 锚点：AC-3「订阅方窗口关闭后，该订阅不再向其推送（无残留句柄 / 无泄漏）」——可观察行为已测，句柄释放分支缺一角
- 位置：`tests/unit/main/core/session-history/subscription-service.test.ts:328`（「指定 subscriber_id 注销只移除该订阅方」）
- 问题：该测试注销 `win-a` 后留有 `win-b`，走 `subscribers.delete(id)` 后 `size > 0 → return` 早退分支。而 `delete` 后 `size === 0` 的 fall-through（`watcher?.stop()` + `subscriptions.delete(key)`，`subscription-service.ts:324-331` 新代码分支）——多订阅方世界下最后一个订阅方离开时的句柄释放路径——从未被真实触发。既有 legacy 用例（`unsubscribe` 不带 id）虽覆盖 stop+delete 逻辑本身，但经「带 id 注销最后一位」进入该分支的组合未测；若该 fall-through 被破坏（例如忘删 key），watcher 持续轮询的泄漏在单测中不会显形。
- 建议：在「指定 subscriber_id 注销」用例后追加一步——再 `unsubscribe(..., "win-b")`（同 loc 最后一位），随后追加文件、固定时长负向断言无推送（沿用既有 300ms 负向断言模式），同时断言 loc 已从订阅表移除（若有只读 getter）或至少无推送。

### t219_test_f002 - SUBSCRIBE on_update 的 `event.sender.isDestroyed()` 守卫分支未测

- 严重度：minor
- 锚点：行为缺陷类——向已销毁 webContents 调用 `send` 在 Electron 会抛 "Object has been destroyed"
- 位置：`src/main/ipc/session-history-ipc.ts:74`；`tests/unit/ipc/session-history-ipc.test.ts` 全部 IPC 用例
- 问题：`on_update` 闭包含 `if (!event.sender.isDestroyed())` 守卫，防止销毁竞态下向死 webContents 发送。所有 IPC 测试的 sender mock `isDestroyed` 恒返回 `false`，只覆盖发送路径；守卫为真（跳过发送）的路径零覆盖。AC-3 主机制（destroyed 监听注销订阅）已测，该守卫属竞态窗口的防御分支，风险低。
- 建议：补一个 sender `isDestroyed: () => true` 的 SUBSCRIBE 用例，触发 `on_update` 断言 `send` 未被调用。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：无「迁就实现」改测。两处既有测试改动均对应 t219 规格语义变更，非实现驱动：
    1. 「SUBSCRIBE on_update 回调把增量推到历史窗口」改为「推到发起订阅的窗口」——t219 核心路由变更（AC-1：推送只发订阅方窗口），`history_window_controller` 从 IPC deps 移除与生产一致，断言目标与 spec 上下文区「推送目标窗口与订阅方一致（event.sender）」一致；断言强度未弱化（`toHaveBeenCalledWith` 同通道同 payload）。
    2. UNSUBSCRIBE 断言增加第 4 参 `"1"`——新行为「只注销调用方窗口的订阅」（`session-history-ipc.ts:96`），与 spec 上下文区断言目标一致。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 负向断言沿用固定 300ms sleep（≈10 个 30ms 轮询周期），为 t210 既有模式且有注释归因；新「指定 subscriber_id 注销」用例的构造使 bug 会在 `wait_for(received_b)` 期间已显形，300ms 仅缓冲，无 flaky 风险。
    - 真实多窗口 Electron 行为属上下文区「有意不测」（单测 mock window 身份即可），不出 finding。
    - `service` 在 IPC 层被 mock 属注入依赖隔离，路由闭包（on_update 捕获 event.sender）是真实生产代码并被直接断言，未 mock 被测逻辑。
- 总体判断：29 tests（IPC 11 + subscription-service 18）实跑全绿，触达真实轮询路径与 IPC 路由闭包；AC-1/2/3/4 均有对应测试且断言用户可观察；仅 2 条 minor 覆盖扩展，不阻断。
- 系统性 follow-up：无

verdict: PASS
