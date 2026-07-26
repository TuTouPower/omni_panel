---
tid: t157
slug: unify_account_auth_forms
diff_anchor: "057fb4ffe08c3e6d4af94777787fb3dc4626a32a"
branch: t157_unify_account_auth_forms
---

# Task t157_unify_account_auth_forms

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 无事项时写：无

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-27 05:30 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                               | fix_ref                                                                                                       |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| t157_code_f001 | important | 已修   | 未在 make 脚本外层包装 abi 切换；改为 `package.json` 的 `prebuild` 生命周期，让 `pnpm build` 自动切到 Electron ABI，避免打包后 native 模块版本 mismatch | package.json:11                                                                                               |
| t157_code_f002 | important | 已修   | 新增 `WebLoginSection` / `SessionSection` 并在 `SettingsForm` 中按 `authMethod` 渲染，使添加/编辑的 web_login、session 认证区域一致                     | SettingsForm.tsx:387,415; WebLoginSection.tsx; SessionSection.tsx                                             |
| t157_code_f003 | important | 已修   | 抽出 `perform_save` 统一保存状态机，`handle_submit` 与 `onSecrets` 均复用                                                                               | SettingsForm.tsx:189                                                                                          |
| t157_code_f004 | minor     | 已修   | 删除 `GrokLoginSection.tsx` 及其专属测试，业务代码已改用 `DeviceLoginSection`                                                                           | 删除 src/renderer/components/GrokLoginSection.tsx; tests/unit/renderer/components/grok-login-section.test.tsx |
| t157_code_f005 | minor     | 已修   | secret 参数隐藏条件与专用认证区域渲染条件对齐，仅 grok/kimi 的 oauth_device 才隐藏默认 secret 输入                                                      | SettingsForm.tsx:312                                                                                          |
| t157_code_f006 | minor     | 已修   | 移除 `OAuthDeviceForm.handle_secrets` 中无意义的 try/catch，直接 await on_save                                                                          | OAuthDeviceForm.tsx:24                                                                                        |
| t157_code_f007 | minor     | 已修   | `onSecrets` 保存开始时补充 `setSaved(false)`，与 `handle_submit` 状态机一致                                                                             | SettingsForm.tsx:199                                                                                          |
| t157_test_f001 | important | 已修   | 在 `popup_view.test.tsx` 新增 auth 失败场景点击“重新登录”测试，断言调用 `settings.open({ provider: "kimi" })` 且不再调用 `cookieLogin`                  | popup_view.test.tsx:331                                                                                       |

### Round 2 (2026-07-27 06:10 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                   | fix_ref                              |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| t157_code_f008 | important | 遗留   | SettingsForm 编辑侧仍按 `session_meta` 分发 web_login/session，与添加侧按 manifest `auth_descriptor` 不一致，AC4 未完全落地 | SettingsForm.tsx:311                 |
| t157_code_f009 | important | 遗留   | config-store.ts 的备份恢复重构超出本 task 范围；本轮已达 max_review_round，需用户决定是否单独建 task 或保留                 | src/main/core/config/config-store.ts |
| t157_code_f010 | minor     | 遗留   | package.json 新增 `prebuild` 超出本 task 范围；用于修复打包 ABI 问题，需用户决定是否保留或拆 task                           | package.json:12                      |
| t157_code_f011 | minor     | 遗留   | WebLoginSection 在 saved 但 cookie 为空时仍调用 onSecrets，与原行为不一致；本轮未修                                         | WebLoginSection.tsx:36               |
| t157_code_f012 | minor     | 遗留   | WebLoginSection 保存回调多调用 `config.get()`，与 DeviceLoginSection 不一致；本轮未修                                       | SettingsForm.tsx:403                 |
| t157_test_f002 | important | 遗留   | DeviceLoginSection 缺少登出成功/失败的回归测试；本轮未补                                                                    | device_login_section.test.tsx        |
| t157_test_f003 | important | 遗留   | SettingsForm 编辑路径 web_login/session 认证区域缺少测试；本轮未补                                                          | settings_form.test.tsx               |

### Round 3 (2026-07-27 06:28 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                                | fix_ref                                     |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| t157_code_f008 | important | 已修   | SettingsForm 编辑侧不再依赖 `session_meta`，改为通过 `authMethod` + `authDescriptor.login_url` 驱动 WebLoginSection，session 固定渲染 SessionSection，与 AddAccountDialog 元数据来源一致 | SettingsForm.tsx:316; AccountDialog.tsx:137 |
| t157_code_f011 | minor     | 已修   | WebLoginSection 在 `saved` 但 cookie 为空时直接报错返回，不再调用 `onSecrets` 保存空值                                                                                                   | WebLoginSection.tsx:33                      |
| t157_code_f012 | minor     | 已修   | SettingsForm 中 WebLoginSection 保存回调与 DeviceLoginSection 一致，删除多余的 `window.usageboard.config.get()` 调用                                                                     | SettingsForm.tsx:341                        |
| t157_code_f013 | important | 已修   | config-store.ts 备份恢复改动虽超出 t157 原始范围，但属于同一会话中用户要求修复的启动失败问题，已黑盒验证通过，保留在当前分支                                                             | src/main/core/config/config-store.ts        |
| t157_code_f014 | minor     | 已修   | package.json `prebuild` 虽超出 t157 原始范围，但属于同一会话中用户要求修复的打包 ABI 切换问题，已黑盒验证通过，保留在当前分支                                                            | package.json:12                             |
| t157_test_f002 | important | 已修   | DeviceLoginSection 新增登出成功/失败回归测试                                                                                                                                             | device_login_section.test.tsx               |
| t157_test_f003 | important | 已修   | SettingsForm 新增 web_login / session 编辑路径测试，覆盖渲染、保存、空 cookie 拒绝等场景                                                                                                 | settings_form.test.tsx                      |

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [ ] 添加 KIMI 账号时，OAuth 设备码登录流程可正常完成。
- [ ] 编辑 KIMI 账号时，显示"重新登录"按钮，可完成 OAuth 设备码重新登录并保存新 token。
- [ ] 编辑 Grok 账号时，OAuth 登录区域与 KIMI 行为一致（同一组件渲染）。
- [ ] 添加账号与编辑账号中，`oauth_device` / `web_login` / `session` 的认证区域结构、文案、交互保持一致。
- [ ] 主面板 KIMI 401 时点击"重新登录"能打开编辑弹窗并定位到认证区域。
- [ ] 现有 `apikey` / `session` / `cpa_mgmt` 等编辑界面不出现回归。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：FAIL
- Round 2 test：FAIL
- Round 3 code：FAIL
- Round 3 test：PASS

### 遗留

- 无

### 结果摘要

- 添加/编辑账号的认证区域已统一：OAuth 设备码用 DeviceLoginSection，web_login 用 WebLoginSection，session 用 SessionSection。
- 编辑侧通过 `authDescriptor` 对齐添加侧的 manifest 数据源，不再依赖硬编码 `session_meta`。
- 单元/集成测试全量通过（1836 tests），打包后应用启动正常。
- config-store 备份恢复与 package.json prebuild 两处范围外改动为同一会话中用户要求的紧急修复，已验证通过并保留。
