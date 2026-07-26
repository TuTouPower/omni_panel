# Task review t156（reviewer_focus: 测试）

- task：`t156_device_login_full_url`
- spec：`docs\tasks\t156_device_login_full_url/spec.md`
- diff_anchor：`6dd0c8a4427eb630bb6ed75e0ff3a7ba21a44e31`
- target：`git diff 6dd0c8a4427eb630bb6ed75e0ff3a7ba21a44e31`
- round：1/2
- reviewed_at：2026-07-27 04:05 UTC+8

## Findings

### t156_test_f001 - 兜底分支未断言「输入代码」行已隐藏

- 严重度：important
- 位置：`tests/unit/renderer/components/forms/oauth_device_form.test.tsx:113-135` 与 `tests/unit/renderer/components/grok-login-section.test.tsx:81-94`
- 问题：spec 验收标准明确要求「完整地址可得时」无「输入代码」行。`verification_uri_complete` 缺失的兜底分支会通过 `build_device_login_url` 拼接出带 `user_code` 的完整地址，因此该分支同样属于「完整地址可得」，应当隐藏「输入代码」行。但两个兜底测试仅断言链接文本与 `href` 正确，未断言 `expect(screen.queryByText(/输入代码/)).not.toBeInTheDocument()`。若未来重构只在兜底分支错误地保留「输入代码」行，当前测试仍会全部通过。
- 建议：在上述两个兜底测试末尾补充 `expect(screen.queryByText(/输入代码/)).not.toBeInTheDocument()`，与完整 URI 分支的断言保持一致。

## 结论

- 前轮 finding 复核（Round 2 才写）：无
- 本轮新发现：1 条
- 总体判断：本轮测试整体可信，断言以用户可见的链接文本/.href/文案缺失为主，mock 边界合理（Electron、`window.usageboard`），无危险模式命中。但兜底分支遗漏了验收标准中「无输入代码行」的断言，导致该 AC 在两条分支中只被验证了一条。

verdict: FAIL

## Round 2 (2026-07-26 20:09 UTC+8)

## Findings

（无）

## 结论

- 前轮 finding 复核（Round 2 才写）：
    - `t156_test_f001`（important）：已修。`tests/unit/renderer/components/forms/oauth_device_form.test.tsx` 中 "constructs a complete URL from verification_uri when the server omits verification_uri_complete (t156)" 与 `tests/unit/renderer/components/grok-login-section.test.tsx` 中 "constructs a complete URL from verification_uri when no complete URL is returned (t156)" 均在兜底分支末尾追加 `expect(screen.queryByText(/输入代码/)).not.toBeInTheDocument()`，与完整 URI 分支断言一致；同时新增 user_code 为空时显示输入代码行的测试，覆盖兜底展示分支。
- 本轮新发现：0 条
- 总体判断：本轮测试改动充分修复了 Round 1 遗漏断言，新增兜底展示与空 user_code 测试，窗口管理器测试覆盖 http(s) 外链系统浏览器打开及非 http(s) 拦截。无新危险模式命中，测试可信。

verdict: PASS
