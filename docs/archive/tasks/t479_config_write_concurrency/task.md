---
tid: "t479"
slug: "config_write_concurrency"
title: "配置写入并发语义统一：导入/复制/新建走冲突检测"
status: "done"
branch: "t479_config_write_concurrency"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "ee55be3127fe95c8c99479468cd0990cc23faba7"
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

### 2026-09-14 实施

- 在 `AppConfigStore` 增加 `run_serialized` 事务接口，并让生产 store 在同一队列内完成「读取最新状态 → 计算 → 提交」；轻量测试 double 通过兼容包装复用现有 `load`/`save`。
- 设置页保存改为队列内基于 base match 冲突拒绝；导入、复制、新建、auto-seed、prune 均在最新状态上执行，导入的 config/vault 快照、提交和回滚保持在同一临界区。
- 补齐配置 store 的并发回归：复制与另一字段保存、新建与 tombstone、prune 与用户修改三类非重叠修改均断言最终状态同时保留。
- 同步 config-store 规范、决策 ADR 和索引；定向回归 94 tests 通过，typecheck、lint、format、deadcode、dependency-cruiser 和生产构建通过。
- 全量 Vitest 为 3300 passed / 9 skipped / 357 failures；失败集中于 Node 24 缺少 `better-sqlite3` native binding，以及 t478 未合并到本 task 基线导致的存量 cookie-login 失败。`pnpm test` 在 ABI 重建阶段因 node-gyp 头文件解包 `TAR_ENTRY_ERROR EINVAL (fchown)` 阻塞，已记录为环境 pending。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-14 00:00 UTC)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t479_code_f001|minor|撤回|Round 1 复核确认生产入口均通过真实 `createConfigStore.run_serialized`；兼容包装仅服务轻量测试 double/旧 embedder，非生产绕过。|`src/main/core/config/config-store.ts:run_config_transaction`|

Round 1 代码与测试复审均 PASS，除上述非阻塞说明外零 finding；详见 [`review_code.md`](review_code.md) 与 [`review_test.md`](review_test.md)。

无 finding 时写“Round N 零 finding”。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：定向配置/IPC/CLI 回归 94 passed；类型检查、Lint、格式、Knip、dependency-cruiser 通过。全量 Vitest 的失败仅为已确认环境 native SQLite 与未合并 t478 基线差异。
- 黑盒：Electron 主包、preload、renderer 与 web bundle 构建通过；`pnpm test` 在 Vitest 前的 Node 24 ABI 重建阶段被 node-gyp 头文件解包错误阻塞。
- review：Round 1 code PASS / test PASS，零 blocking finding。
- AC 证据：见 `handoff.json`

### 结果摘要

- 统一串行读-算-提交路径已覆盖所有配置写入口；save 保持冲突拒绝，显式导入/复制/新建保持覆盖但不交错，系统维护操作按最新状态增量应用。环境验证限制见 `handoff.json.pending`。
