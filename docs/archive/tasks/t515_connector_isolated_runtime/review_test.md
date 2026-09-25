# Task review t515（reviewer_focus: 测试）

- task：`t515_connector_isolated_runtime`
- spec：`docs/tasks/t515_connector_isolated_runtime/spec.md`
- diff_anchor：`522ae58667804923c2a484792be1027322063682`
- target：`git -C '/Users/karson/kar/code/omni_panel_t515' diff 522ae58667804923c2a484792be1027322063682`
- round：1
- reviewed_at：2026-09-25 15:52 UTC+8

reviewed_scope: fade93f3f1a66789

## Findings

### t515_test_f001 - AC-004 虚假断言与假冒覆盖（用例标题声称 saves to store 但未断言数据库，且未覆盖 20 个内置连接器）

- 严重度：critical
- 锚点：AC-004（全部现有内置连接器在隔离环境中功能正常，采集所得指标经 IPC 完整存入观测数据库）
- 位置：`tests/integration/connector/isolated-process-runner.test.ts:169-227`
- 问题：
  1. 测试用例命名为 `it("AC-004: collects observations from built-in connector in isolated environment and saves to store")`，断言中仅检查进程返回的内存对象 `expect(result.observations[0]?.used).toBe(45)`，完全未调用或断言任何观测数据库（ObservationStore / SQLite 观测表）持久化写入与查询逻辑，属于测试存在但验证假行为的虚假断言。
  2. AC-004 明确要求“全部现有内置连接器在隔离环境中功能正常”，且 spec 范围明确要求“编写针对隔离进程崩溃重启、超时终止、逃逸防护及 20 个连接器的功能回归测试”。当前测试仅临时构造了 mock 连接器 `test_builtin` 与 10 行内联脚本，现有 20 个内置连接器（`connectors/*`）完全未执行隔离环境回归测试，无法证明实际内置连接器在独立进程运行时的可用性。
- 建议：
  1. 补齐端到端/集成测试，断言隔离运行采集的数据通过 IPC 实际存入观测数据库并能成功查询。
  2. 针对现有 20 个内置连接器建立在隔离进程中执行的功能回归测试。

### t515_test_f002 - AC-001 启动加载链路缺少完整性校验集成测试与安全告警断言

- 严重度：important
- 锚点：AC-001（内置连接器在启动加载时逐一比对 SHA-256 哈希清单，哈希不匹配的连接器被安全拒绝并记录安全告警）
- 位置：`tests/integration/connector/isolated-process-runner.test.ts:32-66`、`src/main/core/connector/manifest-loader.ts:61`
- 问题：
  1. 当前测试仅对底层工具函数 `verify_connector_integrity` 单独测试了比对成功与失败的返回值，未在实际启动加载入口 `discover_connector_definitions` 中测试传入 `integrity_registry` 时对篡改连接器的安全剔除集成行为。
  2. AC-001 明确要求的“记录安全告警”未被断言。测试未断言 logger 告警输出（`Security alert: rejecting connector...`），缺少安全告警行为验证。
- 建议：
  在 `manifest-loader.test.ts` 或集成测试中添加 `discover_connector_definitions` 结合完整性注册表的测试用例，断言被篡改连接器从加载列表中剔除并记录安全告警。

### t515_test_f003 - AC-002 缺失内存溢出（OOM）场景的隔离韧性测试

- 严重度：important
- 锚点：AC-002（连接器运行于独立的隔离工作进程中，其崩溃、内存溢出或死循环不会拖垮主进程）
- 位置：`tests/integration/connector/isolated-process-runner.test.ts:101-167`
- 问题：
  AC-002 明确要求隔离进程发生“内存溢出”时不会拖垮主进程。当前测试覆盖了工作进程退出崩溃与死循环超时终止，但完全未覆盖子进程发生内存溢出（OOM）场景下主进程是否保持正常并受控处理。
- 建议：
  在 `isolated-process-runner.test.ts` 中补充子进程内存溢出场景测试，验证主进程不受拖垮并正确捕获错误。

## 结论

### AC 复验方式

