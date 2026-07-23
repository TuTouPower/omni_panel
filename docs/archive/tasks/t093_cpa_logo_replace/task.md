---
tid: t093
slug: cpa_logo_replace
diff_anchor: "<SHA>"
branch: t093_cpa_logo_replace
---

# Task t093_cpa_logo_replace

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户要求：CPA logo 参考 CLIProxyAPI 开源项目 logo；`cpa.png` 已下载入 `src/renderer/assets/vendor_logos/`（460×460，router-for-me org avatar）。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t093` 查，不在此记。

### 验收标准勾选

- [ ] `<VendorMark id="cpa" />` 渲染 `img.vendor-logo-img`（CLIProxyAPI logo）。
- [ ] 不再回落 VENDOR_MARKS 四段圆环。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
