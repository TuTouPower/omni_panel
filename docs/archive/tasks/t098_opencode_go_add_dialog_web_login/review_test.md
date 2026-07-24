# Task review t098（reviewer_focus: 测试）

- task：`t098_opencode_go_add_dialog_web_login`
- spec：`docs/tasks/t098_opencode_go_add_dialog_web_login/spec.md`
- diff_anchor：`14f4212b8c79ee2ab12602955662878a81bfd1c5`
- target：`git diff 14f4212b8c79ee2ab12602955662878a81bfd1c5`
- round：1
- reviewed_at：2026-07-24 UTC+8

## Findings

### t098_test_f001 - Cookie 回填断言未等待状态提交

- 严重度：minor
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:206-215`
- 问题：断言只等待 login mock 调用，未等待 textarea 更新；React 调度变化时可能在 Cookie 回填前断言。
- 建议：在 `vi.waitFor` 内等待 textarea 的用户可见值。

### t098_test_f002 - 成功登录后未验证保存链路

- 严重度：important
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:186-216`
- 问题：成功路径未提交表单并断言 `on_save` 接收完整 `SESSION_COOKIE`，无法证明回填最终进入保存链路。
- 建议：登录成功后提交表单，断言保存参数。

### t098_test_f003 - 未覆盖旧 Cookie 被网页登录覆盖

- 严重度：important
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:186-216`
- 问题：未预填旧 Cookie 后触发网页登录，未覆盖验收标准要求的覆盖行为。
- 建议：先输入旧 Cookie，再断言网页登录结果完全覆盖且保存新值。

## 结论

- 本轮新发现：3 条。
- 总体判断：成功登录的异步回填、保存和覆盖路径覆盖不足。

verdict: FAIL

## Round 2 (2026-07-24 UTC+8)

### 前轮 finding 复核

- `t098_test_f001`：已修。textarea 回填断言已在 `vi.waitFor` 内等待。
- `t098_test_f002`：已修。成功网页登录后提交表单，断言 `on_save` 接收完整 `SESSION_COOKIE`。
- `t098_test_f003`：已修。测试先输入旧 Cookie，再断言网页登录结果覆盖旧值并验证保存值。

### t098_test_f004 - 未断言匿名窗口加载登录 URL

- 严重度：minor
- 位置：`tests/unit/session/session-manager.test.ts:209`
- 问题：匿名 wildcard 成功测试手动注入请求头，未验证受控窗口实际加载指定 `login_url`。
- 建议：断言 `loaded_urls` 精确等于 OpenCode Go 登录 URL。

### t098_test_f005 - 未验证其他 provider 不显示网页登录

- 严重度：minor
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:48`、`:80`
- 问题：仅正向验证 OpenCode Go 显示按钮，未保护“其他 provider 不改动”的边界。
- 建议：MiMo 与 Kimi 测试中断言不显示“网页登录”。

## 结论

- 本轮新发现：2 条。
- 总体判断：需补齐窗口加载与 provider 隔离覆盖。

verdict: FAIL

## Round 2 补充复核 (2026-07-24 UTC+8)

### 撤回

- `t098_test_f004`：撤回。`tests/unit/session/session-manager.test.ts:235` 已断言匿名登录窗口精确加载 `https://opencode.ai/auth`。
- `t098_test_f005`：撤回。`tests/unit/renderer/components/add_account_dialog.test.tsx:61` 与 `:98` 已分别断言 MiMo、Kimi 不显示“网页登录”。

### 本轮新发现

- 0 条。

## 结论

- 前轮 finding 复核：`t098_test_f001` 至 `t098_test_f003` 已修；`t098_test_f004`、`t098_test_f005` 已撤回。
- 总体判断：测试覆盖网页登录的成功、失败、覆盖、保存、窗口加载和 provider 隔离路径。

verdict: PASS
