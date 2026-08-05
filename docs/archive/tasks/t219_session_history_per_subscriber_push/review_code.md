# Task review t219（reviewer_focus: 代码）

- task：`t219_session_history_per_subscriber_push`
- spec：`docs/tasks/t219_session_history_per_subscriber_push/spec.md`
- diff_anchor：`6a5c5ebf80c3e6b43345ef32a5be48aeca08f96b`
- target：`git diff 6a5c5ebf80c3e6b43345ef32a5be48aeca08f96b`
- round：1
- reviewed_at：2026-08-05 23:10 UTC+8

## Findings

### t219_code_f001 - 多订阅方 fan-out 循环缺单订阅方错误隔离

- 严重度：minor
- 锚点：行为缺陷——某订阅方 on_update 抛错时，其余订阅方漏掉本次增量
- 位置：`src/main/core/session-history/subscription-service.ts:307-309`（`handle_change` 内 fan-out 循环）
- 问题：`for (const entry of sub.subscribers.values()) { entry.on_update(result.messages); }` 整体处于外层 try/catch（311-313 行）。若任一订阅方回调抛错：循环提前终止，后续订阅方收不到本次增量，且 catch 记 `extract failed for ...`——该日志描述与真实失败点（订阅方回调）不符。t219 引入多订阅方后，单个失败回调会剥夺其余窗口的推送；单订阅时代不存在此问题。当前生产唯一 on_update 是 IPC 闭包（`isDestroyed()` 守卫 + 可序列化 payload），实践中不抛，故为防御性缺口而非当前可观测故障。
- 建议：fan-out 循环内逐订阅方 try/catch（或由 IPC 层 on_update 自行吞掉 send 异常），避免一个订阅方拖垮其余推送。

## 结论

- 前轮 finding 复核：本轮无
- 本轮新发现：1 条 minor
- 未进表的提示：
    - 文件过大（降级规则，不进 finding 表）：
        - `src/main/core/session-history/subscription-service.ts`：414 行，超实现源码 minor 阈值（400），本 task 净增 ~40 行；未见不可拆硬约束，建议后续拆分
        - `tests/unit/main/core/session-history/subscription-service.test.ts`：775 行，超测试 minor 阈值（600），本 task 净增 ~107 行
        - `src/main/index.ts`：1070 行，超 important 阈值（800）但为历史存量，本 task 净减（-11 行），不按本 task 增长出 finding
    - 复杂度：触达函数 CC 均 ≤ 4（subscribe/unsubscribe/handle_change），无需提示
    - 范围外观察：`handle_change` 将同一 `result.messages` 数组引用传给全部订阅方；当前无订阅方改写数组（服务测试均拷贝），仅属共享可变引用隐患，不构成 finding
    - 范围外观察：`unsubscribe` 不带 id 形态移除该 loc 全部订阅方（legacy 语义，docstring 已写明）；生产无调用方使用该形态，仅测试使用
- 总体判断：AC-1 至 AC-4 均有实现与测试锁定；多窗口路由（sender 身份 → 各自 on_update）、窗口销毁注销（`webContents.destroyed` → per-subscriber unsubscribe）、legacy fallback（`__legacy__` 缺省 id）与 main/index.ts 移除历史窗口关闭全局清空均正确；唯一 finding 为防御性 minor，无未解决 critical / important
- 系统性 follow-up：无

verdict: PASS
