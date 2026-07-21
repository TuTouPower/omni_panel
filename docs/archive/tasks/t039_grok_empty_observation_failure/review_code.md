# Task review t039（reviewer_focus: 代码）

- task：`t039_grok_empty_observation_failure`
- spec：`docs\tasks\t039_grok_empty_observation_failure\spec.md`
- diff_anchor：`ad3048a`
- target：`git diff ad3048a`
- round：1
- reviewed_at：2026-07-22 17:10 UTC+8

## Findings

### t039_code_f001 - refresh-service 新分支条件漏盖 spec 主场景（Grok 新账号仍 ready+空 items）

- 严重度：critical
- 位置：`src/main/core/scheduler/refresh-service.ts:307`
- 问题：新分支条件为 `items.length === 0 && failed_accounts.length === 0`，但 spec 主场景（新账号 + Grok billing 200 无有效字段）在 connector 修复**后**的返回是 `observations=[]` + `failed_accounts=[{grok}]`（connector 测试 `tests/integration/connector/grok_connector.test.ts:257` 断言 `failed_accounts.toHaveLength(1)`）。
  生产路径追踪（新 Grok 账号，`observationStore` 无历史）：
    1. connector：`report_failed_account("grok", ...)` + `return []`（`connectors/grok/connector.ts:127-134`）。
    2. `execute_connector` 返回 `{ observations: [], failed_accounts: [grok-failed] }`（`runtime.ts:156` 收集）。
    3. `refresh-service.ts:275` 的 `failed_accounts.length > 0` 块进入，但 `observationStore.list_by_source_instance_id(instanceId)` 为空（新账号）→ `stale_observations` 仍为 `[]`。
    4. `items = observations_to_ready_state([]).items = []`（`refresh-service.ts:298`）。
    5. **新分支判定 `items.length === 0 && failed_accounts.length === 0` → `true && false` → false**（`failed_accounts.length === 1`）→ 不进入。
    6. 命中 `refresh-service.ts:329-333`，写 `status: "ready", items: [], updatedAt: now` —— 即 spec 背景描述的原 bug。
       后果：spec AC「真实打包启动验证：Grok 场景下主面板展示失败状态而非'暂无账号'」对新账号不成立；`SettingsView.tsx:180` `status === "ready" → "正常"`，AC「设置页不再显示'采集正常'误导」对新账号也不成立。spec 范围项 1（「让 refresh-service 走 stale 保留 / failed 状态」）依赖 `failed_accounts.length > 0` 单独触发 stale/failed，但现有 stale 复制逻辑要求 `observationStore` 已有同 `account_id` 观测，新账号没有，故不触发。
       单元测试 `tests/integration/scheduler/refresh-service.test.ts:156` 用 `"return [];"` 脚本模拟零返回，该脚本不调 `report_failed_account` → `failed_accounts.length === 0` → 走新分支，测试绿。但生产 Grok connector 的契约是「`return []` + `report_failed_account`」，与此测试的形状不同，故测试通过不能证明生产场景已修。
- 建议：当 `items.length === 0` 时，无论 `failed_accounts.length` 多少，都不应写 ready+空 items。最小修法：把新分支条件改为 `if (items.length === 0)`（failed_accounts 非空时同样走「保留 prior 或标 failed」）。或为新分支之外补一个 `items.length === 0 && failed_accounts.length > 0 && stale_observations.length === 0` 的兜底，写 `status: "failed"` 或保留 prior lastSuccess。另补一个「`return []` + mock `report_failed_account`」形状的集成测试覆盖生产契约。

### t039_code_f002 - refresh-service.ts 已超 400 行阈值且本 task 仍净增

- 严重度：minor
- 位置：`src/main/core/scheduler/refresh-service.ts`
- 问题：`refresh-service.ts` ad3048a 时 418 行（已超实现源码 minor 阈值 400），本 task 净增 27 行至 445 行。`docs/blueprint/conventions.md` 无文件大小阈值覆盖。单文件继续承担：重试骨架、params 构造、connector 执行、failed_accounts stale 复制、零观测兜底、并发 refreshAll，职责偏多。
- 建议：后续 task 可拆 `execute_connector`/重试循环/failed_accounts 处理为独立模块。本 task 不强制拆分。

