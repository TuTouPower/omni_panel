---
tid: t068
slug: task_py_mock_replace_test
diff_anchor: "f705f00"
branch: "t068_spike"
---

# Task t068_task_py_mock_replace_test

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

评估型 spike，不走双审。

## 收尾报告

### 评估结论

- t063 已有 vitest 子进程测试覆盖原子写 happy path（无 .tmp 残留 + JSON 有效）+ 中断恢复（active+archive 共存幂等清）。
- mock os.replace 失败路径需 Python 单元测试框架（unittest/pytest + monkeypatch），项目无 Python 测试基建。
- vitest 子进程黑盒无法 mock Python 内部函数。
- 裁决：spike close，另立 pytest 基建 task 后补。

### 验收标准勾选

- [x] 评估完成（mock os.replace 需 Python 框架，当前不可行）。

### Reviewer verdict

- 评估型 spike，未走双审。

### 遗留

- mock os.replace 失败路径测试：需 pytest 基建，另立 task。

### 结果摘要

- spike close：mock os.replace 需 Python 测试框架，t063 vitest 子进程已覆盖 happy path + 恢复。
