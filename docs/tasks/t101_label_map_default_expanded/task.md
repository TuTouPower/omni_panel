---
tid: t101
slug: label_map_default_expanded
diff_anchor: "<SHA>"
branch: t101_label_map_default_expanded
---

# Task t101_label_map_default_expanded

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-24 创建 task。背景：用户要求设置页「数据标签映射」默认展开、取消折叠按钮。位置 `SettingsForm.tsx:77,498-516`。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [ ] 打开任一支持 label map 的账号编辑弹窗，「数据标签映射」区直接展开显示标签行，无需点击。
- [ ] 弹窗中不再出现折叠/展开 chevron 按钮。
- [ ] 加载中、空态（无可映射标签）仍正常显示。
- [ ] `pnpm test` 全量通过。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- 待补充
