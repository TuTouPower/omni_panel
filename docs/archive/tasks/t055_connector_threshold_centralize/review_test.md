# Task review t055（reviewer_focus: 测试）

- task：`t055_connector_threshold_centralize`
- spec：`docs\tasks\t055_connector_threshold_centralize\spec.md`
- diff_anchor：`969afba3f7285832c7d7a6aa0dae49e2237382b9`
- target：`git diff 969afba3f7285832c7d7a6aa0dae49e2237382b9`
- round：1
- reviewed_at：2026-07-23 09:41 UTC+8

## Findings

### t055_test_f001 - 阈值边界值未锁（90/75、0.9/0.75 闭区间未测）

- 严重度：important
- 位置：`tests/integration/connector/claude-connector.test.ts:122-130`、`tests/integration/connector/firecrawl_connector.test.ts:175-197`
- 问题：新增的阈值测试用远离边界的值验证分类，未锁闭区间边界。
    - claude 用 95（critical）/80（warning）/25（normal），实现阈值是 `>=90` / `>=75`（`connectors/claude/connector.ts:46-48`）。把 `>=90` 改成 `>90` 或 `>=85`，本测试仍通过。
    - firecrawl 只测 0.95（critical），未测 0.9 边界、未测 warning（0.75–0.9）、未测 `limit<=0`（unknown 分支，`connectors/firecrawl/connector.ts:16`）。把 `>=0.9` 改成 `>0.9`，本测试仍通过。
    - spec AC 2 要求「status 按阈值（达上限 critical/warning）」——「达上限」即闭区间边界，测试未锁。
- 建议：claude 补 90/75/89.9/74.9 断言；firecrawl 补 0.9/0.75 边界 + warning + `limit=0` unknown 分支。或在 f002 的单测里覆盖。

### t055_test_f002 - AC 1「共享 helper 抽出 + 单测覆盖三函数边界」无任何测试

- 严重度：important
- 位置：整个 diff（缺失单测）；helper 定义散落于 `connectors/claude/connector.ts:45`、`connectors/firecrawl/connector.ts:15`、`connectors/cpa/connector.ts:55`、`connectors/deepseek/connector.ts:29`、`connectors/getoneapi/connector.ts:26`、`connectors/mimo/connector.ts:59`、`connectors/tikhub/connector.ts:26`
- 问题：spec AC 1 明确要求「共享阈值 helper 抽出，单测覆盖三函数边界」。实际：
    - helper 未抽出共享模块——`status_for_pct` 在 claude/cpa 各内联一份，`status_for_ratio` 在 firecrawl，`status_for_balance` 在 deepseek/getoneapi/mimo/tikhub 各重复一份（代码问题，code reviewer 会标；此处仅述事实用于判断测试可测性）。
    - 无任何 helper 单测。diff 新增的全部是集成测试（`run_connector` 驱动），不满足 AC 1 的「单测」要求。
    - 即使接受集成测试替代单测，三函数的边界（临界值、limit=0/负数、utilization 缺失）在测试矩阵中不存在。
- 建议：抽出共享 helper 到独立模块并加单测，或至少在集成测试里补齐三函数边界场景。

### t055_test_f003 - AC 4「cpa utilization 缺失 → null（跳过 status）」零测试覆盖

- 严重度：important
- 位置：缺失测试；cpa 实现见 `connectors/cpa/connector.ts:128-129`（`to_pct(period["utilization"])` 缺失时返回 0 → `status_for_pct(0)` → `"normal"`）
- 问题：spec AC 4 要求 cpa utilization 缺失时返回 null 跳过 status（不标 normal）。本 diff 完全未触碰 cpa connector 或 `cpa-connector.test.ts`：
    - diff stat 不含 `connectors/cpa/`，不含 cpa 测试改动。
    - 既有 `tests/integration/connector/cpa-connector.test.ts` 无「utilization 缺失」场景，也未断言 `status` 字段（grep 仅命中 HTTP `status_code`）。
    - 实现 `connectors/cpa/connector.ts:129` 仍把缺失 utilization 折成 0 → normal，正是 spec 背景描述的误报。AC 4 测试缺失 + 实现未改，该 AC 实质未交付。
- 建议：新增 cpa utilization 缺失测试，断言 observation 不标 normal（null/跳过 status，按 spec 约定）。

## 结论

