---
tid: t161
slug: overview_grid_keep_info
diff_anchor: "37f2f89b67698be77662c3d076a9a031452c8e83"
branch: t161_overview_grid_keep_info
---

# Task t161_overview_grid_keep_info

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 需求来自用户口头原则（已固化进 spec.md「用户要求」三条）：信息不丢，放不下减列，禁止隐藏内容。
- 前置：f2c1c705 曾用 `display: none` 隐藏窄卡片 rel-time，被用户否掉；工作区残留未提交的 360px 单规则改动，本 task 在其上继续。
- Step 2：globals_css.test.ts 先改断言，12 项中 3 项失败（红）。
- Step 3：globals.css 下限 360→420 并删除 `:has(.l2seg) .rel-time { display: none }` 块，测试 12/12 通过（绿）。
- Step 4：pnpm test 全量 1882 tests 全绿；typecheck / lint 通过。
- Step 5：双审均 PASS，0 finding。
- Step 7：同步更新 docs/specs/ui-views-web.md 响应式条目；docs/blueprint/decisions.md 追加 ADR 010。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

### Round 1 零 finding

两轴均 0 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t161` 查，不在此记。

### 验收标准勾选

- [x] 窗口各档宽度下所有卡片形态头部信息完整，无隐藏
- [x] 容器不足时网格自动减列，原 640–1023 不再强制两列
- [x] globals_css.test.ts 含最小列宽与 `.rel-time` 不隐藏守卫，重引入隐藏规则会变红
- [x] `pnpm test` 全绿；`pnpm typecheck && pnpm lint` 通过

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 已按「信息不丢、放不下减列」原则修复：`.overview-grid` 改为单一 `repeat(auto-fill, minmax(420px, 1fr))`，删除隐藏规则与 1024/640 断点；测试守卫已补；spec/blueprint 已同步。
