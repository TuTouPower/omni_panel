---
tid: t032
slug: align_conventions_repo
diff_anchor: "9541c6e"
branch: t032_align_conventions_repo
---

# Task t032_align_conventions_repo

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 接续 t031（工作流迁移），修补 conventions.md 工作流字段段对齐 repo_template 的遗漏 + specs_index 占位符歧义。
- 用户决策"全面对齐"：含 schema 类型落点段。
- diff_anchor = 9541c6e（t031 commit）。

## Review 处置

纯文档对齐 task，用户已审批范围，未走双审。零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t032` 查，不在此记。

### 验收标准勾选

- [x] conventions.md L3 无 `adoption/`（仅保留 L45 废弃声明「不再使用 log/adoption/task_report」）
- [x] conventions.md task 模板表含「谁写/是否必有」列 + 明确废 log/adoption/task_report 声明
- [x] conventions.md 含 task.md front matter 详解段
- [x] conventions.md 含 schema 类型落点段（omni 特化：连接器契约 schemas/、代码契约 src/shared/schemas/）
- [x] specs_index.md 无 `{tid}` 占位符字样（改「无」）
- [x] grep `adoption/` 在 conventions.md 无残留（仅废弃声明）

### Reviewer verdict

- 纯文档 task，未走双审（用户直接审批「全面对齐」范围）。

### 遗留

- 无

### 结果摘要

conventions.md 工作流字段段全面对齐 repo_template：命名段补 task/spike 编号说明、新增 schema 类型落点段、task 模板表加「谁写/是否必有」列 + 废 log/adoption/task_report 声明、新增 task.md front matter 详解、review 字段段改指向 render 脚本、specs_index 字段段改 step 7 收尾累积 + supersedes。specs_index.md 14 行占位符歧义消除。