- 本轮新发现：3 条（全 important）。
- codex unknown 断言（`tests/integration/connector/codex-connector.test.ts:119`）：符合 AC 3，是期望行为。codex 连接器无 limit 概念（聚本地会话），`limit: null` 始终成立，`status: "unknown"` 与 AC 3 一致。实现硬编码 `status: "unknown"`（`connectors/codex/connector.ts:124`）未按 limit 条件分支——属代码实现问题，不作为测试 finding。
- 危险模式扫描：未命中。无 `.skip` / `.only` / 注释断言 / 恒真断言 / `@ts-ignore` / `eslint-disable`。mock 仅作用于系统边界（HTTP `get_json`、文件系统 `list`/`read`），未 mock 内部模块。codex 断言由 `"normal"` 改为 `"unknown"` 有明确归因（spec AC 3 变更），非无归因改测试。
- 总体判断：三个新增测试方向正确（集成驱动、系统边界 mock、无反模式），但阈值边界未锁、AC 1 单测缺失、AC 4 cpa 完全未交付测试覆盖，测试侧无法支撑 spec 全部 AC 的「已验证」结论。

verdict: FAIL

## Round 2 (2026-07-23 17:47 UTC+8)

### 前轮 finding 复核

- **t055_test_f001（阈值边界未锁）— 已修**。
    - claude（`tests/integration/connector/claude-connector.test.ts:133-156`）：新增 `status threshold boundaries 90/75 locked (>= semantics)`，锁 90→critical / 75→warning / 74.9→normal。实现 `status_for_pct`（`connectors/claude/connector.ts:45-49`）为 `>=90` / `>=75`；若降级为 `>90` / `>75` 或抬高阈值（如 `>=90.001`），对应 90 / 75 用例立即失败。闭区间已锁。
    - firecrawl（`tests/integration/connector/firecrawl_connector.test.ts:199-226`）：新增 `status ratio boundaries 0.9/0.75 locked` 与 `status unknown when limit <= 0`。用例 mk(100,1000)→used=900 ratio=0.9 critical / mk(250,1000)→used=750 ratio=0.75 warning / mk(251,1000)→used=749 ratio=0.749 normal / plan=0→limit=0 unknown。实现 `status_for_ratio`（`connectors/firecrawl/connector.ts:15-21`）四个分支（`limit<=0` / `>=0.9` / `>=0.75` / default）每支至少一用例命中；若 `>=0.9` 改 `>0.9`，0.9 用例失败；若 `>=0.75` 改 `>0.75`，0.75 用例失败。四分支闭区间与 unknown 全锁。
- **t055_test_f002（AC1 共享 helper 单测缺失）— 撤回**。spec AC1 已由「共享阈值 helper 抽出，单测覆盖三函数边界」修订为「P5 ctx 共享 helper 集中化标遗留（架构改另立 spike）；本 task 各连接器内联 helper（与 deepseek/mimo/exa/tikhub/cpa 一致）」。finding 前提（要求共享 helper + 单测）已不成立。内联 helper 经集成测试覆盖（claude/firecrawl 各有边界测试），与既有连接器风格一致。本 finding 属基于旧 AC 的误报。
- **t055_test_f003（cpa utilization 缺失零覆盖）— 前提失效（spec 变更）**。spec AC4 已由「cpa utilization 缺失 → null（跳过 status）」修订为「cpa utilization 缺失（I5）移 t059（空响应处置），本 task 不动」。finding 所引 AC 不再属于本 task，实现与测试改动归 t059。本 task 测试侧无需再覆盖 cpa utilization 缺失。

### 本轮新发现

0 条。

### 新改动扫描

- 新增 4 个 it（claude 边界 / firecrawl ratio / firecrawl 边界 / firecrawl limit<=0）：严格 `toBe` 等值断言 status，无弱化、无 `.skip` / `.only` / 注释断言 / 恒真断言 / `@ts-ignore`。
- mock 仅作用于系统边界（HTTP `get_json`），未 mock 内部模块或被测 helper。
- 异步：每个 `run_connector` 均 `await`，无漏 await / race / timeout 掩盖。
- 边界数学核验：firecrawl `extract_usage`（`connectors/firecrawl/connector.ts:44-48`）`used=max(plan-remaining,0)`、`limit=plan`；测试 payload 取值（remaining=100/250/251, plan=1000）精确对应 ratio 0.9/0.75/0.749，无四舍五入歧义。
- 危险模式扫描：未命中。
- 全量 `pnpm test`：1557 passed（含本 task 新增 4 用例 + 既有回归）。

### 总体判断

R1 三条 finding 全部解决（f001 已修 / f002 撤回 / f003 spec 变更失效），本轮零新发现。阈值闭区间 90/75/0.9/0.75 与 unknown 分支均锁，实现阈值语义被测试严格约束。测试侧支撑 spec AC1–AC5 的「已验证」结论。

verdict: PASS
