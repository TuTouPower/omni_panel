---
tid: "t156"
slug: "device_login_full_url"
title: "Grok 设备码登录展示完整授权地址并默认浏览器打开"
status: "done"
branch: "t156_device_login_full_url"
worktree: ""
review_level: "full"
diff_anchor: "6dd0c8a4427eb630bb6ed75e0ff3a7ba21a44e31"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t156_device_login_full_url

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-26：建 backlog，未开干。已确认现状：链接显示文本用 `verification_uri`（短地址），仅 href 用 `verification_uri_complete`；下方另有「输入代码」行；主进程全局无 `setWindowOpenHandler`，`<a target="_blank">` 不走系统默认浏览器。`diff_anchor` 开干时写实值。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-27 04:05 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                          | fix_ref                                                                                                                     |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| t156_code_f001 | minor     | 已修   | 输入代码行改为条件渲染：device_code.user_code 为空时保留兜底行，非空时隐藏                                         | src/renderer/components/forms/OAuthDeviceForm.tsx、src/renderer/components/GrokLoginSection.tsx                             |
| t156_test_f001 | important | 已修   | 在 verification_uri_complete 缺失的兜底测试中追加「无输入代码行」断言；并新增 user_code 为空时显示输入代码行的测试 | tests/unit/renderer/components/forms/oauth_device_form.test.tsx、tests/unit/renderer/components/grok-login-section.test.tsx |

### Round 2 (2026-07-27 04:15 UTC+8)

零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t156` 查，不在此记。

### 验收标准勾选

- [x] Grok 登录界面展示的「请访问」地址完整可见且带设备码参数；无「输入代码」行（完整地址可得时）
- [x] 点击该地址在系统默认浏览器打开完整授权页，应用内不弹新 Electron 窗口
- [x] 服务端不返回 `verification_uri_complete` 时拼接兜底生效，地址仍完整
- [x] Kimi 登录界面同成分修复（同一表单组件）
- [x] 新增/更新组件测试覆盖上述展示与兜底分支；黑盒 `pnpm test` 通过

### Reviewer verdict

- Round 1 code：FAIL（1 finding，已修）
- Round 1 test：FAIL（1 finding，已修）
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

- 已实现：Grok/Kimi OAuth 设备码登录界面展示完整授权 URL（优先 verification_uri_complete，否则拼接 user_code），并移除「输入代码」行；主进程为所有窗口注册 setWindowOpenHandler，仅 http(s) 外部链接走系统默认浏览器。
- 已测试：新增/更新组件测试覆盖完整 URL 展示、verification_uri_complete 缺失兜底、user_code 为空兜底、窗口外链打开与拦截；`pnpm typecheck && pnpm lint && pnpm test` 全绿。
- 双审 Round 2 总体 PASS。
