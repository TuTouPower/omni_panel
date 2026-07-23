# Task review t066（reviewer_focus: 测试）

- task：`t066_connector_threshold_ctx_centralize`
- spec：`docs\tasks\t066_connector_threshold_ctx_centralize/spec.md`
- diff_anchor：`64a9ad17884e2080a92cd1aebee4cdf5f0283865`
- target：`git diff 64a9ad17884e2080a92cd1aebee4cdf5f0283865`
- round：1
- reviewed_at：2026-07-24 01:10 UTC+8

## Findings

无。

## 三项评估

### 1. helper 单测边界覆盖

`tests/unit/shared/connector-thresholds.test.ts` 三个 describe 分别锁三函数边界，全部命中 conventions.md 约定：

- `status_for_pct`：90 critical / 89.9 warning / 75 warning / 74.9 normal / 0 normal — 闭区间 `>=` 语义完整。
- `status_for_ratio`：90÷100=0.9 critical / 75÷100=0.75 warning / 74÷100=0.74 normal / limit=0 unknown / limit=-1 unknown — 正向 ratio 边界与 `limit<=0` 短路全覆盖。
- `status_for_balance`：10÷100=0.1 critical / 20÷100=0.2 warning / 21÷100=0.21 normal / limit=0 unknown — 反向 ratio（`<=`）边界完整。

三个函数的分支决策表均被锁死，`limit<=0` 提前返回 unknown 的短路路径在 ratio/balance 各覆盖一次。未发现漏边或边界 off-by-one。

### 2. mock 适配正确性

`tests/integration/connector/_ctx_status.ts` 直接把 `status_for_pct / status_for_ratio / status_for_balance` 三个**真实**实现装配成 `ctx.status` 形状（`as const`），未包 `vi.fn`、未替换行为、未简化返回值。mock 边界纪律正确：被测逻辑（helper 本身）不被 mock，只在外部 API/文件系统边界 mock。

19 个测试文件统一 `import { ctx_status }` 并在 `create_ctx` / `stub_ctx` / 内联 ctx 字面量里追加 `status: ctx_status`，形状与 `ConnectorContext` 新增的 `readonly status` 字段一致。runtime.test.ts 的共享 `stub_ctx` 常量、tier1-poll-executor.test.ts 的多处 ctx 构造点都覆盖到。无遗漏。

未触发任何危险模式：无 `expect(true).toBe(true)`、无删/反转/注释 expect、无 `.skip`/`.only`、无 `@ts-ignore`/`eslint-disable`、无 timeout/容差放大、无程序赋值冒充真实交互。

### 3. 连接器迁移 follow-up 未测 ctx.status 调用（spike）合理性

spike 范围（helper + ctx 注入 + 全测试 mock 适配）内，测试层已尽到义务：

- **helper 单测**锁死三函数决策表；
- **集成层**已有 9 个连接器测试（claude/deepseek/exa/firecrawl/getoneapi/grok/mimo/tavily/tikhub）通过 `observations[i].status` 端到端验证 connector script → `ctx.status` → observation.status 链路。其中 claude 测试（line 113-158）有两组显式阈值边界用例（95/80/25 + 90/75/74.9），锁死 `>=` 闭区间语义；deepseek/glm/mimo/tavily 的多 ctx 注入点都同步加了 `status: ctx_status`，原有 status 断言继续生效。

**结论：合理。** spike 交付了 helper 与注入契约，connector script 是否全部从内联 helper 迁到 `ctx.status` 属 follow-up task 范围；现有集成测试已证明契约链路打通，迁移后无需新增测试即可复用既有 status 断言。本 reviewer 不就「未迁移的连接器」出 finding（超出 spike 范围，且 spec AC 的「全连接器用 ctx helper」属 follow-up task 落地点，非本 spike 测试层责任）。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：helper 单测三函数边界全覆盖、`limit<=0` 短路覆盖；mock 适配用真实 helper、边界纪律正确、19 文件无遗漏；spike 范围内 ctx.status 契约已有 9 个连接器集成测试端到端锁死。测试层无质量问题。

verdict: PASS
