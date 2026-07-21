# Task review t039（reviewer_focus: 测试）

- task：`t039_grok_empty_observation_failure`
- spec：`docs\tasks\t039_grok_empty_observation_failure\spec.md`
- diff_anchor：`ad3048a`
- target：`git diff ad3048a`
- round：1
- reviewed_at：2026-07-22 16:30 UTC+8

## Findings

无。

## 覆盖与可信核对

### AC 1 — Grok billing 200 零有效指标时上报 failed_account

- 测试：`tests/integration/connector/grok_connector.test.ts:236` 「reports failed_account when billing 200 returns config with no usable usage fields」
- 输入构造：`http.get_json` 返回 `{ config: { productUsage: [] } }`（creditUsagePercent 缺失、productUsage 空），HTTP 200。准确复现 spec 描述的根因场景。
- 被测真实：通过 `run_connector(manifest, script, ctx)` 执行真实 `connectors/grok/connector.ts`（`readFile` 读源码后传入），不 mock 被测逻辑。mock 仅作用于 HTTP 边界（`get_json/post_json/get_raw`），合法。
- 断言：
    - `observations.length === 0` — 精确长度，非存在性。
    - `failed_accounts.length === 1` — 直击 AC 1。
    - `failed_accounts[0].provider === "grok"` — 精确值断言。
    - `failed_accounts[0].error` 匹配 `/usage/i` — 错误描述字段用正则避免脆性字符串耦合，实现侧文案 `"billing response has no usable usage fields"` 命中，合理。
- 与既有测试 `returns empty observations on billing API error`（401 路径）互补，区分「HTTP 错误」与「HTTP 200 但零指标」两类失败。

### AC 2 — 零观测零失败不得清空历史

- 测试：`tests/integration/scheduler/refresh-service.test.ts:156` 「does not clear history when script returns zero observations and zero failures (t039)」
- 被测真实：`createRuntimeStore()` 真实实例（非 mock），`createRefreshService` 真实实例。mock 仅作用于 `observationStore`（`vi.fn` 边界存根）、`vault`、`configStore`，均为系统边界，合法。
- 预置：`runtimeStore.updateState("deepseek-1", { status: "ready", items: [history_item], ... })`，即「上次成功快照」。随后 `service.refresh("deepseek-1", { force: true })`，脚本 `return [];`（零观测零 failed）。
- 断言：`(state as { items?: unknown[] }).items ?? []).toHaveLength(1)` — 直接验证 domain 不变量 2「不覆盖删除上次成功」的核心保护。若回归为 `ready + 空 items`，items.length === 0，测试会失败。
- prior 流转核对：`refresh-service.ts:232` 经 `last_success_snapshot` 从预置 ready 状态取出 `prior.items = [history_item]`；`refresh-service.ts:307` 分支命中后以 `prior.items` 回写，与断言一致。测试确实驱动了真实代码路径。

### AC 3 / AC 5

AC 3（设置页不显示"采集正常"）属 UI 层；AC 5（真实打包验证）属打包 smoke / E2E。本 task 测试改动范围为 connector 集成 + scheduler 集成，AC 3/5 不在本次测试改动范围，未对应测试不构成缺口。

## 危险模式扫描

逐条扫描，无命中：

- 恒真断言 / 纯存在性：无。所有断言均带具体值或长度。
- 删除/反转/注释 expect：无。纯新增测试。
- `.skip` / `.only`：无。
- `@ts-ignore` / `eslint-disable`：无。
- mock 误用：无。mock 仅作用于 HTTP / 存储 / vault / config 等系统边界；被测 connector 脚本与 refresh-service 均真实执行。
- 阈值掩盖：无 timeout / 重试放大。
- 条件跳过断言：无。
- 弱化断言：`toMatch(/usage/i)` 用于错误描述字段，不掩盖 AC 行为（failed_accounts.length 已精确断言）。

## 红灯归因

两个测试为新增（非改测试），无归因问题。新增测试自然进入 TDD 红→绿循环：实现未加 `report_failed_account` 调用则测试 1 红；未加 `零观测零失败保留 prior` 分支则测试 2 红。与 diff 中实现侧新增逻辑严格对应。

## 结论

