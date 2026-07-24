---
tid: t098
slug: opencode_go_add_dialog_web_login
diff_anchor: "<SHA>"
branch: t098_opencode_go_add_dialog_web_login
---

# Task t098_opencode_go_add_dialog_web_login

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-24 创建 task。背景：用户反馈添加 OpenCode Go 账号弹窗里只看到「复制脚本」，期望首次添加即在弹窗内网页登录。初版 `f623ad8` 设计上把「网页登录」放在设置页（依赖 instance_id），添加弹窗只走手动 Cookie 导入。本 task 补齐添加弹窗内的网页登录流程。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [ ] 添加账号 → 选 OpenCode Go → 看到「网页登录」按钮（非「复制脚本」独占）
- [ ] 点击「网页登录」弹出受控登录窗口加载 `https://opencode.ai/auth`
- [ ] 用户在登录窗口完成登录并关闭窗口后，表单 Cookie 字段自动填入捕获的完整 Cookie 字符串（含 HttpOnly），无需手动粘贴
- [ ] 已有 Cookie 文本时仍可点「网页登录」覆盖更新
- [ ] 登录失败/超时/未捕获到 Cookie 时，给出明确错误提示，不静默失败
- [ ] 「复制脚本」兜底按钮仍可用
- [ ] 保存后账号正常创建，用量数据可正常拉取

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- 待补充
