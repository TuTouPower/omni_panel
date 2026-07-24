# Task review t098（reviewer_focus: 代码）

- task：`t098_opencode_go_add_dialog_web_login`
- spec：`docs/tasks/t098_opencode_go_add_dialog_web_login/spec.md`
- diff_anchor：`14f4212b8c79ee2ab12602955662878a81bfd1c5`
- target：`git diff 14f4212b8c79ee2ab12602955662878a81bfd1c5`
- round：1
- reviewed_at：2026-07-24 UTC+8

## Findings

### t098_code_f001 - wildcard 登录忽略同源完成路径

- 严重度：important
- 位置：`src/main/core/session/session-manager.ts:170`
- 问题：wildcard Cookie 仅在顶层页面离开并回到 `login_origin` 后接纳；若同源完成认证或已有登录态，Cookie 可能无法捕获。
- 建议：确认登录流程与匿名 session 的安全边界；若同源路径必须支持，补充明确完成条件。

### t098_code_f002 - 匿名 persistent partition 残留 Cookie

- 严重度：important
- 位置：`src/main/core/session/session-manager.ts:79`
- 问题：匿名登录曾使用 `persist:session-login:anonymous:<uuid>`，关闭后会保留认证 Cookie。
- 建议：匿名登录使用非持久 partition，或在关闭时清理存储。

## 结论

- 本轮新发现：2 条
- 总体判断：需处置 wildcard 状态边界与匿名 partition 生命周期。

verdict: FAIL

## Round 2 (2026-07-24 UTC+8)

### 前轮 finding 复核

- `t098_code_f001`：撤回。wildcard 的“顶层跨 origin 离开并回到登录 origin”是本 task 认可的安全前提；匿名 partition 不继承已有登录态，因此同源完成或已有登录态不是要求支持的路径。
- `t098_code_f002`：已修。匿名登录 partition 改为 `session-login:anonymous:<uuid>`，不带 `persist:` 前缀，不再写入持久 Cookie 存储。

### 本轮新发现

- 0 条。

## 结论

- 前轮 finding 复核：1 条撤回，1 条已修。
- 总体判断：实现符合匿名网页登录的安全边界与规格。

verdict: PASS
