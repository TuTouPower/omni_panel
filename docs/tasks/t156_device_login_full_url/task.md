---
tid: t156
slug: device_login_full_url
diff_anchor: "<SHA>"
branch: t156_device_login_full_url
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

（未进双审。）

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t156` 查，不在此记。

### 验收标准勾选

- [ ] Grok 登录界面展示的「请访问」地址完整可见且带设备码参数；无「输入代码」行（完整地址可得时）
- [ ] 点击该地址在系统默认浏览器打开完整授权页，应用内不弹新 Electron 窗口
- [ ] 服务端不返回 `verification_uri_complete` 时拼接兜底生效，地址仍完整
- [ ] Kimi 登录界面同成分修复（同一表单组件）
- [ ] 新增/更新组件测试覆盖上述展示与兜底分支；黑盒 `pnpm test` 通过

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- backlog 已建，未执行。
