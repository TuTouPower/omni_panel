---
tid: t092
slug: cpa_merge_common_services
diff_anchor: "<SHA>"
branch: t092_cpa_merge_common_services
---

# Task t092_cpa_merge_common_services

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户要求：CPA 不再单独拎出「高级方式」，样式与其他账号一致（普通 pick-card 小方块）；参考 https://github.com/router-for-me/CLIProxyAPI 。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t092` 查，不在此记。

### 验收标准勾选

- [ ] 添加账号弹窗中 CPA 显示在"常用服务"网格内，与其他厂商同尺寸 pick-card。
- [ ] 点击 CPA 后进入标准 auth 表单（管理密钥输入 + monitor 参数）。
- [ ] 删除"高级方式"section。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
