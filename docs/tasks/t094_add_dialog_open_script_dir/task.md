---
tid: t094
slug: add_dialog_open_script_dir
diff_anchor: "<SHA>"
branch: t094_add_dialog_open_script_dir
---

# Task t094_add_dialog_open_script_dir

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户要求：添加账号弹窗加按钮一键打开 `userData/connectors` 脚本目录，为自定义 connector（t095）提供入口；参考 https://github.com/router-for-me/CLIProxyAPI 。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t094` 查，不在此记。

### 验收标准勾选

- [ ] 添加账号弹窗有"打开脚本目录"按钮。
- [ ] 点击后系统文件管理器打开 `userData/connectors` 目录。
- [ ] 目录不存在时自动创建。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