- 本轮新发现：0 条
- 总体判断：两个测试覆盖 AC 1 与 AC 2 的核心保护，使用真实被测代码 + 合法边界 mock，断言精确且用户可观察，无危险模式，无覆盖退化。

verdict: PASS

## Round 2 (2026-07-22 02:10 UTC+8)

### 前轮 finding 复核

Round 1 为 0 finding，无项可复核。

### 本轮扫描范围

本轮相对 Round 1 新增一个测试：`tests/integration/scheduler/refresh-service.test.ts:204` 「marks failed when script reports failed_account and returns empty with no history (t039 f001)」。逐条扫描危险模式。

### 新增测试可信与覆盖核对

- **被测真实**：`createRuntimeStore()` 真实实例（非 mock），`createRefreshService` 真实实例。`make_store()` / `create_config_store` / `create_vault` 为系统边界存根。connector 脚本由 `tempDir/connector.js` 真实执行（`ctx.report_failed_account(...)` + `return []`），非 mock 被测逻辑。
- **代码路径驱动**：fresh `runtimeStore`（未预置 `updateState`）→ `getSnapshot` 返回 `{ status: "idle" }` → `last_success_snapshot` 返回 undefined → `prior === undefined` → 命中 `refresh-service.ts:321` 的 `else` 分支，写 `{ status: "failed", error: no_obs_error }`，`no_obs_error = failed_accounts[0]?.error` = `"billing no usage fields"`。断言精准对应该分支输出。
- **覆盖互补**：Round 1 test 2（`refresh-service.test.ts:156`）覆盖 `prior !== undefined` 分支（保留历史）；本 f001 test 覆盖 `prior === undefined` 分支（无历史 → failed）。两测试合拢覆盖 t039 新增 `items.length === 0` 分叉的两臂，无重叠。
- **AC 对应**：spec AC 1（connector 上报 failed_account）由 `grok_connector.test.ts:236` 直接覆盖；本 f001 test 覆盖 failed_account **经 refresh-service 流转到 failed 状态**的生产契约形状（spec 背景段描述的端到端后果），是 AC 3「设置页不再显示采集正常」的底层状态断言。

### 危险模式扫描

逐条扫描，无命中：

- **恒真 / 纯存在性**：无。`status === "failed"` 精确值断言。
- **删除/反转/注释 expect**：无。纯新增。
- **`.skip` / `.only`**：无。
- **`@ts-ignore` / `eslint-disable`**：无。
- **mock 误用**：无。mock 仅作用于 store / vault / config 边界；被测 connector 脚本与 refresh-service 均真实执行。
- **阈值掩盖**：无 timeout / 重试放大。
- **弱化断言**：`toMatch(/billing no usage fields/)` 用于 error 字段，子串内容具体且与脚本 `report_failed_account` 入参一致；Round 1 已对同类 error 断言模式放行。非弱化。
- **条件跳过弱化断言**（重点复核）：`if (state.status === "failed") { expect(state.error).toMatch(...) }` **非**危险模式。
    - 前一行 `expect(state.status).toBe("failed")` 为无条件门禁，status 不符即测试失败；
    - `if` 分支仅为 TypeScript 对 `ConnectorSnapshotState` discriminated union 的类型收窄以合法访问 `error` 字段（`types.ts:10-24`：仅 `failed` variant 含 `error`）；
    - 同模式在本文件多处复用（`:316-317` / `:802-811` / `:1560-1561`），为本测试文件既定约定；
    - 前置不满足时**不会**无证据 PASS——首行断言已强约束。

### 红灯归因

新增测试为新增（非改测试），无归因问题。实现侧 `else` 分支（`refresh-service.ts:321-328`）缺失则 status 不会被设为 failed，`expect(state.status).toBe("failed")` 红；error 未透传则 `toMatch` 红。测试与实现严格对应。

### 结论

- 前轮 finding 复核：无前轮 finding。
- 本轮新发现：0 条。
- 总体判断：新增 f001 test 覆盖 t039 新逻辑的 `prior === undefined` 分支，与 Round 1 test 2 互补；真实被测 + 合法边界存根；`if (status === "failed")` 为 TS 类型收窄非断言弱化；无危险模式，无覆盖退化。

verdict: PASS
