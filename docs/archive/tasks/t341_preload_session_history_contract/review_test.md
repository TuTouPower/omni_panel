# Task review t341（reviewer_focus: 测试）

- task：`t341_preload_session_history_contract`
- spec：`docs/tasks/t341_preload_session_history_contract/spec.md`
- diff_anchor：`5a99de88d354110c7e6a17a986d75c0b80ecc169`
- target：`git diff 5a99de88d354110c7e6a17a986d75c0b80ecc169`
- round：1
- reviewed_at：2026-08-13 16:05 UTC+8

## Findings

### t341_test_f001 - AC-002 usage/tray 路由用例 mock 误用，未触达真实 open_only 实现（假覆盖）

- 严重度：critical
- 锚点：AC-002（点击会话入口（open）不再产生 "Invalid IPC response" unhandled rejection）
- 位置：`tests/unit/preload/session_history_contract.test.ts:63-107`（第 3 用例）；被测真实实现 `src/preload/index.ts:304-308`（`session_history_open_only_methods.open`）
- 问题：第 3 用例自称验证「usage/tray 路由 open_only 档 open 同样不抛 Invalid IPC response（AC-002 全路由）」，但只 import 了 `../../../src/preload/route_api`（第 66 行），从未 import 真实 preload（`../../../src/preload/index`）。它用 `vi.fn().mockResolvedValue(undefined)` 构造 `open_spy`（第 69 行）并塞进自造的 full/open_only/disabled 三档对象（第 70-102 行），再 `select_session_history_api("usage", ...)`（第 104 行）断言 mock resolve undefined + 参数透传（第 105-106 行）。该用例从未执行真实 `session_history_open_only_methods.open`；若该实现被改回破损的 `invoke<undefined>`（undefined 响应时 `is_ipc_result` false → 抛 "Invalid IPC response"），本用例依旧通过。对 AC-002 usage/tray 路由的覆盖是假覆盖。且 route 分权矩阵已有等价覆盖（`tests/unit/preload/route_api.test.ts:157-175` 已断言 usage/tray 路由 open resolve undefined + open_spy 参数），本用例未提供新验证。
- 证据：`electron_mock.ipcRenderer.invoke` 在第 3 用例中无任何使用；第 3 用例只测 mock 存在而非真实行为。
- 建议：仿照第 2 用例（session 路由），把 stub 改为 `hash: "#usage"` / `"#tray"` 后 `await import("../../../src/preload/index")`，取 `exposeInMainWorld.mock.calls[0]?.[1].sessionHistory.open`，设 `ipcRenderer.invoke.mockResolvedValue(undefined)` 后断言 `resolves.toBeUndefined()`，从而触达真实 open_only 实现；同时可删掉与 route_api.test.ts 重复的分权断言。

### t341_test_f002 - contract 测试未断言 IPC channel 与 payload 契约

- 严重度：minor
- 锚点：无直接 AC 违反；测试可信度增强项
- 位置：`tests/unit/preload/session_history_contract.test.ts:43-46`、`:60`
- 问题：文件以 contract 命名，但 AC-001/AC-002 两用例只断言返回值（解包结果 / resolve undefined），未 `toHaveBeenCalledWith` 校验通道名与参数形状（如 summaries 应带 `{ locs }` 载荷、open 应带 source/env/session_id）。若实现误传通道或载荷，测试仍通过。
- 建议：加 `expect(electron_mock.ipcRenderer.invoke).toHaveBeenCalledWith("sessionHistory:summaries", { locs: [...] })` 与 `("sessionHistory:open", "claude", "win", "s1")`。

## 结论

- 前轮 finding 复核：Round 1，无。
- 改测方向复核：无（本 diff 仅新增测试文件，未就地改既有测试预期）。
- 本轮新发现：2 条（1 critical + 1 minor）。
- 未进表的提示：
    - 工作区在本次审查期间发生变化：`git diff 5a99de88` 的 `src/preload/index.ts` 与 `tests/unit/preload/session_history_contract.test.ts` 在审查中由 31/62 行增至 37/108 行——`session_history_open_only_methods.open` 已同步改为裸 invoke（实现已修，code 侧 t341_code_f001 的静态结论现已过时），并新增第 3 用例。本报告基于变化后的当前 diff。
    - AC-001 第二子句「会话库首条消息摘要非空」无独立断言；由 preload 解包形状测试间接覆盖（`SessionLibrary.tsx:305` `result[k] ?? ""` 在 preload 返回 Record 后取到文本）。spec 测试策略限定 preload 形状测试，视为可接受，不阻断。
    - `src/shared/lib/ipc-envelope.ts:23` `as_ipc_result` 导出但无消费点，属代码层死代码（code reviewer 职责，非测试范围）。
