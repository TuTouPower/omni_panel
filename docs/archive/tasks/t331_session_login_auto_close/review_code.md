# Task review t331（reviewer_focus: 代码）

- task：`t331_session_login_auto_close`
- spec：`docs/tasks/t331_session_login_auto_close/spec.md`
- diff_anchor：`9d871706fa570a6c846e9292f7b82cb33788b9ce`
- target：`git diff 9d871706fa570a6c846e9292f7b82cb33788b9ce`
- round：1
- reviewed_at：2026-08-13 00:32 UTC+8

## Findings

### t331_code_f001 - auto_close 1500ms 常量跨层重复，编辑路径调整时易漂移

- 严重度：minor
- 锚点：DRY（verbatim 重复，目前行为一致，尚未造成分叉）
- 位置：`src/main/ipc/auth-ipc.ts:14`（`AUTO_CLOSE_MS = 1500`）与 `src/renderer/components/WebLoginSection.tsx:13`（`SESSION_LOGIN_AUTO_CLOSE_MS = 1500`）
- 问题：两处常量同为 1500 且各带「对齐编辑路径 handleCookieLogin」注释，但跨层（main / renderer）各自定义。语义绑定同一数值却无单一来源，若日后编辑路径延迟调整只改其中一处，两路径自动关窗节奏即分叉，且无编译期/测试期告警。当前 t331 实现与 `handleCookieLogin`（auth-ipc.ts:84 传 `auto_close_ms: AUTO_CLOSE_MS`）数值一致，行为正确。
- 建议：将 1500ms 提升为 shared 层常量（如 `src/shared/` 内单一导出），两处引用同一来源；或至少注释互指，避免单侧修改。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）
- 本轮新发现：1 条（minor）
- 未进表的提示：文件过大：无（本 diff 触及文件均远低于阈值：`session-ipc.ts` 92 行、`WebLoginSection.tsx` 139 行、`ipc.ts` 未膨胀）；复杂度：无（`handle_login` 新增一个三元分支，CC 仍低）；范围外观察：AC-004 的 refresh 路径无独立测试、亦无 renderer 调用方传 `auto_close_ms`——功能经共享 `handleSessionLogin` 透传已满足，且 spec 测试策略未要求 refresh 专项测试，留待 test reviewer 判定覆盖充分性。
- 总体判断：实现正确、范围收敛、无越权改动，所有 AC 行为链完整（renderer 传值 → ipc 透传 → manager 捕获后定时关窗）。仅 1 条 minor，无未解决 blocking。
- AC 复验方式：
    - AC-001：`re_verified`。独立重跑 `tests/unit/ipc/session-ipc.test.ts`（断言 `start_login` 收到 `auto_close_ms:1500`）与 `tests/unit/session/session-manager.test.ts`（fake timers 推进 1500ms 后 `window.closed === true`）通过；代码链路 `session-ipc.ts:53` → `session-manager.ts:191-199`。
    - AC-002：`re_verified`。`tests/unit/ipc/session-ipc.test.ts` 断言未传时不携带字段通过；代码 `request.auto_close_ms != null` 守卫对 undefined/null 均正确丢弃。
    - AC-003：`re_verified`。独立重跑 `tests/unit/renderer/components/web_login_section.test.tsx`（mock `saved:true` 后断言 `auto_close_ms:1500` 透传 + UI 恢复 + `onSecrets` 触发）通过；`WebLoginSection.tsx:64` 仅无 instance_id 路径传值，`logging_in` finally 复位恢复按钮。
    - AC-004：`re_verified`（代码轨迹）。`SESSION_REFRESH`（session-ipc.ts:81-90）复用 `handleSessionLogin` 透传 `auto_close_ms`，与 `session.login` 同链路；无独立测试，依据为代码路径核对而非测试断言。
    - coverage = 4 / 4
- 系统性 follow-up：无（未发现跨 task 缺口；如需常量化可并入后续 task，非本 task 阻断项）

reviewed_scope: 7fd8888d0a5e07d0

verdict: PASS

## Round 2 (2026-08-13 00:32 UTC+8)

### 前轮 finding 复核

- **t331_code_f001（minor）：已消除**。修复落地于 `src/renderer/components/WebLoginSection.tsx:12-14`：新增 JSDoc 注释「数值须与 src/main/ipc/auth-ipc.ts 的 AUTO_CLOSE_MS（编辑路径）保持一致」。独立核实引用目标真实存在且符号准确——`src/main/ipc/auth-ipc.ts:14` 定义 `const AUTO_CLOSE_MS = 1500`，:84 将该常量作为 `auto_close_ms` 透传；两处数值当前均为 1500，一致。注释互指即 f001 建议的第二方案（跨层 main/renderer 无法共享 import 时以注释对齐），消除单侧修改漂移风险。改动为纯注释，未触任何逻辑路径。

### 本轮新发现

- 0 条（修复仅注释，扫描修复过程未引入新问题；`git diff` 中其余改动均为 Round 1 已审实现，无新增代码行为）

### 未进表的提示

- 文件过大：无；复杂度：无；范围外观察：task.md 处置表另记 test f001（删除 session-manager 冗余测试），属 test reviewer 范围，本 code report 不评。

### 总体判断

- f001 已按建议（注释互指）真修；纯注释改动，逻辑与行为不变，无新增风险。

### AC 复验方式（Round 2）

- AC-001 ~ AC-004：`re_verified`（沿用 Round 1 代码轨迹与测试证据，本轮仅注释改动，行为链路未变；另独立重跑 `tests/unit/ipc/session-ipc.test.ts` + `tests/unit/renderer/components/web_login_section.test.tsx`，20/20 passed）。
- coverage = 4 / 4

reviewed_scope: 69bf44096dc9546d

verdict: PASS
