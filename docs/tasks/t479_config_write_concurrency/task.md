---
tid: "t479"
slug: "config_write_concurrency"
title: "配置写入并发语义统一：导入/复制/新建走冲突检测"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: "t472"
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 按用户已裁定的并发策略列出**逐入口表**（save 冲突拒绝；导入/复制/新建/CLI import 允许覆盖但串行；auto-seed/prune 增量应用），并据此新增 AC-005..008（丢失非重叠修改、tombstone 与实例列表不互覆、逐入口策略一致、auto-seed/prune 基于最新状态）。
- 关键修正：排队必须覆盖「读最新状态 → 计算 → 提交」整段，不能只排 `save`。依据现状 `config-ipc.ts:294-318`（duplicate 先 `load` 再追加再 `save`）、`:337-374`（createInstance 同）、`config-store.ts:270-287`（compare-and-save 只保护单次写）。测试须断言「两入口都成功但丢掉非重叠修改」的场景，不只断言 JSON 完整。
- 原 `UNVERIFIED-BLOCKING`（冲突策略需产品裁定）已由用户裁定解除，写入决策表。
- 依赖 t472 保留；与 t472 分界写明（单次导入内部一致性 vs 跨入口并发）。

调查路径：读 `config-ipc.ts`（save/duplicate/createInstance/importData）、`config-store.ts`（enqueue/compare-and-save/prune）、`auto-seed.ts`、`cli/import-config.ts`、d058。

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