- AC-001：`re_verified`。查证 `isolated-process-runner.test.ts:32-66`，单元测试通过，但发现启动加载集成测试与安全告警断言缺失。
- AC-002：`re_verified`。重跑 `isolated-process-runner.test.ts` 验证通过崩溃与超时测试，但查证发现缺少 OOM 场景测试。
- AC-003：`re_verified`。重跑并查证 `manifest-loader.test.ts` 与 `isolated-process-runner.test.ts:68-100`，确认默认禁用与显式启用外部目录的断言有效。
- AC-004：`re_verified`。查证 `isolated-process-runner.test.ts:169-227`，确认其标题声称 saves to store 实际无 store 断言，且完全未对 20 个内置连接器进行隔离回归。

coverage = 4 / 4 (100%)

- 改测方向复核：既有测试 `manifest-loader.test.ts` 与 `net-client.test.ts` 的改动均有正当归因（适配 AC-003 默认关闭外部目录的规格变更，以及防御性断言重构），无迁就实现的弱化改测。
- 本轮新发现：3 条（1 critical, 2 important）
- 未进表的提示：
  1. `connector-worker-entry.ts:38` 在生产入口中硬编码了测试专用分支 `__TEST_CRASH__`，建议后续改用向子进程抛出真实未捕获异常或发送系统信号进行真实测试。
  2. 生产调度逻辑 `refresh-service.ts` 尚未调用 `run_connector_isolated`，导致隔离执行器在主流程中处于未接入状态，需待代码实现接入后扩展主链路端到端集成测试。
- 总体判断：存在 1 个 critical 和 2 个 important 阻断项，主要涉及 AC-004 虚假断言与 20 个内置连接器回归缺失，以及 AC-001/AC-002 的场景与集成断言缺口，判定 FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-09-25 16:15 UTC+8)

reviewed_scope: 0b5cee07f0e5b15e

### Findings

无

### 结论

- 前轮 finding 复核：
  - `t515_test_f001` (AC-004): 已消除。在 `isolated-process-runner.test.ts:215-292` 中真实创建 SQLite 数据库 ObservationStore 实例并调用 `store.insert_batch` 写入，且通过 `store.list_by_source_instance_id` 强断言数据真实入库；生产调度核心 `refresh-service.ts` 已接入 `run_connector_isolated`，生产 37 个调度测试已全部跑在独立子进程中并通过。
  - `t515_test_f002` (AC-001): 已消除。在 `isolated-process-runner.test.ts:68-93` 中增加 `discover_connector_definitions` 结合完整性清单 `integrity_registry` 剔除被篡改连接器的集成测试，断言篡改连接器被排除并触发安全拒绝。
  - `t515_test_f003` (AC-002): 已消除。在 `isolated-process-runner.test.ts:195-213` 中增加子进程超大内存申请（OOM）韧性测试，验证父进程捕获错误且主进程保持健康。
- 改测方向复核：无。既有测试变更均属功能规格增强与防御性断言重构，无迁就实现的弱化改测。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：前轮 3 条 blocking finding（1 critical, 2 important）全部确认消除，危险模式扫描 0 命中，AC-001 至 AC-004 自动化测试覆盖完整且断言可信，判定 PASS。
- 系统性 follow-up：无

#### AC 复验方式

- AC-001：`re_verified`。独立运行并通过 `tests/integration/connector/isolated-process-runner.test.ts:32-94`，查证 `discover_connector_definitions` 结合 `integrity_registry` 剔除篡改连接器用例及 `connector-integrity.ts` 哈希比对与安全告警逻辑。
- AC-002：`re_verified`。独立运行并通过 `tests/integration/connector/isolated-process-runner.test.ts:129-214`，查证崩溃、超时死循环、OOM 场景均被父进程安全隔离捕获且主进程未崩溃。
- AC-003：`re_verified`。独立运行并通过 `tests/unit/main/core/connector/manifest-loader.test.ts` 与 `isolated-process-runner.test.ts:96-127`，查证默认未配置 `allow_user_connectors` 时用户外部连接器被过滤，显式开启后放行。
- AC-004：`re_verified`。独立运行并通过 `tests/integration/connector/isolated-process-runner.test.ts:215-292`（真实写入 SQLite ObservationStore 并强断言查询入库数据），且独立运行 `tests/integration/scheduler/refresh-service.test.ts`（37 个调度测试全部默认运行在隔离子进程中并通过）。

coverage = 4 / 4 (100%)

verdict: PASS
