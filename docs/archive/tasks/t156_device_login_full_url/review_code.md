# Task review t156（reviewer_focus: 代码）

- task：`t156_device_login_full_url`
- spec：`docs\tasks\t156_device_login_full_url/spec.md`
- diff_anchor：`6dd0c8a4427eb630bb6ed75e0ff3a7ba21a44e31`
- target：`git diff 6dd0c8a4427eb630bb6ed75e0ff3a7ba21a44e31`
- round：1/2
- reviewed_at：2026-07-27 04:05 UTC+08:00

## Findings

### t156_code_f001 - 「输入代码」兜底行被无条件移除

- 严重度：minor
- 位置：`src/renderer/components/GrokLoginSection.tsx:90-103`、`src/renderer/components/forms/OAuthDeviceForm.tsx:100-113`
- 问题：spec 范围条款要求「完整地址可用时，移除『输入代码』行；完整地址不可用（拿不到 user_code 的异常情况）保留该行作兜底」。当前实现直接删除了这行 `<p className="ad-hint">输入代码：<code>{device_code.user_code}</code></p>`，没有条件判断。正常流程下 `build_device_login_url` 总能构造出带 `user_code` 的完整地址，因此 AC1 可通过；但如果出现 `user_code` 为空/缺失的异常（类型系统允许空串，主进程校验只检查 `typeof string`），用户将完全看不到任何设备码提示，违反 spec 的兜底要求。单元测试也仅在完整地址分支断言 `queryByText(/输入代码/)` 不存在，未覆盖该兜底分支。
- 建议：将「输入代码」行改成条件渲染，例如当 `!device_code.user_code` 或 `build_device_login_url` 结果未真正包含非空 `user_code` 时显示，并补充对应分支的组件测试。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：1 条
- 总体判断：实现干净、新增 helper 与 `setWindowOpenHandler` 逻辑正确，相关单元测试（`window_manager.test.ts`、`grok-login-section.test.tsx`、`oauth_device_form.test.tsx`）均通过；但「输入代码」兜底行未按 spec 保留条件分支，需处置后重审。

verdict: FAIL

## Round 2 (2026-07-27 04:11 UTC+8)

## Findings

（无）

## 结论

- 前轮 finding 复核（Round 2 才写）：
    - **t156_code_f001 - 已修**：`src/renderer/components/GrokLoginSection.tsx:92-108` 与 `src/renderer/components/forms/OAuthDeviceForm.tsx:102-118` 已将「输入代码」兜底行改为条件渲染。当 `device_code.user_code` 为空时渲染兜底行，非空时渲染带完整授权地址的链接，符合 spec「完整地址不可得时保留兜底行」的要求。
- 本轮新发现：0 条
- 总体判断：Round 1 的 minor finding 已按建议修复，新增 `build_device_login_url` 辅助函数与 `setWindowOpenHandler` 实现正确，相关单元测试全部通过，无新引入问题。

verdict: PASS
