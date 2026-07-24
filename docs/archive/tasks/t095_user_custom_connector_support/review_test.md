# Task review t095（reviewer_focus: 测试）

- task：`t095_user_custom_connector_support`
- spec：`docs\tasks\t095_user_custom_connector_support\spec.md`
- diff_anchor：`15a7e27b9e6c90701fbd5630a8739e7180819536`
- target：`git diff 15a7e27b9e6c90701fbd5630a8739e7180819536`
- round：1
- reviewed_at：2026-07-24 07:13 UTC+8

## Findings

### t095_test_f001 - AC #3 renderer 未知 provider fallback 无测试覆盖

- 严重度：important
- 位置：`src/renderer/lib/provider-usage.ts:303`（`label: PROVIDER_LABELS[provider] ?? provider`）；缺失测试应在 `tests/unit/renderer/provider-usage.test.ts`
- 问题：spec AC #3「renderer 对未知 provider 显示 vendor mark fallback + provider 名作 label」对应实现 `PROVIDER_LABELS[provider] ?? provider`（provider-usage.ts:303）。本次 diff 12 个测试文件中无任何 renderer 层测试覆盖该 fallback：
    - `tests/unit/renderer/` 下所有断言用的 provider（claude / codex / glm / minimax / deepseek / firecrawl / mimo / opencode_go / kimi）全部在 `PROVIDER_LABELS` 已知名单内（provider-usage.ts:76-92）。
    - grep `tests/` 找不到 `custom_vendor` / `my_vendor` / `unknown_provider` / `acme` / `new_vendor` 作为 renderer 聚合层的输入；也找不到 `?? provider` / `group.label === provider` 之类断言。
    - 若把实现层 `?? provider` 删除（即 `label: PROVIDER_LABELS[provider]`），TS 因 `Record<string, string>` 仍编译通过（index signature 返回 `string` 非 `string | undefined`），runtime 返回 `undefined`，但**没有任何 renderer 测试会红**——AC #3 实质无防线。
    - `plan.md` 步骤 1 明确承诺「renderer 对未知 provider 显示 fallback mark + provider 名 label 不崩」红测，未兑现。
- 建议：在 `provider-usage.test.ts` 加一个 `build_provider_usage_groups` 用例：输入 connector 的 `activeProviders=["my_vendor"]` 且 item `provider="my_vendor"`（不在 `PROVIDER_LABELS` 内），断言 `groups[0]?.label === "my_vendor"`（fallback 到 provider 名）+ `groups[0]?.provider === "my_vendor"`。若 vendor mark fallback 还有独立信号（如 Icon 组件显式分支），一并覆盖。

## 结论

- 本轮新发现：1 条
- 总体判断：发现路径与红灯归因整体扎实——manifest-loader 新测试真调 `discover_connector_definitions` 并覆盖 regex 拒绝；observation-mapping / plugin-output 两处红灯改动均与 spec「开放命名空间」一致（源码侧已拆 filter / 放开 schema）；auth-ipc 去掉 `as unknown as UsageProvider` 与 schema 放开自洽；dot→bracket 访问纯属 index signature 引发的机械改写。但 AC #3 renderer fallback 路径完全无测，important 级阻塞信任。

verdict: FAIL

## Round 2 (2026-07-24 07:30 UTC+8)

### 前轮 finding 复核

- **t095_test_f001（已修）**：`tests/unit/renderer/provider-usage.test.ts` 新增 `describe("custom provider fallback (t095)")` 两个用例：
    1. `uses provider name as label when not in PROVIDER_LABELS`：以 `provider="my_vendor"`（不在 `PROVIDER_LABELS` 内）作 connector snapshot 唯一 item，调 `build_provider_usage_groups`，断言 `group?.label === "my_vendor"`。精确 `toBe`，非弱化。若删除实现层 `?? provider`（src/renderer/lib/provider-usage.ts:311），`PROVIDER_LABELS` 为 `Record<string, string>` 在运行时返回 `undefined`，`label` 字段变 `undefined`，本测试即红。防线有效。
    2. `sorts unknown providers after known ones`：同 `custom` + `known(deepseek)` 两 connector，调 `get_visible_providers`，断言 `custom_idx > known_idx`。对应 R1 code f001 的 `compare_providers` rank 映射修复（`-1 -> Number.POSITIVE_INFINITY`），若回退到 `indexOf(a) - indexOf(b)`，`my_vendor` 得 `-1`，`deepseek` 得正整数，`-1 < 正整数` -> custom 排前面 -> `custom_idx < known_idx` -> 断言红。防线有效。
    - 无换形式弱化：两用例均为行为断言（label 值 / 排序位置），非存在性或恒真。
    - vendor mark fallback（Icon.tsx:209 `VENDOR_MARKS[id] ?? VENDOR_MARKS["overview"]`）未单独测试，但 spec AC #3 的可观察核心是「provider 名作 label」+「不崩」，label 路径已覆盖；Icon fallback 属渲染细节，未进 finding。

