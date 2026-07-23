---
tid: t095
slug: user_custom_connector_support
diff_anchor: "<SHA>"
branch: t095_user_custom_connector_support
---

# Task t095_user_custom_connector_support

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户要求：支持在脚本目录自行添加 connector（manifest.json + connector.ts）；需放开 provider schema + 文档。入口按钮见 t094，弹窗结构调整见 t092。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t095` 查，不在此记。

### 验收标准勾选

- [ ] 用户在 `userData/connectors/my_vendor/` 放 manifest.json + connector.ts，app 启动后自动发现并 seed。
- [ ] manifest provider 为任意 snake_case 字符串均被接受。
- [ ] renderer 对未知 provider 显示 vendor mark fallback + provider 名作 label。
- [ ] 文档 `docs/guides/custom-connector.md` 含完整模板 + 示例。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
