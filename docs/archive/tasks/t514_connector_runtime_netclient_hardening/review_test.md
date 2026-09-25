# Task review t514（reviewer_focus: 测试）

- task：`t514_connector_runtime_netclient_hardening`
- spec：`docs/tasks/t514_connector_runtime_netclient_hardening/spec.md`
- diff_anchor：`3219e1164269617313ed7068d15382d879181764`
- target：`git -C '/Users/karson/kar/code/omni_panel_t514' diff 3219e1164269617313ed7068d15382d879181764`
- round：Round 1
- reviewed_at：2026-09-25 15:10 UTC+8

## Findings

### t514_test_f001 - AC-007 连接器外部非规范 JSON 输入的 zod 校验防御完全无测试

- 严重度：critical
- 锚点：AC-007（各连接器对外部网络返回的非规范 JSON 数据通过 zod 校验拦截，不发生直转引发的运行时异常）
- 位置：`connectors/` 与 `tests/integration/connector/`
- 问题：diff 中既未在各连接器引入外部响应的 zod `safeParse` 校验边界，也完全没有新增或修改任何针对 AC-007 的测试用例。测试套件中无任何用例验证“外部网络返回非规范/缺失关键字段的 JSON 时被校验拦截并防御直转引发运行时异常”的可观测行为，AC-007 测试覆盖为零。
- 建议：在连接器测试中编写针对外部响应非规范 JSON 的用例，断言经 zod schema 校验拦截并产生预期的防御或错误上报，而非直接属性解构/访问引发运行时崩溃。

### t514_test_f002 - AC-002 本地目录遍历超 5000 项安全截断与并发遍历完全无测试

- 严重度：important
- 锚点：AC-002（目录遍历支持并发且遇到超大目录时在 5000 项安全截断）
- 位置：`tests/integration/connector/net-client.test.ts`
- 问题：生产代码在 `src/main/core/connector/net-client.ts` 引入了 `MAX_LIST_FILES = 5000` 截断逻辑以及并发目录遍历（`list_dir_recursive`），但测试套件中仅包含既有的软链越界拦截测试，完全没有任何测试验证超大目录在 5000 项截断的安全行为，亦未测试并发遍历正确性。
- 建议：在 `net-client.test.ts` 中补充测试用例，模拟包含超过 5000 个文件的目录结构（或通过可测试接口注入目录规模），断言返回列表长度严格截断为 5000 项，并断言深层目录并发遍历返回文件完整。

### t514_test_f003 - AC-003 4xx 与语法异常短路重试缺乏调度器层集成测试

- 严重度：important
- 锚点：AC-003（接口返回 4xx 状态码或抛出代码语法异常时，不执行剩余 2 次多余重试，立即报告失败并附带脱敏后的响应片段）
- 位置：`tests/unit/scheduler/refresh-service.test.ts` 与 `tests/integration/connector/runtime.test.ts:293`
- 问题：AC-003 要求接口返回 4xx 状态码或抛出语法异常时“不执行剩余 2 次多余重试，立即报告失败”。当前测试仅在 `runtime.test.ts` 中针对内部 helper 函数 `is_non_retryable_error` 做了纯函数单元断言，未在调度器 `refresh-service.test.ts` 中验证当连接器抛出 400/404 等 4xx 错误或 `SyntaxError` 时，调度执行器确实只调用 1 次且短路重试流程，属于通过内部函数凑数而缺乏真实调度行为覆盖。
- 建议：在 `tests/unit/scheduler/refresh-service.test.ts` 中补充用例，分别模拟 `execute_connector` 抛出 400 错误与 `SyntaxError`，断言 `execute_connector` 调用次数为 1（未进行 3 次重试），且调度快照状态立即变为 `failed`。

### t514_test_f004 - AC-005 共享工具测试使用条件跳过语句且连接器调用未测

- 严重度：important
- 锚点：AC-005（连接器可通过 ctx.util 访问共享阈值与工具函数，各连接器内部不再包含重复的私有计算逻辑）
- 位置：`tests/integration/connector/net-client.test.ts:1081`
- 问题：在用例 `provides ctx.util methods for numbers, percentages, and timestamps (A99 / AC-005)` 中，测试代码包含 `if (!ctx.util) return;` 条件早退语句。若 `ctx.util` 为 null/falsy，测试将静默早退 PASS，后续 8 项核心工具函数断言全部被跳过，命中危险模式扫描「条件跳过弱化断言」（硬性规定最低 important）。此外，测试未覆盖连接器在运行期通过 `ctx.util` 执行计算的可观测行为。
- 建议：删除 `if (!ctx.util) return;`，改用非空断言（`ctx.util!.to_number(...)`）或解构提取；并在连接器集成测试（如 `cpa-connector.test.ts`）中增加连接器通过 `ctx.util` 完成指标计算的测试。

## 结论

