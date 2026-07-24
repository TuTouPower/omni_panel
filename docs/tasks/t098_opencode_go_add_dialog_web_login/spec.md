# Task spec

## 背景

OpenCode Go 添加账号弹窗当前只有「复制脚本」+ 手动粘贴 Cookie，必须保存账号后进设置页才能点「网页登录」。用户期望首次添加 OpenCode Go 账号时即可直接在弹窗内完成网页登录，无需粘贴 Cookie。

历史背景：初版 `f623ad8 feat: support opencode go session login` (2026-06-27) 因 session login 依赖 `instance_id` 而设计上把「网页登录」放在设置页，添加弹窗只走手动导入。现需补齐添加弹窗内的网页登录流程。

## 范围

- `AddAccountDialog` 的 `SessionForm`（仅 `opencode_go` 分支）增加「网页登录」按钮。
- 点击后调 `window.usageboard.session.login(...)`，使用 `session_meta.opencode_go`（`login_url: https://opencode.ai/auth`, `cookie_names: ["*"]`）。
- 登录成功后自动填充 `SESSION_COOKIE` 到表单，保存时走既有 secret 保存链路。
- 保留手动粘贴 Cookie 路径（兜底）。

## 非范围

- 不改其他 provider（mimo/kimi）的添加弹窗。
- 不改设置页 SettingsForm 已有的「网页登录」按钮。
- 不改 session-manager 后端逻辑（`cookie_names: ["*"]` 已支持）。
- 不引入新 IPC channel（复用 `SESSION_LOGIN`）。

## 验收标准

- [ ] 添加账号 → 选 OpenCode Go → 看到「网页登录」按钮（非「复制脚本」独占）。
- [ ] 点击「网页登录」弹出受控登录窗口加载 `https://opencode.ai/auth`。
- [ ] 用户在登录窗口完成登录并关闭窗口后，表单 Cookie 字段自动填入捕获的完整 Cookie 字符串（含 HttpOnly），无需手动粘贴。
- [ ] 已有 Cookie 文本时仍可点「网页登录」覆盖更新。
- [ ] 登录失败/超时/未捕获到 Cookie 时，给出明确错误提示，不静默失败。
- [ ] 「复制脚本」兜底按钮仍可用。
- [ ] 保存后账号正常创建，用量数据可正常拉取。

## 依赖与约束

- 依赖 `SessionLoginRequest` schema 现有字段。
- 关键约束：`session.login` 当前要求 `instance_id`。添加弹窗里实例尚未创建，需扩展支持匿名捕获（详见 plan）。
