---
tid: "t109"
slug: "vendor_forms_oauth_weblogin"
title: "OAuthDeviceForm + WebLoginForm 两个厂商子表单"
status: "done"
branch: "t109_vendor_forms_oauth_weblogin"
worktree: ""
review_level: "full"
diff_anchor: "e55da266a006e3bb04f389148be7eb44ed509ebb"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: "blocked: review"
---

# Task t109_vendor_forms_oauth_weblogin

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 在 `AddAccountDialog` 中按 `auth_method` 路由到 `OAuthDeviceForm`/`WebLoginForm`，footer 对这两种方法隐藏，保存/关闭由表单内 `on_save` 回调完成。
- `OAuthDeviceForm` 调用 `window.usageboard.grok.login_start`/`login_poll`，轮询成功后以 `auth_method: "oauth_device"`、`secrets: {}` 回调保存；token 实际由主进程 Grok OAuth manager 按 instance_id 持有。
- `WebLoginForm` 调用 `window.usageboard.session.login` 捕获 Cookie，成功后用 `auth_method: "web_login"`、`secrets: { [secret_name]: cookie }` 回调保存。
- 单测覆盖两种表单的渲染、开始/轮询/保存流程，以及 `AddAccountDialog` 对 grok/opencode_go 的路由断言。
- `pnpm test` 第一次全量运行时 `tests/integration/config/config-store.test.ts` 的并发保存用例因 Windows `EPERM rename` 偶发失败；单独重跑该文件与本 task 相关测试均通过，再次全量运行 `pnpm test` 全绿。判定为与本 task 无关的 Windows 并发 flaky。
- `pnpm typecheck` 通过。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-25 16:39 UTC+8)

代码 reviewer 提出 5 条 finding，全部按 spec/质量要求修复；测试 reviewer 零 finding。

| finding_id     | severity  | status | rationale                                                                                                                                                                        | fix_ref                                                                                                 |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| t109_code_f001 | important | 已修   | 抽取 `use_grok_device_login` hook，`OAuthDeviceForm` 与 `GrokLoginSection` 共用同一设备码 login_start/login_poll 状态机。                                                        | src/renderer/hooks/use_grok_device_login.ts:1                                                           |
| t109_code_f002 | important | 已修   | `OAuthLoginResult` 新增 `token`，manager 在保存 token 后返回；`OAuthDeviceForm` 把 `result.token` 按 descriptor secret_name 写入 `secrets`。                                     | src/main/core/auth/grok_oauth_manager.ts:59, src/renderer/components/forms/OAuthDeviceForm.tsx:36       |
| t109_code_f003 | important | 已修   | `OAuthDeviceForm` 在 `on_save` 抛错时重置 hook 并把错误显示出来；`WebLoginForm` 把 `on_save` 包进 try/catch，保存失败时显示错误。                                                | src/renderer/components/forms/OAuthDeviceForm.tsx:33, src/renderer/components/forms/WebLoginForm.tsx:35 |
| t109_code_f004 | important | 已修   | manager 新增 `active_login_cancels` 与 `cancel_device_login`；`use_grok_device_login` 在组件卸载 cleanup 中调用 `login_cancel`，终止后台轮询。                                   | src/main/core/auth/grok_oauth_manager.ts:211, src/renderer/hooks/use_grok_device_login.ts:28            |
| t109_code_f005 | minor     | 已修   | 把 `AddAccountDialog` 中的 `VendorPicker`/`ApiKeyForm`/`SessionForm`/`LocalScanForm`/`AuthPlaceholder` 拆到 `src/renderer/components/add_account/`，主文件从 609 行降至 308 行。 | src/renderer/components/AddAccountDialog.tsx:1, src/renderer/components/add_account/                    |

### Round 2 (2026-07-25 17:02 UTC+8)

代码 reviewer 提出 2 条 finding，测试 reviewer 提出 2 条 finding；用户将 `max_review_round` 调整为 5，已在本轮内修复全部 4 条 finding。

| finding_id     | severity  | status | rationale                                                                                                                                                     | fix_ref                                                             |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| t109_code_f006 | important | 已修   | `use_grok_device_login.start` 入口增加 `active_ref.current` 检查，若已有流程在跑则直接返回 `null`，防止并发轮询覆盖 cancel 句柄。                             | src/renderer/hooks/use_grok_device_login.ts:47                      |
| t109_code_f007 | important | 已修   | `AddAccountDialog` 渲染 `OAuthDeviceForm`/`WebLoginForm` 时加 `key={vendor_id}`，切换服务即卸载重挂，表单状态自然重置；设备码轮询的 cleanup 也会触发 cancel。 | src/renderer/components/AddAccountDialog.tsx:248,261                |
| t109_test_f001 | important | 已修   | `grok_oauth_manager.test.ts:462` 恢复为精确 `toEqual({ saved: false })`，保持对 `await_completion` 失败返回形状的约束。                                       | tests/unit/auth/grok_oauth_manager.test.ts:462                      |
| t109_test_f002 | important | 已修   | `oauth_device_form.test.tsx` 新增 it：mock `login_poll` 成功但 `on_save` reject，断言错误文本出现在文档中且显示「重新登录」按钮。                             | tests/unit/renderer/components/forms/oauth_device_form.test.tsx:154 |

### Round 3 (2026-07-25 17:18 UTC+8)

代码 reviewer 与测试 reviewer 均零新 finding；对 Round 1/2 的 7 条代码 finding 与 2 条测试 finding 复核确认全部已修。

| finding_id       | severity | status | rationale                            | fix_ref |
| ---------------- | -------- | ------ | ------------------------------------ | ------- |
| （零新 finding） | —        | —      | 本轮无新增 finding，仅复核前轮结论。 | —       |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t109` 查，不在此记。

### 验收标准勾选

- [x] grok 添加账号时显示设备码登录流程，不再显示 API key 输入框。
- [x] opencode_go 添加账号时主路径为网页登录，不再显示 cookie 输入框。
- [x] 单测覆盖两个表单的渲染与保存逻辑。
- [x] `pnpm test` 全绿；`pnpm typecheck` 通过。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS

### 遗留

- 无

### 结果摘要

- 实现 OAuthDeviceForm 与 WebLoginForm 厂商子表单，grok 使用设备码登录、opencode_go 使用网页 Cookie 登录；双审三轮均 PASS，`pnpm test` / `pnpm typecheck` 全绿。
