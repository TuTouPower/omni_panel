# Task review t513（reviewer_focus: 测试）

- task：`t513_opencode_muse_connectors_upgrade`
- spec：`docs/tasks/t513_opencode_muse_connectors_upgrade/spec.md`
- diff_anchor：`4bd77fa81393da8382018ab23107d570fa7deaf5`
- target：`git -C '/Users/karson/kar/code/omni_panel_t513' diff 4bd77fa81393da8382018ab23107d570fa7deaf5`
- round：1
- reviewed_at：2026-09-25 14:40 UTC+8

## Findings

### t513_test_f001 - OpenCode Go monthly 指标重置时间（resetsAt）完全缺失测试覆盖

- 严重度：important
- 锚点：违反 AC-003（“OpenCode Go monthly 指标重置时间正确对应到 resetsAt 字段”）
- 位置：`tests/integration/connector/opencode_go_connector.test.ts:48-130, 207-288`
- 问题：在生产代码 `connectors/opencode_go/connector.ts:272-273` 中，monthly 重置时间取值逻辑已优先取 `meters.month?.resetsAt`，回退取 `go_status.access.endsAt`。然而在测试套件中：
  1. 现有集成测试（`opencode_go_connector.test.ts:48-130`）的 mock 数据中 `meters.month` 节点未包含 `resetsAt` 字段，且测试断言（第 122-129 行）仅断言了 `raw_label`/`normalized_label`/`used`/`limit`/`display_style`，完全未对 `reset_at` 字段作任何断言。
  2. diff 中新增的 4 个测试用例中没有任何一个测试提供了 `meters.month.resetsAt`，亦无任何测试断言 `monthly` 观察对象的 `reset_at` 能够正确映射为该字段解析后的时间戳。
  AC-003 为明确的行为验收标准，当前测试套件对此完全零覆盖。若实现将 `resetsAt` 错拼或时间戳解析异常，测试套件仍将假阳性全部通过。
- 建议：在 `tests/integration/connector/opencode_go_connector.test.ts` 中补充针对 AC-003 的测试用例（或增强现有测试），提供包含 `resetsAt: "2026-10-01T00:00:00.000Z"` 的 `meters.month` mock 数据，并显式断言 monthly 观察对象的 `reset_at` 字段精确等于该 ISO 时间对应的毫秒时间戳（`1790812800000`）。

### t513_test_f002 - Muse CRLF 注入防御测试未断言“拒绝发送网络请求”可观测行为

- 严重度：minor
- 锚点：AC-007 断言充分性（“Muse 凭据检测到含有 `\r` 或 `\n` 时拒绝发送网络请求并报错”）
- 位置：`tests/integration/connector/muse_connector.test.ts:164-173`
- 问题：测试 `rejects cookie with CRLF injection characters (A48 / AC-007)` 仅断言了 `expect(result.error).toMatch(/CRLF/)` 与 `expect(result.observations).toHaveLength(0)`，未断言网络 mock 函数（`ctx.http.get_raw` 与 `ctx.http.post_raw`）未被调用。尽管实现中 `required_cookie()` 在主流程最前部同步抛出 Error 阻断了执行，但缺乏对 HTTP 客户端未被调用的显式断言，降低了对 AC-007 中“拒绝发送网络请求”这一关键动作的验证确定性。
- 建议：在测试用例中显式补充断言：`expect(ctx.http.get_raw).not.toHaveBeenCalled();` 及 `expect(ctx.http.post_raw).not.toHaveBeenCalled();`。

## 结论

- 改测方向复核：本轮在 `tests/integration/connector/muse_connector.test.ts` 的 `context()` 中为 `ctx.http.get_raw` 补充了默认 mock 返回，系适配 Muse 动态提取页面 ID 所需的前置依赖，原有断言预期未被修改或弱化；无迁就实现的改测。
- 本轮新发现：2 条（1 条 important，1 条 minor）
- 未进表的提示：
  - AC-002 覆盖范围扩展：当前 `skips metric when limit is <= 0 instead of faking 0%` 仅覆盖了 `limitMicroCents: "0"`，建议后续可增补 `limitMicroCents` 字段缺失（undefined）或为非数值字符时的边缘 case 覆盖。
  - AC-006 动态 ID 测试：主流程测试 `parses RSC response...` 中 HTML mock 内嵌的 ID 字符串与历史硬编码值相同，后续建议可替换为随机或特征动态 ID 以更直观证明提取逻辑生效。
