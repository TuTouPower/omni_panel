---
tid: "t472"
slug: "config_import_export_unify"
title: "配置导出导入统一：单一格式（含 manifestId）+ 跨平台迁移"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: "t471"
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现。要点与依据：

- canonical v2 格式与 t471 依赖保留（`depends_on: t471` 未改）；依赖依据为本仓 `config-ipc.ts` 现有三条导出/导入实现（`:435/:457/:547/:581`、`cli/import-config.ts`）与 d058。
- 废除无条件 `vault.replaceAll`：改为 secret 三态（无 `secrets` 字段=保留仍存活实例原密钥+清理已移除实例密钥；有 `secrets` 字段=整体替换；`secrets:{}`=清空）。依据 `secrets-store.ts:40-47` 现状为无条件 `replaceAll`。
- 新增 AC-006..011：三态、过滤未知 manifest 后的 secret 处理、校验失败零副作用、持久化失败一致性、备份失败中止。原 AC-001..005 编号保持不动。
- v1/裸格式：明确不支持，但改为**必须写测试断言拒绝**（修正原「有意不测」的歧义）。
- 与 t479 分界：本 task 负责单次导入内部 config↔vault 一致性；跨入口并发交错与 base 冲突归 t479。

调查路径：读 `config-ipc.ts`（import/export/importData/save）、`secrets-store.ts`、`cli/import-config.ts`、d058。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足 / 未满足
- 测试：待执行时填写
- 黑盒：待执行时填写
- review：待执行时填写
- AC 证据：见 `handoff.json`

### 结果摘要

- 待执行时填写；遗留只写引用，不复制正文
