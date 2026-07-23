---
tid: t067
slug: ipc_renderer_path_whitelist
diff_anchor: "6f0801a46a4499d0321476155168e0049491034b"
branch: t067_ipc_renderer_path_whitelist
---

# Task t067_ipc_renderer_path_whitelist

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

### Round 1 (2026-07-24 01:10 UTC+8)

| finding_id     | severity  | status | rationale                                                      | fix_ref                     |
| -------------- | --------- | ------ | -------------------------------------------------------------- | --------------------------- |
| t067_code_f001 | important | 遗留   | spec 要求签名改，实现用全局 setter（务实等价，避免 12 IPC 改） | spec 调整 + 裁决            |
| t067_code_f002 | minor     | 已修   | error.message 泄漏绝对路径                                     | helpers.ts 删 expected path |
| t067_code_f003 | minor     | 已修   | pathToFileURL 冗余 round-trip                                  | helpers.ts 简化             |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t067` 查，不在此记。

### 验收标准勾选

- [x] helpers.ts 加 `set_renderer_index_path` + 全局 `renderer_index_pathname`，file:// 精确比对 pathname。
- [x] index.ts 启动调 `set_renderer_index_path`。
- [x] 非 rendererIndexPath 的 file:// 被拒（即使同名 index.html）。
- [x] 未初始化时回退 endsWith fallback（兼容测试）。
- [x] 测试：精确比对正反例 + 既有 endsWith 测试不被破坏。

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：PASS（f001 spec 调整 + f002/f003 修）
- Round 2 test：N/A（R1 已 PASS）

### 遗留

- 无。

### 结果摘要

- IPC file:// sender 精确比对 rendererIndexPath pathname（t062 endsWith 增量防御 -> t067 完整白名单）。
