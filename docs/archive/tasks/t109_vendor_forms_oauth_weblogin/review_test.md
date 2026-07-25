# Task review t109（reviewer_focus: 测试）

- task：`t109_vendor_forms_oauth_weblogin`
- spec：`docs\tasks\t109_vendor_forms_oauth_weblogin/spec.md`
- diff_anchor：`e55da266a006e3bb04f389148be7eb44ed509ebb`
- target：`git diff e55da266a006e3bb04f389148be7eb44ed509ebb`
- round: 3
- reviewed_at：2026-07-25 16:36 UTC+8

## Findings

无。

## 结论

- 本轮新发现：0 条
- 总体判断：新增单测与修改后的集成测试共同覆盖了 t109 的全部验收标准，未发现危险模式或测试可信度问题。

verdict: PASS

## Round 2 (2026-07-25 17:02 UTC+8)

### 前轮 finding 复核

Round 1 测试 reviewer 零 finding。

### 本轮新发现

### t109_test_f001 - 无必要弱化 await_completion 失败返回值断言

- 严重度：important
- 位置：`tests/unit/auth/grok_oauth_manager.test.ts:462`
- 问题：该断言从 `toEqual({ saved: false })` 改为 `toEqual(expect.objectContaining({ saved: false }))`。当前 `await_completion` 在取消/失败路径均返回 `{ saved: false }`（`src/main/core/auth/grok_oauth_manager.ts:329/335/367`），无额外字段；`objectContaining` 会降低对返回形状的约束，未来若实现意外携带 `token` 等字段也无法发现。diff 中未给出红灯归因或规格变化说明。
- 建议：恢复为精确相等 `toEqual({ saved: false })`，或在实现确实需要返回额外字段时显式写出期望对象。

### t109_test_f002 - OAuthDeviceForm 未覆盖 on_save rejection 的保存失败路径

- 严重度：important
- 位置：`tests/unit/renderer/components/forms/oauth_device_form.test.tsx`（缺少对应 it）
- 问题：AC3 要求“单测覆盖两个表单的渲染与保存逻辑”。`OAuthDeviceForm` 在 `handle_start` 中已捕获 `on_save` 异常并在 UI 显示错误（`src/renderer/components/forms/OAuthDeviceForm.tsx:37-39`），但测试文件只验证了轮询失败，未模拟 `on_save` reject。若该 catch 被误删或 `reset()/set_error()` 调用被改错，现有测试仍全绿，保存失败时的用户反馈路径失去回归保护。`WebLoginForm` 的同类路径已被测试覆盖（`web_login_form.test.tsx` 末条），形成覆盖不对称。
- 建议：新增一条 it，mock `login_poll` 成功但 `on_save` reject，断言错误文本出现在文档中且未调用保存成功逻辑。

## 结论

- 本轮新发现：2 条
- 总体判断：新增表单单测基本覆盖了 AC 的渲染与主保存路径，但存在一条危险模式弱化断言，以及 OAuthDeviceForm 保存失败路径未覆盖。

verdict: FAIL

## Round 3 (2026-07-25 17:18 UTC+8)

### 前轮 finding 复核

- `t109_test_f001`（弱化 await_completion 失败返回值断言）：已修。`tests/unit/auth/grok_oauth_manager.test.ts:462` 当前为 `await expect(login).resolves.toEqual({ saved: false });`，恢复为精确相等断言。
- `t109_test_f002`（OAuthDeviceForm 未覆盖 on_save rejection 保存失败路径）：已修。`tests/unit/renderer/components/forms/oauth_device_form.test.tsx` 新增 it「shows error when on_save rejects after polling succeeds」，模拟 `on_save` reject 并断言错误文本与「重新登录」按钮出现。

### 本轮新发现

无。

### 结论

- 本轮新发现：0 条
- 总体判断：前两轮 finding 均已修复；新增表单单测与 AddAccountDialog 集成测试共同覆盖 t109 全部验收标准，未发现新的危险模式、测试可信度或覆盖缺陷。

verdict: PASS
