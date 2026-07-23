---
tid: t076
slug: split_refresh_service
diff_anchor: "<SHA>"
branch: t076_split_refresh_service
---

# Task t076_split_refresh_service

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 来源：t039 review `t039_code_f002`（minor，遗留）——`refresh-service.ts` 超 400 行阈值，拆分属独立重构。当前 450 行。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t076` 查，不在此记。

### 验收标准勾选

- [ ] `refresh-service.ts` 拆分后每个实现源码文件 ≤ 400 行。
- [ ] 对外 API（`createRefreshService` / `RefreshServiceDeps` / `ConnectorRefreshService` / 已导出的错误分类函数）签名与语义不变。
- [ ] 既有单测全绿（`pnpm test`），必要时仅调整 import 路径。
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