## 结论

- 本轮新发现：2 条（f001 critical、f002 minor）。
- 总体判断：connector 改动正确（零有效字段时 report_failed_account，不再静默），但 refresh-service 新分支条件 `failed_accounts.length === 0` 漏盖 spec 主场景——Grok 新账号走「`0 obs + 1 failed`」路径，新分支不触发，原 ready+空 items bug 仍存在；主面板「暂无账号」、设置页「采集正常」两个 AC 对该场景未达成。

verdict: FAIL

## Round 2 (2026-07-22 02:10 UTC+8)

### 前轮 finding 复核

#### t039_code_f001（critical）→ 已修

`src/main/core/scheduler/refresh-service.ts:309` 条件已从 `items.length === 0 && failed_accounts.length === 0` 改为 `if (items.length === 0)`，不再依赖 `failed_accounts` 是否为空。逐路径复算生产契约：

- 新 Grok 账号（observationStore 无历史）：connector `report_failed_account + return []` → `observations=[]`、`failed_accounts=[grok]` → line 275 块进入但 line 277 inner `prior`（`list_by_source_instance_id`）为空 → `stale_observations=[]` → line 298 `items=[]` → line 309 命中 → line 312 outer `prior`（line 232 `last_success_snapshot`）对新账号为 `undefined` → 写 `status:"failed"`、`error: failed_accounts[0]?.error`（= "billing response has no usable usage fields"）。spec AC「主面板展示失败状态而非'暂无账号'」「设置页不再显示'采集正常'」对新账号成立。
- 有历史的 Grok 账号突然零有效字段：line 275 块把旧观测以 stale 副本重插 → `stale_observations` 非空 → line 298 `items` 非空 → 不进新分支 → line 333 写 `ready` + 含 stale 的 items。domain 不变量 2（不覆盖删除）守住。
- 纯 `return []` + 零 failed_accounts + 有历史：line 309 命中 → outer `prior` 存在 → 写 `ready` + `prior.items`（历史保留）。
- 纯 `return []` + 零 failed_accounts + 无历史：line 309 命中 → outer `prior` `undefined` → 写 `failed` + `"connector returned no observations"`。

`no_obs_error = failed_accounts[0]?.error ?? "connector returned no observations"`（line 310-311）让 failed_accounts 非空时 error 更精确，空时兜底合理。

生产契约形状测试 `tests/integration/scheduler/refresh-service.test.ts`「marks failed when script reports failed_account and returns empty with no history (t039 f001)」用 `ctx.report_failed_account(...) ; return [];` 脚本覆盖 f001 指出的「`return []` + mock `report_failed_account`」形状，断言 `state.status === "failed"` 且 `state.error` 匹配 `/billing no usage fields/`。Round 1 指出的测试-生产契约形状错配已消除。

#### t039_code_f002（minor, 遗留）→ 不重审

按 Round 1 标注，本 task 不修。refresh-service.ts 418 → 449 行（+31），仍超 400 实现源码 minor 阈值；不影响 PASS。

### 本轮新发现

0 条。

扫描结论：

- 新分支与 line 275 stale 复制块、line 298 `items` 计算、line 333 正常 ready 写入的相对位置正确，early return 语义与原成功路径一致，未破坏重试循环。
- `prior` 在 line 312 引用的是 line 232 outer-scope `last_success_snapshot`（line 277 inner `prior` 块作用域于 line 296 结束），shape 为 `{items, updatedAt: string(ISO), ...}`，`prior.items` / `new Date(prior.updatedAt)` 合法且有意（反序列化 ISO string）。
- 三条失败/保留路径状态自洽：prior 存在 → ready + 旧 items；prior 缺 + failed_accounts 有 → failed + 具体 error；prior 缺 + failed_accounts 空 → failed + 通用 error。下次 refresh 的 `last_success_snapshot` 行为与本次一致（无漂移）。
- 日志、trace 风格与周边一致；无 swallowed error、无 DRY 违反、无命名误导。
- connector.ts:127-134 改动最小（仅零观测时上报），与 Round 1 一致，未变。

### 结论

- f001 真修（条件改为 `items.length === 0`，生产契约形状测试已补）。
- f002 遗留，不影响判定。
- 本轮新发现 0 条。

verdict: PASS
