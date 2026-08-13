# Task review t341（reviewer_focus: 代码）

- task：`t341_preload_session_history_contract`
- spec：`docs/tasks/t341_preload_session_history_contract/spec.md`
- diff_anchor：`5a99de88d354110c7e6a17a986d75c0b80ecc169`
- target：`git diff 5a99de88d354110c7e6a17a986d75c0b80ecc169`
- round：1
- reviewed_at：2026-08-13 16:05 UTC+8

reviewed_scope: addada8a148aa413

## Findings

### t341_code_f001 - AC-002 只修了 session/agent 路由，usage/tray 路由的 open 仍恒抛 "Invalid IPC response"

- 严重度：important
- 锚点：AC-002（点击会话入口（open）不再产生 "Invalid IPC response" unhandled rejection）
- 位置：`src/preload/index.ts:305-306`（`session_history_open_only_methods.open`）
- 问题：本次只把 `session_history_full_methods.open`（session/agent 路由）改成裸 `ipcRenderer.invoke`，但 `session_history_open_only_methods.open`（usage/tray 路由）仍走 `invoke<undefined>`。main 侧 `SESSION_HISTORY_OPEN` handler（`src/main/index.ts:521-529`）是 fire-and-forget、无返回 → `invoke` 里 `is_ipc_result(undefined)` 为 false → 恒抛 `Error("Invalid IPC response")`。三个真实调用点都用 `void ...open(...)` 无 catch，形成 unhandled rejection：
    - `src/renderer/lib/panel-navigation.ts:19`「会话」tab 导航（主面板窗口 route=usage，见 `src/main/core/main-panel/main-panel-controller.ts:125`）
    - `src/renderer/views/PopupView.tsx:711`「打开会话历史」按钮
    - `src/renderer/views/TrayMenu.tsx:79`「会话面板」菜单（tray 窗口 route=tray，见 `src/main/index.ts:1078`）
    - 复验路径：route 映射 `src/preload/route_api.ts` `select_session_history_api` 对 `usage`/`tray` 返回 open_api；preload `current_route = window.location.hash.slice(1) || "usage"`。
- 建议：把 `session_history_open_only_methods.open` 与 full 一致改为裸 `await ipcRenderer.invoke(SESSION_HISTORY_OPEN, ...)`（非范围「disabled/open_only stub 重复」指 subscribe/query 等 noop 重复，不涵盖 open 本体，t341 修复 open 通道应覆盖全部真实调用面）。

### t341_code_f002 - 新文件导出零引用死代码 as_ipc_result

- 严重度：minor
- 锚点：代码质量·死代码（grep 零引用的导出）
- 位置：`src/shared/lib/ipc-envelope.ts:23`
- 问题：`as_ipc_result` 在本 task 新增导出，全仓 `grep -rn "as_ipc_result" src/ tests/` 仅命中定义处与内部调用，无任何消费点。新增共享层带一个无使用者的导出。
- 建议：删除该导出，或待有消费方再引入。

### t341_code_f003 - summaries 解包无 `{summaries}` 形状防御

- 严重度：minor
- 锚点：契约·类型（薄类型断言掩盖形状缺失）
- 位置：`src/preload/index.ts:267-274`
- 问题：`data.summaries` 直接返回。`invoke` 的类型断言 `raw.data as T` 只校验信封（`ok:true`），不校验 `data.summaries` 存在。若 main 返回 `ok({})` 或 `ok({summaries: undefined})`，则运行时返回 `undefined`，违反声明类型 `Promise<Readonly<Record<string, string>>>` 与 AC-001 非空要求。当前 main handler（`src/main/ipc/session-history-ipc.ts:337`）恒返回 `ok({ summaries })` 且 service.summaries 恒返回 Record，web 侧（`src/web/usageboard-web.ts:750-755`）同形，故为低概率防护缺口，非阻断。
- 建议：如需加固，`return data.summaries ?? {}`（或断言存在）。

### t341_code_f004 - preload 本地 is_ipc_result 成纯转发薄包装

- 严重度：minor
- 锚点：架构·可维护性（薄包装/转发型 helper）
- 位置：`src/preload/index.ts:57-61`
- 问题：把 `is_ipc_result` 移到共享层后，本地同名函数仅逐字转发 `ipc_envelope_is_ipc_result(val)`，纯中间层无附加逻辑。`invoke` 直接引用共享函数即可，多一层无收益的转发。
- 建议：删除本地包装，`invoke` 直接调用共享 `is_ipc_result`（或直接 `import { is_ipc_result }`）。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：4 条（1 important + 3 minor）
- 未进表的提示：
    - 文件过大：`src/preload/index.ts` 703 行，达实现源码 minor 阈值 400，本 task 净增约 +11 行（31+/20-）。历史性偏大，建议后续按模块拆分（sessionHistory/tokenStats/oauth 等）；本 task 未将其推向 important 阈值 800，不按缺陷出 finding。
    - 圈复杂度：改动函数均无新增分支（open/summaries 为线性 async 包装），无提示。
    - 范围外观察：无。
