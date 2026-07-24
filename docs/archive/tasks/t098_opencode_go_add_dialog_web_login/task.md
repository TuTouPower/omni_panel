---
tid: t098
slug: opencode_go_add_dialog_web_login
diff_anchor: "14f4212b8c79ee2ab12602955662878a81bfd1c5"
branch: t098_opencode_go_add_dialog_web_login
---

# Task t098_opencode_go_add_dialog_web_login

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-24 创建 task。背景：用户反馈添加 OpenCode Go 账号弹窗里只看到「复制脚本」，期望首次添加即在弹窗内网页登录。初版 `f623ad8` 设计上把「网页登录」放在设置页（依赖 instance_id），添加弹窗只走手动 Cookie 导入。本 task 补齐添加弹窗内的网页登录流程。
- 2026-07-24 隔离 Electron 实测发现：未认证关闭 OpenCode OAuth 窗口时，`cookie_names: ["*"]` 把登录前同源 `auth` Cookie 回填表单。修复为 wildcard 仅在主 frame 跨 origin 离开并回到 login origin 后捕获；匿名登录使用非持久 partition，避免临时 Cookie 残留。
- 2026-07-24 修复后隔离 GUI 验证通过：OpenCode Go 添加弹窗同时显示「网页登录」「复制脚本」，登录窗跳转 `auth.opencode.ai/authorize`，未认证关闭后显示“未捕获到 Cookie，请完成登录后再关闭窗口”，Cookie 字段为空，登录按钮处于禁用状态。后续两次同一隔离脚本启动在 `firstWindow` 超时，已停止；最终打包产物 smoke 通过。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-24 UTC+8)

| finding_id     | severity  | status | rationale                                                                                 | fix_ref                                                          |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| t098_test_f001 | minor     | 已修   | Cookie 回填断言已在 `vi.waitFor` 内等待 React 状态提交。                                  | `tests/unit/renderer/components/add_account_dialog.test.tsx:217` |
| t098_test_f002 | important | 已修   | 成功网页登录后提交表单，断言保存链路收到完整 `SESSION_COOKIE`。                           | `tests/unit/renderer/components/add_account_dialog.test.tsx:221` |
| t098_test_f003 | important | 已修   | 测试先填旧 Cookie，再断言网页登录完整覆盖，并验证保存值。                                 | `tests/unit/renderer/components/add_account_dialog.test.tsx:207` |
| t098_code_f001 | important | 撤回   | wildcard 仅在顶层跨 origin 往返后捕获是本 task 认可的安全前提；匿名分区不继承已有登录态。 | `review_code.md` Round 2                                         |
| t098_code_f002 | important | 已修   | 匿名登录改用一次性非持久 partition，关闭后不保留 Cookie。                                 | `src/main/core/session/session-manager.ts:85`                    |
| t098_test_f004 | minor     | 已修   | 匿名 wildcard 成功测试断言受控窗口精确加载 OpenCode Go 登录 URL。                         | `tests/unit/session/session-manager.test.ts:235`                 |
| t098_test_f005 | minor     | 已修   | MiMo 与 Kimi 测试均断言不显示“网页登录”。                                                 | `tests/unit/renderer/components/add_account_dialog.test.tsx:61`  |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 添加账号 → 选 OpenCode Go → 看到「网页登录」按钮（非「复制脚本」独占）。隔离 Electron GUI 已观察。
- [x] 点击「网页登录」弹出受控登录窗口加载 `https://opencode.ai/auth`。隔离 Electron GUI 已观察窗口跳转至 `auth.opencode.ai/authorize`。
- [ ] 用户完成真实登录后自动回填完整 Cookie（含 HttpOnly）未实际验证：无授权账户。匿名捕获、IPC 回传与表单回填已由 session-manager、IPC、renderer 单元测试覆盖。
- [x] 已有 Cookie 文本时仍可点「网页登录」覆盖更新。renderer 单元测试覆盖覆盖后保存完整 `SESSION_COOKIE`。
- [x] 登录失败/未捕获到 Cookie 时，给出明确错误提示，不静默失败。隔离 Electron GUI 已观察未认证关闭后的提示与空 Cookie 字段。
- [x] 「复制脚本」兜底按钮仍可用。隔离 Electron GUI 已观察。
- [ ] 保存后真实账号用量拉取未实际验证：无真实授权 Cookie。保存链路将回填 Cookie 写为正式账号的 `SESSION_COOKIE` 已由 renderer 单元测试覆盖。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS
- `scripts/check_review_status.py`：`overall=PASS`（Round 2）。

### 遗留

- 无实现遗留。未验证真实 IdP 成功登录、真实 HttpOnly Cookie 回填及保存后 OpenCode Go 用量拉取：未提供授权账户或 Cookie，未执行真实登录。
- `pnpm test:contract:live` 未运行有效契约：仓库无 `tests/contract_live` 匹配测试文件，命令以退出码 1 结束。
- 全项目 `pnpm lint` / `pnpm format:check` 仍报告既有无关问题；本 task 改动的定向格式检查已通过。

### 结果摘要

- 单元测试：`pnpm test` 通过，158 files、1615 tests。
- 打包 smoke：`pnpm package && pnpm test:packaged` 通过，3 tests；真实启动 `artifacts/win-unpacked/OmniUsage.exe`。
- 隔离 Electron GUI：OpenCode Go 添加弹窗显示「网页登录」「复制脚本」；登录中按钮禁用；未认证关闭 OAuth 窗口显示“未捕获到 Cookie，请完成登录后再关闭窗口”，不回填 Cookie。
- wildcard Cookie 仅在顶层页面跨 origin 往返后捕获，避免登录前匿名 `auth` Cookie 被当作凭据；匿名 session 使用非持久 partition。