### 本轮新发现

0 条。

### 总体判断

R1 f001 已实质修复（两用例断言精确、红线可复现）。其余 R2 测试 diff（observation-mapping 改为保留 custom_vendor、plugin-output 改为接受 custom_vendor、account-labels/overrides/settings_view 的 dot->bracket 机械改写、auth-ipc 去掉 `as unknown as UsageProvider`、hooks 类型 `UsageProvider` -> `string`）均与 spec「开放 provider 命名空间」自洽，无危险模式。AC #1（manifest-loader 自定义 provider 发现 + regex 拒绝非法字符）在 manifest-loader.test.ts 真调 `discover_connector_definitions` 覆盖；AC #2（任意 snake_case provider 被接受）在 plugin-output.test.ts 覆盖；AC #3（renderer fallback）在 provider-usage.test.ts 覆盖。测试可信、覆盖齐备。

verdict: PASS

## Round 3 (2026-07-24 19:25 UTC+8)

### 前轮 finding 复核

- **t095_test_f001（important，R1）— 仍已修**。`tests/unit/renderer/provider-usage.test.ts:1173-1222` 的 `describe("custom provider fallback (t095)")` 两用例（`uses provider name as label when not in PROVIDER_LABELS` / `sorts unknown providers after known ones`）与 R2 复核时一致，断言精确，红线可复现。无回退、无换形式弱化。

### R2→R3 代码侧 finding 对测试的影响

R2 code 侧新增 f003/f004 均为 minor，已处置：

- **t095_code_f003（observation-mapping JSDoc 文案）**：仅注释改动，无行为/类型/接口变化，不影响测试。
- **t095_code_f004（plugin-metadata.supportedProviders 收窄为 `z.array(connectorProviderSchema)`）**：`src/shared/schemas/plugin-metadata.ts:53`。核对 `tests/` 下对 `supportedProviders` 的引用（11 文件 73 处，含 `connector-ipc.test.ts`、`add_account_dialog.test.tsx`、`cpa_connector_settings.test.tsx`、`provider-usage.test.ts` 等），全部使用已知合法 provider 名（`claude`/`deepseek`/`kimi`/`mimo`/`glm`/`codex`/`antigravity` 等），无任何用例构造非法字符串去命中 supportedProviders 的 regex。schema 收窄为 snake_case 约束是防御性一致性修复，spec 未列「supportedProviders 拒绝非 snake_case」AC，无需新增测试。manifest-loader.test.ts 第二用例已通过 manifest 层的 `connectorProviderSchema` regex（`acme Corp` 被拒绝）覆盖 snake_case 不变量证据。

### 本轮新发现

0 条。

### 总体判断

diff_anchor 未变，测试侧无新增改动。R1 f001 修复稳定；R2 code f003/f004 修复均不引入测试负债；12 个测试文件在 R1/R2 已扫尽，危险模式扫描无新命中。`provider-usage.test.ts:42` 的 `PROVIDER_LABELS[provider]?.length` 改写属 TS strict 下 Record index signature 的机械防御性改写，前置 `expect(PROVIDER_LABELS[provider]).toBeDefined()` 已锁住 undefined 路径，未弱化断言。AC #1/#2/#3 测试覆盖稳定，测试侧终检 PASS。

verdict: PASS

## Round 4 (2026-07-24 23:50 UTC+8)

### 终检上下文