- 总体判断：AC-002 只覆盖了 session/agent 路由，usage/tray 路由的 open 仍恒抛 "Invalid IPC response"（未解决 important f001），修复不完整，FAIL。
- 系统性 follow-up：无（open_only.open 修复属于本 task 应覆盖范围，不应另立 task 甩给 t360）。

### AC 复验方式

- AC-001（summaries 解包与 web 一致、首条摘要非空）：`re_verified` —— 运行 `tests/unit/preload/session_history_contract.test.ts` 通过；preload 返回 `data.summaries`，与 web 侧 `src/web/usageboard-web.ts:750-755` 同形；service.summaries 恒返回 `Record<string,string>`。
- AC-002（open 不再产生 Invalid IPC response）：`re_verified`（静态）—— full 方法路径：`tests/unit/preload/session_history_contract.test.ts` 第二用例通过（mock invoke resolve undefined 不抛）；usage/tray 路径：代码追踪确认 `session_history_open_only_methods.open` 仍 `invoke<undefined>` + main open handler 无返回 → 恒抛。AC 未整体达成。
- AC-003（is_ipc_result 三种形状测试覆盖）：`re_verified` —— 运行 `tests/unit/shared/ipc_envelope.test.ts` 通过，覆盖 undefined/非对象/合法 ok/合法 error/error 形状非法；共享实现与原 preload 内联实现逐字一致，行为未漂移。

coverage = 3 / 3

verdict: FAIL

## Round 2 (2026-08-13 16:10 UTC+8)

reviewed_scope: 7ad1ea44e6eafc2e

### 前轮 finding 复核（以 `git diff 5a99de88d354110c7e6a17a986d75c0b80ecc169` 为准）

- **t341_code_f001（important）—— 已消除**。`session_history_open_only_methods.open`（`src/preload/index.ts:305-309`）已与 full 档一致改为裸 `await ipcRenderer.invoke`，不再经 `invoke` 的 IpcResult 信封校验。`src/preload/route_api.ts` 对 `usage`/`tray` 路由返回 open_api，全部真实 SESSION_HISTORY_OPEN 调用点（panel-navigation.ts:19 / PopupView.tsx:711 / TrayMenu.tsx:79 / TokenStatsView.tsx:1060,1070 / SessionLibrary.tsx:353,553）现均走裸 invoke。测试 `"usage/tray 路由 open_only 档 open 同样不抛 Invalid IPC response"`（`tests/unit/preload/session_history_contract.test.ts:63-78`）以 hash=usage 触达 open_only 档并断言不抛 + invoke 收到 channel/payload，re_verified（该文件通过）。
- **t341_code_f002（minor）—— 已消除**。`as_ipc_result` 死导出已删，`src/shared/lib/ipc-envelope.ts` 现仅含 `is_ipc_result`（18 行）；`grep -rn "as_ipc_result" src/ tests/` 零命中。
- **t341_code_f003（minor）—— 未修复（撤销，理由合理）**。`summaries` 维持 `return data.summaries` 直接解包。implementer 处置：尝试 `?? {}` 回退与 `no-unnecessary-condition`（TS 已窄化 `data.summaries` 恒在）冲突，撤销。main handler 恒 `ok({summaries})` 且 service.summaries 恒返回 Record，防御缺口低概率，不阻断。处置表 status 标「已修」实为「撤销」，属标注不严谨，不影响判定。
- **t341_code_f004（minor）—— 未处置（未进处置表）**。`src/preload/index.ts:57-61` 本地 `is_ipc_result` 仍为纯转发薄包装，逐字委托 `ipc_envelope_is_ipc_result`。处置表 Round 1 未登记此条（process 缺漏）。非阻断，仍须按规则由 implementer 补录进处置表。

### 本轮新发现

0 条。Round 1 已用至 f004 编号，若本轮有新增本应自 f005 续编；复查后无新问题。

### 未进表的提示

- 文件过大 / 圈复杂度：同 Round 1 结论（preload/index.ts 703 行达 minor 阈值但未超 important，本 task 净增有限；改动函数无新增分支），维持提示不重复出 finding。
- 范围外观察：无。

### 总体判断

Round 1 唯一 important（f001）已消除并被新测试覆盖；f003 撤销理由合理、f004 为 minor 均不阻断。当前无未解决 critical / important → PASS。遗留 process 缺漏：f004 未入处置表，需 implementer 补录。

### AC 复验披露

- AC-001（summaries 解包与 web 一致、首条摘要非空）：`re_verified` —— `tests/unit/preload/session_history_contract.test.ts` 通过；preload 返回 `data.summaries`，与 web 侧同形；service.summaries 恒返回 Record。
- AC-002（open 不再产生 Invalid IPC response）：`re_verified` —— 全路由覆盖：full 档（session/agent）+ open_only 档（usage/tray）均裸 invoke；新测试以 hash=usage 触达 open_only 档通过；main `SESSION_HISTORY_OPEN` handler（src/main/index.ts:521-529）无返回，裸 invoke 不再抛信封校验错。
- AC-003（is_ipc_result 三种形状测试覆盖）：`re_verified` —— `tests/unit/shared/ipc_envelope.test.ts` 通过，覆盖 undefined/非对象/合法 ok/合法 error/error 形状非法。

coverage = 3 / 3

verdict: PASS
