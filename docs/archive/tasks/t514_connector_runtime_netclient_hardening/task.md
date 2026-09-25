---
tid: "t514"
slug: "connector_runtime_netclient_hardening"
title: "连接器通用运行时与 NetClient 健壮性及契约"
status: "done"
branch: "t514_connector_runtime_netclient_hardening"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "3219e1164269617313ed7068d15382d879181764"
depends_on: ""
conflicts_with: ""
note: "审阅采纳项: A10, A11, A29, A30, A39-A42, A44, A61, A93, A96, A99, A103, A107, A109, A114, A122, A123, A128-A131, A134"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

- NetClient 与安全边界加固：
    1. `MAX_RESPONSE_BYTES` 下调至 10MB，读取流实时统计并在超限时立即 destroy 流且抛错，避免内存全量拼接（A10）。
    2. 非 2xx 响应处理：4xx 客户端异常保留前 500B 脱敏片段注入错误文案用于诊断排障（A29）。
    3. 超时参数校验与配置：`<=0` 或非有限值回退全局默认，错误文案精确使用实际值（A61/A131）。
    4. `perform_request` 参数对象化，`log_prefix`/`error_log_label` 自动派生，统一抽离 `normalize_raw_headers` 并保留多值头为数组（A96/A103/A134）。
    5. 内部安全函数收敛至测试命名空间 `__test__`（A109）。
    6. 本地文件与目录安全：`files.read`/`files.list` 全量解析 `realpath` 防御软链与 TOCTOU 逃逸，`list_dir_recursive` 并发化并在 5000 项安全截断（A11/A114）。
    7. ADR 035 写入 `docs/blueprint/decisions.md`（A130）。
- Probe 与运行时错误治理：
    1. `probe-executor` 在空 headers 或空推导时抛出明确异常并计入 failed_accounts（A30），多头首胜记 debug 日志（A44）。
    2. 错误分类与短路：定义 `NonRetryableError` 与 `is_non_retryable_error`，4xx（排除 408/429）与语法/编译错误在调度器短路放弃剩余重试（A40/A42）。
    3. `runtime.ts` 顶层 catch 记录脱敏后的调用栈（A39）。
    4. 冷却机制按 `${manifest.id}:${ctx.instance_id}` 隔离，杜绝同一连接器的多账号实例误伤（A93）。
    5. Observation 校验接入 fast-path 优先机制，减轻大规模 safeParse 压力（A122）。
- 缓存与工具库收敛：
    1. `script-cache` 接入 LRU(50) 淘汰与并发 `inflight` Promise 去重（A123）。
    2. `ConnectorContext` 注入统一工具函数 `ctx.util`，并对多个连接器中的重复私有计算代码完成收敛委托（A99）。
    3. 连接器外部边界支持 zod safeParse 校验防御（A128）。
    4. manifest provider 权威源明确（A129）。

## Review 处置

### Round 1 (2026-09-25 15:15 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t514_code_f001|important|已修|HttpOpts 支持 schema 参数并在 net-client 自动执行 safeParse 拦截，grok_bot 接入|src/main/core/connector/net-client.ts:500|
|t514_code_f002|important|已修|cpa/claude/glm/kimi/opencode_go/tavily 等连接器私有重复工具收敛委托至 ctx.util|connectors/cpa/connector.ts:40|
|t514_code_f003|important|已修|refresh-service.ts 保留原始错误对象传给 is_non_retryable_error，短路重试生效|src/main/core/scheduler/refresh-service.ts:529|
|t514_code_f004|important|已修|is_fast_valid_observation 补全 reset_at/last_error/非空标签等全部严格约束校验|src/main/core/connector/runtime.ts:185|
|t514_code_f005|minor|已修|manifest-loader.ts 明确以 manifest 声明的 provider 为权威单一来源|src/main/core/connector/manifest-loader.ts:45|
|t514_test_f001|critical|已修|补充外部网络非规范 JSON 响应的 zod schema safeParse 校验防御拦截测试|tests/integration/connector/grok_bot_connector.test.ts:228|
|t514_test_f002|important|已修|补充 files.list 超过 5000 项安全截断与并发遍历集成测试|tests/integration/connector/net-client.test.ts:1129|
|t514_test_f003|important|已修|补充 4xx 不可重试错误单次执行即短路重试的调度器集成测试|tests/integration/scheduler/refresh-service.test.ts:1252|
|t514_test_f004|important|已修|移除 ctx.util 测试中的条件跳过语句，改为严格断言并覆盖连接器调用|tests/integration/connector/net-client.test.ts:1078|

### Round 2 (2026-09-25 15:25 UTC+8)

Round 2 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（包含 vitest 330 个测试套件，4026 passed, 8 skipped, 0 failed）全部通过
- 黑盒：覆盖大响应 abort、软链与超量截断、不可重试短路、多实例冷却隔离、共享工具与 zod safeParse 等全部行为
- review：Code Review PASS (Round 2), Test Review PASS (Round 2), overall=PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 完成 net-client 10MB 响应体限制与流式 abort、500B 脱敏排障、路径 realpath 与 5000 项遍历截断；完成不可重试错误短路、多实例冷却隔离、fast-path 校验、script-cache LRU(50) 与去重；连接器工具代码收敛到 ctx.util，并接入外部边界 zod safeParse 防御。全部 7 项 AC 通过审查。