- 总体判断：AC-001 / AC-003 测试真实可信；AC-002 session 路由测试真实触达实现；但 usage/tray 路由用例为 mock 误用，AC-002「全路由不抛」的测试覆盖是假覆盖，须改测触达真实 `open_only.open` 后再判通过。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified` — 重跑 `session_history_contract.test.ts` 第 1 用例通过；web 实现（`src/web/usageboard-web.ts:750-755`）与修复后 preload 同为 `return data.summaries`，断言形状即 web 语义（Record 非包装对象）。
- AC-002：`re_verified`（部分）— 重跑第 2 用例（session 路由）通过，真实触达 `session_history_full_methods.open` 裸 invoke 路径；第 3 用例（usage/tray）经核查为 mock 误用，未验证真实 `open_only.open`（静态确认该实现现为裸 invoke，实现已修但测试未真验证）。AC-002 测试覆盖不完整。
- AC-003：`re_verified` — 重跑 `ipc_envelope.test.ts` 4 用例通过，覆盖合法 ok/error、undefined/非对象/缺 ok、error 分支非法四种形状。

coverage = 3/3 re_verified

reviewed_scope: addada8a148aa413

verdict: FAIL

## Round 2 (2026-08-13 16:12 UTC+8)

### t341_test_f003 - AC-001 summaries 通道契约断言仍缺（f002 部分修复）

- 严重度：minor
- 锚点：AC-001（summaries 解包 + 通道契约）
- 位置：`tests/unit/preload/session_history_contract.test.ts:30-47`（第 1 用例）
- 问题：f002 处置只补了 open 通道断言（第 3 用例 79-84 行），AC-001 summaries 用例仍只断言返回值形状（`expect(result).toEqual(...)`），未 `toHaveBeenCalledWith("sessionHistory:summaries", { locs: [...] })` 校验通道名与 `{ locs }` 载荷。若实现误传通道名或载荷形状，该用例依旧通过。
- 建议：第 1 用例补 `expect(electron_mock.ipcRenderer.invoke).toHaveBeenCalledWith("sessionHistory:summaries", { locs: [{ source: "claude", env: "win", session_id: "s1" }] })`。

## 结论

- 前轮 finding 复核：
    - f001（critical）：已消除。第 3 用例重写后不再 import `route_api` / 自造 mock 对象，改为 `hash: "#usage"` stub → `await import("../../../src/preload/index")` → 从 `exposeInMainWorld.mock.calls[0]?.[1].sessionHistory` 取真实 `open_only.open` 实现（`src/preload/index.ts:305-309` 裸 `ipcRenderer.invoke`），`mockResolvedValue(undefined)` 下断言 `resolves.toBeUndefined()`。测试真实触达生产实现；重跑 3/3 通过。
    - f002（minor）：部分修复。open 通道 + payload 断言已补（`toHaveBeenCalledWith("sessionHistory:open", "claude", "win", "s1")`）；summaries 通道断言缺口见 f003。
- 改测方向复核：无（本 diff 未就地修改既有测试预期）。
- 本轮新发现：1 条（minor f003）。
- 未进表的提示：
    - `src/shared/lib/ipc-envelope.ts` 当前 18 行，已移除无消费点的 `as_ipc_result`（Round 1 提及的死代码已清理），`is_ipc_result` 形状测试（AC-003）保持 4/4 通过。
    - Round 1 审查期间发现的 `session_history_open_only_methods.open` 未修问题，本次 diff（`src/preload/index.ts:305-309`）已同步改为裸 invoke，AC-002 usage/tray 路由实现已修复，与测试对齐。
- 总体判断：AC-002 全路由测试已真实触达实现，前轮 critical 已消除；仅剩 summaries 通道断言 minor 缺口，不阻断。
- 系统性 follow-up：无。

### AC 复验方式（Round 2）

- AC-001：`re_verified` — 重跑第 1 用例通过；`src/web/usageboard-web.ts:750-755` 与 preload 修复后同为 `return data.summaries`，解包形状即 web 语义。通道契约断言缺（f003 minor）。
- AC-002：`re_verified` — 重跑第 2 用例（session 路由，真实 `full_methods.open` 裸 invoke）与第 3 用例（usage 路由，真实 `open_only.open` 裸 invoke）均通过，`toHaveBeenCalledWith` 校验通道与参数。实现侧 open_only 已修复。
- AC-003：`re_verified` — 重跑 `ipc_envelope.test.ts` 4 用例通过，形状覆盖不变。

coverage = 3/3 re_verified

reviewed_scope: 7ad1ea44e6eafc2e

verdict: PASS
