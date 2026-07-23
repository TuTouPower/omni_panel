---
tid: t081
slug: popup_height_full_workarea
diff_anchor: "<SHA>"
branch: t081_popup_height_full_workarea
---

# Task t081_popup_height_full_workarea

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 用户反馈：用量面板无法无限拉伸，拉到一定长度后不让再拉伸。定位：`popup-height-controller.ts` 的 `MAX_HEIGHT_RATIO = 0.75` 把 popup 高度钳在工作区 75%。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t081` 查，不在此记。

### 验收标准勾选

- [ ] 内容高度 > 75% 且 < 100% 工作区时，窗口锁到内容全高（不再卡 75%）。
- [ ] 内容高度 > 100% 工作区时，窗口锁到 `floor(workArea.height)`，内容内部滚动。
- [ ] 窗口 y/height 始终钳在工作区内（既有 `apply_locked_size` clamp 不回归）。
- [ ] `popup_height_controller.test.ts` 与 `popup_window_constraints.spec.ts` 更新后通过；`pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填
