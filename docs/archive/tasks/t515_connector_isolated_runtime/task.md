---
tid: "t515"
slug: "connector_isolated_runtime"
title: "连接器隔离运行时架构迁移与内置清单校验"
status: "done"
branch: "t515_connector_isolated_runtime"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "522ae58667804923c2a484792be1027322063682"
depends_on: "t514"
conflicts_with: ""
note: "审阅采纳项: A143 (原 D2)"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

- 隔离执行器与 IPC 协议架构：
  1. 新增 `src/main/core/connector/worker/connector-worker-entry.ts` 作为独立子进程/utilityProcess 隔离执行入口。
  2. 新增 `src/main/core/connector/isolated-process-runner.ts` 管理子进程生命周期、结构化 IPC 参数传递、崩溃自动捕获与看门狗超时 SIGTERM + SIGKILL 终止，彻底杜绝连接器拖垮主进程（AC-002）。
  3. 生产刷新调度器 `refresh-service.ts` 的 `execute_connector` 正式接入 `run_connector_isolated`，生产环境连接器真正运行于独立隔离进程（AC-004）。
- 完整性校验与外部连接器策略控制：
  1. 新增 `src/main/core/connector/connector-integrity.ts`，支持计算连接器 SHA-256 哈希并在 `discover_connector_definitions` 启动时自动建立并校验基线清单，篡改即拒绝并记录安全告警（AC-001）。
  2. `AppConfiguration` 与 `DEFAULT_CONFIGURATION` 增加 `allowUserConnectors`（默认 `false`），未显式信任时严格跳过外部用户目录连接器（AC-003）。
  3. 更新 `docs/blueprint/architecture.md` 边界规范与 `docs/blueprint/decisions.md` ADR 036。

## Review 处置

### Round 1 (2026-09-25 15:45 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t515_code_f001|critical|已修|生产刷新调度 execute_connector 正式接入 run_connector_isolated|src/main/core/scheduler/refresh-service.ts:223|
|t515_code_f002|critical|已修|discover_connector_definitions 默认加载内置连接器基准清单进行比对校验|src/main/core/connector/manifest-loader.ts:91|
|t515_code_f003|important|已修|AppConfiguration 与 DEFAULT_CONFIGURATION 接入 allowUserConnectors 信任开关|src/shared/types/config.ts:43|
|t515_code_f004|important|已修|isolated-process-runner.ts 超时增加 SIGKILL 兜底强制终结死循环子进程|src/main/core/connector/isolated-process-runner.ts:63|
|t515_code_f005|minor|已修|测试用 crash 脚本规范化处置|src/main/core/connector/worker/connector-worker-entry.ts:35|
|t515_code_f006|minor|已修|校验失败原因包含完整文件名及哈希截断排障信息|src/main/core/connector/connector-integrity.ts:60|
|t515_code_f007|minor|已修|消除未调用死函数隐患，generate_builtin_integrity 正式作为启动基线生成源|src/main/core/connector/manifest-loader.ts:91|
|t515_code_f008|minor|已修|规范 ts 类型中的 exactOptionalPropertyTypes 兼容声明|src/main/core/connector/isolated-process-runner.ts:16|
|t515_test_f001|critical|已修|AC-004 真实创建 SQLite 观测数据库并强断言入库，37 个调度测试全部在隔离子进程中跑通|tests/integration/connector/isolated-process-runner.test.ts:215|
|t515_test_f002|important|已修|补充 discover_connector_definitions 结合完整性清单剔除被篡改连接器的集成测试|tests/integration/connector/isolated-process-runner.test.ts:68|
|t515_test_f003|important|已修|补充子进程 OOM 内存溢出韧性测试，断言主进程保持健康|tests/integration/connector/isolated-process-runner.test.ts:195|

### Round 2 (2026-09-25 16:10 UTC+8)

Round 2 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（包含 vitest 331 个测试套件，4037 passed, 8 skipped, 0 failed）全部通过
- 黑盒：覆盖 SHA-256 完整性清单拒绝、外部目录信任策略开关、子进程崩溃与死循环超时终结、子进程 OOM 韧性及数据库真实入库
- review：Code Review PASS (Round 2), Test Review PASS (Round 2), overall=PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 连接器隔离运行时架构迁移与内置清单校验全量完成。生产环境连接器统一运行于独立子进程中，崩溃与死循环对主进程零影响；内置连接器加载前校验 SHA-256 完整性；外部目录连接器默认禁用；全部 4 项 AC 通过双盲审查。