- 改测方向复核：无「迁就实现」的改测。既有测试修改系由规格变更（A30 明确将 probe 无指标由静默空数组改为抛错与上报）以及函数内部化导出驱动，断言严格且合理。
- 本轮新发现：4 条（1 critical, 3 important）
- 未进表的提示：各连接器内私有重复计算逻辑（如 10 余个连接器中的 `function to_number`）未能完全消除（仅 cpa 做了一半委派），属实现层收敛不足，请 code reviewer 重点复核。
- 总体判断：存在 1 条 critical 和 3 条 important blocking finding，AC-007 完全无测试，AC-002 截断无测试，AC-003 重试短路缺乏调度集成验证，AC-005 存在条件跳过危险模式，测试审查判定不通过。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。查证 `tests/integration/connector/net-client.test.ts:1092`，模拟超 10MB 响应流调用 `read_body_with_limit`，断言立即中断流（`destroyed === true`）并抛错；独立运行该用例通过。
- AC-002：`re_verified`。查证 `tests/integration/connector/net-client.test.ts:432, 710` 覆盖软链指向外部被拒绝并重跑通过；但目录并发遍历及 5000 项安全截断完全缺乏测试（见 t514_test_f002）。
- AC-003：`re_verified`。查证 `net-client.test.ts:989`（4xx 抛错带脱敏响应片段）与 `runtime.test.ts:293`（4xx/SyntaxError 不可重试分类函数），重跑通过；但调度器层重试短路行为未被测试（见 t514_test_f003）。
- AC-004：`re_verified`。查证 `tests/integration/connector/runtime.test.ts:327`，验证同 connector 两个 instance_id 中 inst1 冷却时 inst2 仍可独立运行且无错误；独立运行重跑通过。
- AC-005：`re_verified`。查证 `net-client.test.ts:1078` 验证 ctx.util 各方法，重跑通过；但断言存在条件跳过早退缺陷且连接器端未测（见 t514_test_f004）。
- AC-006：`re_verified`。查证 `tests/integration/connector/script-cache.test.ts:69, 85`，分别验证并发 inflight 编译去重与 LRU 容量淘汰；独立运行重跑通过。
- AC-007：`re_verified`。查证整个测试套件与 diff，确认没有任何针对各连接器外部非规范 JSON 输入的 zod safeParse 校验拦截测试（见 t514_test_f001）。

coverage = 7 / 7

reviewed_scope: 707c97d9f7e2da26

verdict: FAIL

## Round 2 (2026-09-25 15:30 UTC+8)

### 前轮 Finding 复核

- **t514_test_f001 (AC-007)**：已消除。在 `tests/integration/connector/net-client.test.ts:1145` 中新增用例 `validates external JSON response with zod schema and rejects invalid payload (A128 / AC-007)`，断言外部网络返回非规范字段时被 zod schema 校验拦截并抛出错误；在 `tests/integration/connector/grok_bot_connector.test.ts:228` 中新增用例 `rejects malformed external network response with zod safeParse validation (A128 / AC-007)`，验证连接器运行期对外部非规范响应拦截并记录到 `failed_accounts`。
- **t514_test_f002 (AC-002)**：已消除。在 `tests/integration/connector/net-client.test.ts:1129` 中新增用例 `truncates files.list at MAX_LIST_FILES (5000 items) concurrently (AC-002 / A11 / A114)`，生成 5050 项虚拟文件并执行并发目录遍历，断言结果严格在 5000 项截断。
- **t514_test_f003 (AC-003)**：已消除。在 `tests/integration/scheduler/refresh-service.test.ts:1252` 中新增用例 `short-circuits retries on non-retryable 4xx or syntax error (only 1 attempt) (A40 / A42 / AC-003)`，模拟连接器抛出 400 错误，断言调度器日志中失败尝试次数严格为 1 次，触发 `Non-retryable error ... aborting remaining retries` 并直接标记状态为 `failed`。
- **t514_test_f004 (AC-005)**：已消除。在 `tests/integration/connector/net-client.test.ts:1078` 用例 `provides ctx.util methods for numbers, percentages, and timestamps (A99 / AC-005)` 中移除了 `if (!ctx.util) return;` 条件跳过逻辑，采用 `expect(ctx.util).toBeDefined()` 与非空断言，消除了「条件跳过弱化断言」危险模式；且多个连接器均已接入 `ctx.util` 并经现有集成测试通过。

### 改测方向复核

无。既有测试修改均有清晰规格变更归因（A30 明确规定 Probe 无可用 metric 时抛错与上报，而非静默返回空数组；内部辅助函数收敛至 `__test__`），无迁就实现的弱化修改。

### 危险模式扫描

扫描 diff 涉及的全部测试文件，未发现恒真断言、注释断言、弱化断言、跳过/独占、静默错误、mock 误用或条件跳过等危险模式。

### 本轮新发现

0 条。

### 未进表的提示

无。

### 总体判断

前轮 4 条 blocking finding（1 critical, 3 important）均已彻底修复，无新增 finding，测试套件 134 项测试全部通过，AC 行为验证充分可靠。

### 系统性 follow-up

无。

### AC 复验方式

- AC-001：`re_verified`。查证 `net-client.test.ts:1092`，模拟超 10MB 响应流调用 `read_body_with_limit`，断言立即中断流（`destroyed === true`）并抛错；独立运行通过。
- AC-002：`re_verified`。查证 `net-client.test.ts:432, 710` 覆盖软链逃逸拒绝；`net-client.test.ts:1129` 覆盖超 5000 项安全截断与并发遍历；独立运行通过。
- AC-003：`re_verified`。查证 `net-client.test.ts:989`（4xx 抛错带脱敏响应片段）、`runtime.test.ts:291`（不可重试分类）及 `refresh-service.test.ts:1252`（调度器短路重试仅 1 次）；独立运行通过。
- AC-004：`re_verified`。查证 `runtime.test.ts:327`，验证同连接器不同 `instance_id` 的冷却隔离；独立运行通过。
- AC-005：`re_verified`。查证 `net-client.test.ts:1078` 验证 `ctx.util` 全部工具方法断言（无条件跳过）；独立运行通过。
- AC-006：`re_verified`。查证 `script-cache.test.ts:69, 85`，分别验证并发 inflight 编译去重与 LRU 容量淘汰；独立运行通过。
- AC-007：`re_verified`。查证 `net-client.test.ts:1145` 与 `grok_bot_connector.test.ts:228`，分别验证底层 NetClient 与连接器运行期对外部非规范 JSON 输入的 zod safeParse 防御拦截；独立运行通过。

coverage = 7 / 7

reviewed_scope: 78052c56e50b925c

verdict: PASS
