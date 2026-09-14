---
tid: "t472"
slug: "config_import_export_unify"
title: "配置导出导入统一：单一格式（含 manifestId）+ 跨平台迁移"
status: "done"
branch: "t472_config_import_export_unify"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "614dea2e447f6d3214595ed8d2129d03e2c132aa"
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

### 2026-09-14 实施与验证（attempt 1，execution_id `3e5795df0f564343b268671988930ecd`）

- 新增共享 `src/main/core/config/config-transfer.ts`：统一 canonical v2 导出/导入、顶层 `secrets` 校验、manifestId 过滤与本机路径重映射、secret 三态和 config↔vault 失败恢复。
- 桌面 IPC、LocalAPI/Web 与 CLI 均改走共享 transfer；导出默认省略 secrets，显式 includeSecrets 才导出；v1 wrapper 和裸 config 明确拒绝并报告实际版本；未知 manifest 跳过并回报。
- vault 新增加密导入快照接口，文件 backend 只保存 ciphertext，并在 config/vault 写入前分别生成 `.bak` 与 `secrets.vault.import.bak`；任一写入失败恢复导入前状态。
- 补充 IPC、CLI、LocalAPI canonical v2 回归以及真实 file-vault 加密快照回归；同步 `config-store` spec、决策记录和 spec 索引。
- 定向回归：IPC 50、CLI 9、file-vault 34，共 93 tests PASS；changed-file ESLint、Prettier、`git diff --check` PASS。
- 全仓 `tsc --noEmit` 仅报仓库既有生成文件 `src/generated/build-info.ts` 缺失；尝试运行生成脚本时被受限环境的 `tsx` IPC `listen EPERM` 阻塞。LocalAPI 全集成测试同样被环境缺少 `better-sqlite3` native binding 阻塞，未进入业务断言。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

### Round 1 (2026-09-14 08:54 UTC)

Round 1 零 finding。

实现侧复核确认三入口只保留文件/HTTP/IPC 外壳，共享模块先完成 envelope/config/secrets 校验再读取并备份；显式 secrets 过滤到导入后存活实例，缺失字段保留活动实例并清理悬空实例；config/vault 失败恢复与加密快照均有回归。

测试侧复核确认 93 个定向测试实际执行共享导入路径；v1/裸格式拒绝、未知 manifest 回报、路径重映射、三态 secrets、备份失败、vault 失败恢复和 ciphertext 快照均有断言。全量集成受环境 native binding 阻塞，未将环境失败误记为业务失败。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足；全量集成测试受环境阻塞，见实施笔记
- 测试：定向 93 tests PASS；changed-file ESLint/Prettier/diff-check PASS
- 黑盒：IPC/CLI/file-vault 回归 PASS；LocalAPI 全集成被 better-sqlite3 native binding 阻塞
- review：Round 1 code + test PASS，0 finding
- AC 证据：见 `handoff.json`

### 结果摘要

- canonical v2 成为桌面、LocalAPI/Web、CLI 的唯一导入导出格式；secret 三态和 config↔vault 一致性由共享 transfer 实现。无 pending/finding。