- 总体判断：AC-003（OpenCode Go monthly 指标重置时间对应到 resetsAt 字段）完全缺失测试覆盖与断言，存在 1 项阻断性缺口（important），判定 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查证 `opencode_go_connector.test.ts` 中 `throws session expired error...`（第 132、192 行），覆盖 401 抛错并验证了会话失效文案。
- AC-002：`re_verified`，查证 `opencode_go_connector.test.ts` 第 207 行测试，验证 limit=0 时指标被跳过且触发 `ctx.warn_spy` 警告日志。
- AC-003：`re_verified`，查证测试套件，确认当前完全缺失针对 `meters.month.resetsAt` 对应至 `monthly.reset_at` 的测试用例与断言（见 finding t513_test_f001）。
- AC-004：`re_verified`，查证 `opencode_go_connector.test.ts` 第 150 行（多 org 隔离采集）与第 246 行（跨轮询周期 1h TTL 缓存 memo），测试断言真实有效且运行通过。
- AC-005：`re_verified`，查证 `muse_connector.test.ts` 第 175 行测试，验证缺失 percentUsed 时上报 `failed_accounts` 且不生成指标。
- AC-006：`re_verified`，查证 `muse_connector.test.ts` 第 147 行测试（提取失败抛出 `MUSE_ACTION_STALE`）与第 108 行断言（动态提取 ID 正确注入请求头），测试运行通过。
- AC-007：`re_verified`，查证 `muse_connector.test.ts` 第 164 行测试，验证检测到 CRLF 时拒绝并报错，但缺少网络未调用的显式断言（见 finding t513_test_f002）。

coverage = 7 / 7 (100%)

reviewed_scope: 740659cb1e17e442

verdict: FAIL

## Round 2 (2026-09-25 15:00 UTC+8)

### 前轮 finding 复核

- **t513_test_f001**（important，OpenCode Go monthly 指标重置时间 resetsAt 完全缺失测试覆盖）：**已消除**。`tests/integration/connector/opencode_go_connector.test.ts` 第 132-163 行补充了独立用例 `maps monthly resetsAt to observation resets_at when present (A57 / AC-003)`，显式 mock 了 `meters.month.resetsAt: "2026-10-01T00:00:00.000Z"`，并强断言 observation 的 `reset_at` 严格等于解析后的时间戳 `1790812800000`。
- **t513_test_f002**（minor，Muse CRLF 注入防御测试未断言“拒绝发送网络请求”可观测行为）：**已消除**。`tests/integration/connector/muse_connector.test.ts` 第 164-179 行用例 `rejects cookie with CRLF injection characters (A48 / AC-007)` 中显式注入 spy 并补充断言 `expect(get_raw).not.toHaveBeenCalled();` 与 `expect(post_raw).not.toHaveBeenCalled();`，完整覆盖了 AC-007 拒绝发送网络请求的行为。

### 改测方向复核

无（仅在 test helper `context()` / `make_ctx()` 中为动态 ID 拉取与测试隔离设置了兼容默认值与 afterEach 清理，未改动任何既有测试的断言预期；无迁就实现的改测）。

### 本轮新发现

无（0 条）。

### 未进表的提示

无。

### 总体判断

前轮 1 项阻断性缺口（t513_test_f001，important）与 1 项断言充分性建议（t513_test_f002，minor）均已彻底修复，测试覆盖真实触达全部 7 项 AC 契约，断言严格且可信，无危险模式，判定 PASS。

### 系统性 follow-up

无。

### AC 复验方式

- AC-001：`re_verified`，查证 `opencode_go_connector.test.ts` 第 132、192 行测试，覆盖 401 抛错并验证了会话失效文案。
- AC-002：`re_verified`，查证 `opencode_go_connector.test.ts` 第 207 行测试，验证 limit=0 时指标被跳过且触发 `ctx.warn_spy` 警告日志。
- AC-003：`re_verified`，查证 `opencode_go_connector.test.ts` 第 132 行新用例，验证 `meters.month.resetsAt` 正确映射为 observation 的 `reset_at` 时间戳。
- AC-004：`re_verified`，查证 `opencode_go_connector.test.ts` 第 150 行（多 org 隔离采集）与第 246 行（跨轮询周期 1h TTL 缓存 memo），测试断言真实有效且运行通过。
- AC-005：`re_verified`，查证 `muse_connector.test.ts` 第 175 行测试，验证缺失 percentUsed 时上报 `failed_accounts` 且不生成指标。
- AC-006：`re_verified`，查证 `muse_connector.test.ts` 第 147 行测试（提取失败抛出 `MUSE_ACTION_STALE`）与第 108 行断言（动态提取 ID 正确注入请求头），测试运行通过。
- AC-007：`re_verified`，查证 `muse_connector.test.ts` 第 164 行测试，验证检测到 CRLF 时拒绝并报错，且断言 get_raw / post_raw 均未被调用。

coverage = 7 / 7 (100%)

reviewed_scope: 26928818f0aad6ef

verdict: PASS
