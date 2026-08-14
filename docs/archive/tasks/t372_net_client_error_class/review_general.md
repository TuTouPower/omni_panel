# Task review t372（reviewer_focus: 通用）

- task：`t372_net_client_error_class`
- spec：`docs/tasks/t372_net_client_error_class/spec.md`
- diff_anchor：`18586e50a915e182ff28c3992b21854452a098b5`
- target：`git diff 18586e50a915e182ff28c3992b21854452a098b5`
- round：1
- reviewed_at：2026-08-15 01:48 UTC+8

## Findings

### t372_gen_f001 - 错误路径字节计数取 content-length 声明值，声明与实际不符时计数失真（设计取舍，非缺陷）

- 严重度：minor
- 锚点：AC-002 实现语义——「长度从 content-length 头取」；非规范违反
- 位置：`src/main/core/connector/net-client.ts:334-336`（destroy 分支）、`:339`（read 分支 `declared_bytes ?? Buffer.byteLength(error_body)`）
- 问题：destroy 分支的计数直接取 content-length 声明值。服务器声明超限但实际只发小 body 时（新测试 1 场景），错误消息报声明值（如 3145728 bytes），与实际到达字节不符。read 分支同理，`declared_bytes ≤ cap` 时优先取声明值而非实际读取字节；content-length: 0 伴随实际 body 的边缘场景会报 "0 bytes"。均不影响 HTTP 状态语义与 is_auth_error 分类（消息仍含状态码），且与 spec「长度从 content-length 头取」的设计意图一致。
- 建议：无需修复；如需更贴实际可改取实际字节，但会破坏「不读 body 只取头」的目标，维持现状即可。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（minor，设计取舍）
- 未进表的提示：
  - AC-001 未在本 diff 内实现，由 t371 的 abort reason（`net-client.ts:224` `HTTP request timed out after ...ms`）提供；既有测试 `tests/integration/connector/net-client.test.ts:589` 断言 `/timed? out/i`，与 runtime.ts `is_timeout_error`（`/timed? out|.../i`）兼容，覆盖充分，非覆盖缺口。
  - destroy 路径关闭连接不入 keep-alive 池，大量超大 4xx 场景有连接抖动，属「不读 body」的固有代价，非回归。
  - 错误消息格式 `HTTP {status}: request failed ({n} bytes)` 未变，`is_auth_error` 依赖的 401/403 子串保留，分类兼容。
- 总体判断：实现正确，两 AC 均满足且有可观察行为断言覆盖；未解决 important/critical 0 条，可 PASS。
- 系统性 follow-up：无

## 撤回记录

- 撤回编号：t372_gen_f001（错误路径字节计数取 content-length 声明值，声明与实际不符时计数失真）
- 撤回原因：经复核判定为设计取舍误报，非缺陷。计数取 content-length 声明值正是 AC-002「长度从 content-length 头取、不读 body」的设计意图本身，行为符合 spec 契约区范围与风险回退约定，不构成对 AC 的违反。处置三态中归「撤回」，无需登记 follow-up（fix_ref 不适用）。
- 撤回后结论：f001 不计入 finding 清单；verdict 保持 PASS。

verdict: PASS

reviewed_scope: 29327e1d1e14ab99