用户加轮 max_review_round=3 后的终检轮。R3 code 侧 f005（use_tab_navigation setActiveTab 类型签名补 `string`）属于源码层类型补全，不引入测试负债，R3 测试侧已说明。本轮复核 diff_anchor 仍为 `15a7e27b9e6c90701fbd5630a8739e7180819536`，HEAD 即此 commit（t095 改动均在工作区未提交），相对 diff 与 R1/R2/R3 完全一致：12 文件 175+/36-。

### 前轮 finding 复核

- **t095_test_f001（important，R1）— 仍已修**。`tests/unit/renderer/provider-usage.test.ts:1173-1222` 的 `describe("custom provider fallback (t095)")` 两用例（`uses provider name as label when not in PROVIDER_LABELS` / `sorts unknown providers after known ones (fallback to end)`）与 R3 一致：
    - 第 1 用例：`provider="my_vendor"`（不在 `PROVIDER_LABELS` 内），`group?.label` 断言 `toBe("my_vendor")`，精确等值。若删除实现层 `PROVIDER_LABELS[provider] ?? provider`（src/renderer/lib/provider-usage.ts），TS 因 `Record<string, string>` 编译通过但 runtime 返 `undefined`，断言红。防线有效。
    - 第 2 用例：`get_visible_providers([custom, known])` 断言 `custom_idx > known_idx`（`my_vendor` 排 `deepseek` 之后）。对应 R1 code f001 rank 映射 -1→+∞，回退则断言红。防线有效。
    - 无换形式弱化：两用例均为行为断言（label 值 / 排序位置），非存在性或恒真。

### 危险模式扫描（全 diff 终检）

`git diff 15a7e27b9e6c90701fbd5630a8739e7180819536 -- tests/ | grep '^\+'` 扫 `.skip`/`.only`/`@ts-ignore`/`eslint-disable`/`type: ignore`/`// expect`/`expect(true)` 全无命中。删除/反转 expect 扫描：

- `observation-mapping.test.ts`：`expect(items).toHaveLength(1)` → `toHaveLength(2)`，**强化**（旧实现 drop unknown，新实现 trust manifest，AC #2 要求保留）。测试名同步改 `drops observations with an invalid provider` → `keeps observations with an unknown provider (t095: mapping trusts manifest)`，归因为「规格变了」。
- `plugin-output.test.ts`：`expect(result.success).toBe(false)` → `toBe(true)`，**反转**但有归因：AC #2 明确要求「manifest provider 为任意 snake_case 字符串均被接受」，原 `rejects cpa provider` 是 enum 时代遗留测试，schema 放开后该断言违反 spec。测试名同步改 `rejects cpa provider` → `accepts arbitrary snake_case provider (t095 open namespace)`。归因合法，红灯归因记录到位。
- 其余 9 文件删除的 expect 全部为 dot→bracket 访问改写（`r.glm?.["default"]` → `r["glm"]?.["default"]` 等），TS 严格模式下 `Record<UsageProvider, …>` → `Record<string, …>` 触发的机械改写，断言语义不变。

### AC 覆盖终核

- **AC #1（userData/connectors/my_vendor/ 自动发现 + seed）**：`manifest-loader.test.ts` 真调 `discover_connector_definitions(builtin, user)`，覆盖 custom 发现 + 非法字符 regex 拒绝。
- **AC #2（任意 snake_case provider 被接受）**：`plugin-output.test.ts` 断言 `custom_vendor` 被 schema 接受；`observation-mapping.test.ts` 断言 unknown provider 观测保留；`observation_mapping_error.test.ts` 断言 `observation_to_metric_record` 对 `my_vendor` 返回非 null 且 provider 透传。
- **AC #3（renderer fallback）**：`provider-usage.test.ts` 两用例覆盖 label fallback + 排序 fallback。
- AC #4（文档）/ AC #5（pnpm 三绿）非测试 reviewer 职责。

### 本轮新发现

0 条。

### 总体判断

R4 为终检轮，diff_anchor 未变、12 文件测试 diff 与 R3 完全一致。R1 f001 修复稳定且防线有效；observation-mapping / plugin-output 两处测试反转均有 spec 归因，非无因改测；dot→bracket 改写为 TS strict 下 Record index signature 触发的机械改写，断言语义不变；危险模式扫描无命中。AC #1/#2/#3 测试覆盖完整可信，测试侧终检 PASS。

verdict: PASS
