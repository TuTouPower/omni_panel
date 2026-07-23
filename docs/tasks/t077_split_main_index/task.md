---
tid: t077
slug: split_main_index
diff_anchor: "<SHA>"
branch: t077_split_main_index
---

# Task t077_split_main_index

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 来源：t045 review `t045_code_f001`（minor，遗留）——`index.ts` 超 800 行 important 阈值，`onConfigSaved` 整体外移属独立重构。当前 922 行。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t077` 查，不在此记。

### 验收标准勾选

- [ ] `src/main/index.ts` ≤ 800 行；新拆出的实现源码文件均 ≤ 800 行。
- [ ] 配置保存/导入回调的依赖以显式注入表达，不再依赖超长相邻闭包。
- [ ] 既有测试全绿（`pnpm test`）；涉及打包路径时 `pnpm test:packaged` 打包 smoke 通过。
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
