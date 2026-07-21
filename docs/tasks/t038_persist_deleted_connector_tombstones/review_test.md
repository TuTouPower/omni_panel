# Task review t038（reviewer_focus: 测试）

- task：`t038_persist_deleted_connector_tombstones`
- spec：`docs\tasks\t038_persist_deleted_connector_tombstones\spec.md`
- diff_anchor：`0dc2833`
- target：`git diff 0dc2833 -- tests/unit/main/core/config/auto-seed.test.ts`
- round：1
- reviewed_at：2026-07-22 19:35 UTC+8

## Findings

无。

## 评审过程与依据

### 1. 改动范围

`tests/unit/main/core/config/auto-seed.test.ts` 新增 2 个 it，共 +20 行；未删/改既有测试。

- `skips connectors whose manifest id is tombstoned (t038)`（auto-seed.test.ts:103-112）
- `seeds all when tombstone empty or absent (t038)`（auto-seed.test.ts:114-121）

### 2. AC 覆盖

| AC                                                                 | 覆盖           | 证据                                                                                                                                                 |
| ------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC 2：`auto_seed_connectors` 对 tombstone id 返回 0 seeded（单测） | ✅             | 第一个 it 传 `[claude, glm]` + tombstone `{glm}`，断言 `seeded.length === 1` 且 `seeded[0].name === "CLAUDE"`——同时验证 glm 被跳过、claude 正常 seed |
| AC 3：未删除的内置 connector 仍正常 auto-seed（不误伤，单测）      | ✅             | 第二个 it 分别覆盖「tombstone 缺省」和「tombstone 为空集」两种路径，断言全量 seed                                                                    |
| AC 1/4/5：集成/e2e、`pnpm test`、打包验证                          | 不在本文件范围 | 属集成/e2e 层，本 unit 测试文件无需覆盖                                                                                                              |

### 3. 测试可信

- **被测对象真实**：直接 `import { auto_seed_connectors } from "../../../../../src/main/core/config/auto-seed"` 并调用（auto-seed.test.ts:2-7），无 mock 被测逻辑本身。
- **断言用户可观察契约**：`result.seeded.length`、`result.seeded[0].name` 都是 `auto_seed_connectors` 返回值的公开字段，非内部状态窥探。
- **`make_definition` 是数据 builder 不是 mock**：构造真实 `Manifest` / `ConnectorDefinition` 结构（auto-seed.test.ts:12-26），用于喂给被测函数；`provider: "claude"` 对所有 id 用同一常量不影响 tombstone 行为（只关心 `manifest.id`）。
- **异步时序**：被测为纯同步函数，无 race / await / timeout 风险。

### 4. 危险模式扫描（逐条）

- 恒真断言 / `expect(true)`：无。
- 删除或反转 expect：无（纯新增）。
- 注释掉的 expect：无。
- 弱化断言（`toBe` → `toContain` / 正则 / `>=` / `toBeTruthy` / `toMatchObject`）：无；均用 `toHaveLength` + `toBe` 精确等值。
- 删测试 / describe / it：无。
- `.skip` / `.only` / `@Ignore`：无。
- `eslint-disable` / `@ts-ignore` / `@SuppressWarnings`：无。
- mock 误用（mock SUT / mock 关键副作用）：无。
- 阈值掩盖（timeout / 重试 / 容差放大）：无。
- 条件跳过弱化断言（`if (cond) expect`）：无。
- 程序赋值替代真实交互：无（非 UI 测试）。
- 存在即通过（`toBeVisible` 当 AC 证据）：无。

### 5. 红灯归因

新增测试属 TDD 红→绿路径（t038 新增 `removed_ids` 参数 + 第 47 行 `if (removed_ids?.has(def.manifest.id)) continue;`）。实现侧落地与测试预期一致，无改既有测试、无改断言条件。

### 6. Pre-Report Gate

无 finding，N/A。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：新增 2 个 unit 测试真实调用 `auto_seed_connectors`，精确断言返回契约，完整覆盖 AC 2 与 AC 3 在本文件范围内的部分；无危险模式、无弱化断言、无 mock 误用。

verdict: PASS
