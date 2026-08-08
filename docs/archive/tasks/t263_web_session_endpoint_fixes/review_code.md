# Task review t263（reviewer_focus: 代码）

- task：`t263_web_session_endpoint_fixes`
- spec：`docs/tasks/t263_web_session_endpoint_fixes/spec.md`
- diff_anchor：`bcff81e97e56dd5b93183c27d937f2d2c48d9b59`
- target：`git diff bcff81e97e56dd5b93183c27d937f2d2c48d9b59`
- round：1
- reviewed_at：2026-08-08 14:25 UTC+8

## Findings

### t263_code_f001 - web shim open 写入的 URL loc 参数从不清理，会话面板再次挂载时重开目标会话

- 严重度：minor
- 锚点：行为缺陷。AC1/AC2 未覆盖的副作用：loc 残留 URL search 后，任何一次非 open 入口的面板挂载都会重读 `initial_loc()` 重新打开旧目标。
- 位置：`src/web/usageboard-web.ts:385-392`（写入）；消费方 `src/renderer/components/workspace/use-workspace-columns.ts:335-336` + `src/renderer/components/workspace/workspace-view-helpers.ts:26-42`（只读不清理）
- 问题：`open()` 用 `history.replaceState` 把 loc 写进 URL search，全链路无任何清理点（`grep searchParams.delete|replaceState` 仅此一处）。复现路径：跨面板打开会话 A（URL 变 `?loc=A#history`，面板定位 A）→ 切到 usage 路由（SessionShell 卸载）→ 经侧栏再切回 history（非 `open()` 入口），SessionShell 重挂载，`initial_loc()` 读到残留 `?loc=A`，再次 `open_session(A)`。t263 前该入口打开空白面板；桌面 `route_query` 是窗口加载一次性注入，无此残留语义。`open("","","")`（纯面板互跳，如 TrayMenu/PopupView/panel-navigation）只不写、不清旧值，残留进一步固化。与「初始位置」的一次性语义不符。
- 建议：消费 `initial_loc()` 后即从 URL 移除该参数（`history.replaceState` 删除 `loc`），或将 open 定位语义明确为一次性并在挂载后清理。

### t263_code_f002 - web shim query 注释与 AC3 新服务端行为矛盾

- 严重度：minor
- 锚点：AC3 本 diff 已删 id-only 全量枚举回退，注释滞后，误导后续维护。
- 位置：`src/web/usageboard-web.ts:408-409`（对照 `src/main/core/local-api/server.ts:252-255` 新 400 分支）
- 问题：`query` 方法注释仍写「缺省回退 sessions_provider 反查，避免歧义」，而本 diff 已把该回退删成缺 source/env 直接 400。注释描述的行为已被本 diff 移除，属 AC3 清理不彻底残留。
- 建议：同步注释为「缺 source/env 服务端返回 400」。

### t263_code_f003 - 服务端 searchContentWithAbort 鸭子类型冗余，取消能力静默 fail-open

- 严重度：minor
- 锚点：代码质量/简化（无 AC 违约）。
- 位置：`src/main/core/local-api/server.ts:362-375`
- 问题：`deps.service` 具体类型为 `SessionHistorySubscriptionService`（`src/main/core/session-history/subscription-service.ts:655` 已公开声明 `searchContentWithAbort`），`as unknown as { searchContentWithAbort?: ... }` 鸭子类型转换冗余，类型安全直调 `deps.service.searchContentWithAbort(...)` 即可。fallback 分支 `deps.service.searchContent(resolved_locs, request.keyword)` 不带 abortSignal：一旦注入缺该方法的服务，AC4 取消能力无任何提示地降级（生产服务恒有该方法，此分支为死路径）。
- 建议：直接调用 `deps.service.searchContentWithAbort(...)`；若须保留对无该方法服务的兼容，缺方法时显式告警而非静默忽略 signal。

## 结论

- 前轮 finding 复核（Round 1，无）：无
- 本轮新发现：3 条（均为 minor）
- 未进表的提示：
    - 文件过大（已达阈值且本 task 净增，但未直接致缺陷，仅提示）：`src/main/core/local-api/server.ts` 1057 行（净 +13，达 important 阈值 800）；`src/web/usageboard-web.ts` 501 行（净 +26）；`src/shared/types/ipc.ts` 633 行（净 +2）；`src/preload/index.ts` 695 行（净 +4）；`src/renderer/components/session-library/SessionLibrary.tsx` 539 行（净 +4）；测试 `tests/integration/local-api/server.test.ts` 1177 行（净 +61）、`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 1021 行（净 +5）。
    - 复杂度：`handle_session_history_search_content`（server.ts:297-392）手算 CC≈11（本 task 净增约 2 分支），达 ≥10 结论提示线、未达 ≥15 finding 线，未阻断。
    - 范围外观察：preload `_signal` 参数被显式忽略（src/preload/index.ts:236-240）——桌面 IPC 搜索路径取消属 spec 非范围，符合预期，且现代形态 request 对象内嵌 keyword 未被误删，桌面无回归。
- 总体判断：AC1-AC5 实现正确（open 写 loc→initial_loc 定位；400 替换 id-only 回退且全量 query 恒透传；三层 signal 透传 + res close 断连 abort 经集成测试真实链路验证，经验证写死连接后 json_response 无 crash）；测试断言到位；typecheck 仅存量 3 处 TS4111（p088，非本 diff）。仅 3 个 minor，无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS
