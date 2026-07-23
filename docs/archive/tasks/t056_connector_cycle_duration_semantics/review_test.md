# Task review t056（reviewer_focus: 测试）

- task：`t056_connector_cycle_duration_semantics`
- spec：`docs/tasks/t056_connector_cycle_duration_semantics/spec.md`
- diff_anchor：`090e8dd9560d466b95e9af1cd064c5670b325ea1`
- target：`git diff 090e8dd9560d466b95e9af1cd064c5670b325ea1`
- round：1
- reviewed_at：2026-07-23 16:50 UTC+8

## 改动概览

- `connectors/kimi/connector.ts:62,92`：`cycle_duration_ms` 由 `reset_at - now`（剩余时间）改为固定常量 `7*24*60*60*1000`（weekly）/ `5*60*60*1000`（five_hour）。
- `connectors/opencode_go/connector.ts:176-181`：由 `reset_in_sec*1000`（剩余秒数）改为 `raw_label==="weekly"?7d : "monthly"?30d : null`。
- `connectors/minimax/connector.ts:189`：由 `end_time - start_time` 改为 `Math.max(0, end_time - start_time)`。
- **无新增测试**（现有 `kimi-connector.test.ts` / `opencode_go.test.ts` / `minimax-connector.test.ts` 均未修改）。

## 现有测试对 cycleDurationMs 的断言扫描

三个被改连接器的既有测试**均未断言 `cycleDurationMs`**：

- `tests/integration/connector/kimi-connector.test.ts:69-82`：只断言 `used/limit/metric_id`。
- `tests/unit/connector/opencode_go.test.ts:101-130`：`expect.objectContaining` 列出 `used/limit/window/normalized_label` 等，**独缺 `cycleDurationMs`**。
- `tests/integration/connector/minimax-connector.test.ts:51-100`：只断言 `raw_label/used/limit/display_style/reset_at`。

即旧实现（剩余时间）→ 新实现（固定常量/null）的语义切换**无任何回归保护**：若实现回退到 `reset_at - now`，三套测试仍 PASS。spec AC5「单测覆盖三连接器」明确要求，未满足。

## Findings

### t056_test_f001 - kimi cycleDurationMs 固定常量无测试覆盖

- 严重度：important
- 位置：`tests/integration/connector/kimi-connector.test.ts:69-82`（`connector script returns weekly and five_hour observations`）
- 问题：AC1「kimi cycleDurationMs = 固定周期常量（非 reset_at-now）」无任何断言。现有用例只断 `used/limit/metric_id`，既未验证 weekly=`7*24*60*60*1000`、five_hour=`5*60*60*1000`，也未验证「不再随 reset_at 滑动」。旧分支 `reset_at !== null ? Math.max(0, reset_at - now) : <常量>` 若被重新引入，本测试不会失败。
- 建议：在 weekly / five_hour 两个 observation 上各加一条精确断言，如 `expect(weekly?.cycleDurationMs).toBe(7*24*60*60*1000)`、`expect(five_hour?.cycleDurationMs).toBe(5*60*60*1000)`；并可加一条「reset_at 与 cycleDurationMs 解耦」的反例（reset_at 接近 now 时 cycleDurationMs 仍为完整周期）。

### t056_test_f002 - opencode_go rolling=null / weekly=7d / monthly=30d 无测试覆盖

- 严重度：important
- 位置：`tests/unit/connector/opencode_go.test.ts:101-130`（`emits rolling, weekly, and monthly observations from the server reference`）
- 问题：AC2「opencode_go rolling=null，weekly/monthly=常量」无任何断言。现有 `expect.objectContaining` 块未含 `cycleDurationMs` 字段。三条分支（`weekly?7d : monthly?30d : null`）均无覆盖：若实现回退到 `reset_in_sec*1000`（fixture 中 60/120/180 秒 → 60_000/120_000/180_000），测试仍 PASS。
- 建议：在三个 observation 上补 `cycleDurationMs` 精确断言：rolling=`null`、weekly=`7*24*60*60*1000`、monthly=`30*24*60*60*1000`。rolling 用 `toBe(null)` 而非 `toBeFalsy`，避免 `0` 误混。

### t056_test_f003 - minimax end<start 负值兜底无测试覆盖

- 严重度：important
- 位置：`tests/integration/connector/minimax-connector.test.ts:51-100`（`maps model remains into interval + weekly observations`）
- 问题：AC3「minimax end<start 时 null（不出现负值）」无负值场景用例。现有 fixture `start_time: 1000, end_time: 1000 + 4*3600*1000`（end>start），走正常路径，既不触发 `Math.max(0, ...)` 兜底，也未断言 `cycleDurationMs` 本身。若实现回退到裸 `end_time - start_time`，负值场景无任何拦截。
  附注（属 code 范畴、仅作测试侧提示）：spec 措辞为「end<start 时 **null**」，实现是 `Math.max(0, ...)` 返回 `0`。测试 whichever 落地，都需明确预期值——要么测 `null`（与 spec 一致，则实现需改），要么测 `0`（则 spec 措辞需校准）。当前两者均未对齐。
- 建议：补一条 end<start 用例（如 `start_time: 5000, end_time: 1000`），按 spec 期望断言 `cycleDurationMs` 为 `null`（或与用户确认后改为 `0`）；并对正常路径补一条 `cycleDurationMs === end-start` 的精确断言。

### t056_test_f004 - AC4「host 校验 cycleDurationMs>=0」无测试覆盖

- 严重度：important
- 位置：`tests/unit/shared/observation.test.ts:44-58`（`accepts cycleDurationMs as a finite number` / `rejects non-finite cycleDurationMs`）
- 问题：AC4 要求「schema 注释 + host 校验 cycleDurationMs>=0」。diff 未触及 `src/shared/schemas/observation.ts` / `src/shared/types/observation.ts` / `src/main/core/connector/runtime.ts`，schema 仍为 `finite_number.nullable().optional()`，无 `>=0` 约束，类型定义 `cycleDurationMs?: number | null` 也无注释。现有 schema 测试只覆盖 `Infinity` 被拒，未覆盖负数；若 host 加 `.nonnegative()` 校验，需对应补「rejects negative cycleDurationMs」用例。
  注：此条根因是 AC4 本身未实现（code 层），测试缺位是其直接后果。test reviewer 侧只标记「AC4 若落地必须补测试」，不替 code reviewer 判断 AC4 是否必须本期实现。
- 建议：与 code reviewer 对齐 AC4 是否本期落地。若落地：schema 加 `.nonnegative()`（或等价 refine），`observation.test.ts` 补负数拒绝用例；若暂缓：在结论段记为遗留，避免 AC 验收勾选与实际不符。

## 危险模式扫描

逐条扫描结果：

- 恒真断言 / 删 expect / 注释断言 / `.skip` / `.only` / `@ts-ignore` / 静默错误：**均未命中**。
- 弱化断言：三个连接器测试的 `expect.objectContaining` 用法是**既存风格**（非本次改动引入），且字段列表本就未含 `cycleDurationMs`，不存在「本次把 toBe 改成 toContain 以弱化」的情况。**不构成 finding**，但「字段缺位」本身已被 f001–f003 捕获为 AC 缺测试。
- mock 误用：fixture / `create_ctx` mock 在系统边界（HTTP 响应），未 mock 被测连接器自身逻辑。合法。
- 阈值掩盖：未发现 timeout / 重试次数异常放大。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：4 条（全 important）。
- 总体判断：spec AC5 明确要求「单测覆盖三连接器」，实际 diff 零测试改动；三个连接器的 `cycleDurationMs` 新语义（固定常量 / null / 非负兜底）在现有测试中**无任何断言**，语义切换无回归保护，且 minimax 负值兜底与 AC4 host 校验均无场景覆盖。AC1–AC5 五条验收中，AC1/AC2/AC3 缺测试断言，AC4 缺实现+测试，AC5 直接未满足。

verdict: FAIL

## Round 2 (2026-07-23 18:10 UTC+8)

### 前轮 finding 复核

- **t056_test_f001（kimi cycleDurationMs 固定常量无测试）**：已修。`tests/integration/connector/kimi-connector.test.ts:84-93` 新增独立用例 `cycleDurationMs is fixed full-period (not remaining to reset)`，对 weekly / five_hour 两条 observation 各做精确 `toBe(7*24*60*60*1000)` / `toBe(5*60*60*1000)` 断言。fixture 中 `resetTime: "2099-01-01T00:00:00Z"` 距 now 极远，若实现回退到 `reset_at - now` 断言必失败——回归保护有效。
- **t056_test_f002（opencode_go rolling/weekly/monthly 无测试）**：已修。`tests/unit/connector/opencode_go.test.ts:134-137` 在既有用例尾部追加三条断言：`toBeNull()`（rolling，采纳 Round 1 建议用 `toBeNull` 而非 `toBeFalsy`，避免 0 误混）/ `toBe(7*24*60*60*1000)`（weekly）/ `toBe(30*24*60*60*1000)`（monthly）。fixture 中 `resetInSec: 60/120/180`，若实现回退到 `reset_in_sec*1000` 断言必失败——回归保护有效。
- **t056_test_f003（minimax end<start 负值兜底无测试）**：已修，且 spec 措辞与实现对齐。`tests/integration/connector/minimax-connector.test.ts:100-101` 在正常路径上加 `expect(text_interval?.cycleDurationMs).toBe(4 * 3600 * 1000)`；`:104-124` 新增 `cycleDurationMs clamps negative end-start to 0` 用例，fixture `start_time: 2000, end_time: 1000`（end<start），断言 `expect(interval?.cycleDurationMs).toBe(0)`。若实现回退到裸 `end_time - start_time` 得 -1000，断言必失败——回归保护有效。spec AC3 已由「null」校准为 `Math.max(0,...) -> 0`，测试与实现一致。
- **t056_test_f004（AC4 host 校验 cycleDurationMs>=0 无测试）**：**未彻底修复**。实现半部分已落地（`src/shared/schemas/plugin-output.ts:67` 加 `.nonnegative()`、`src/shared/types/observation.ts:30-34` 加 JSDoc），但测试半部分未做——`tests/unit/shared/plugin-output.test.ts` 未补「rejects negative cycleDurationMs」用例。`.nonnegative()` 约束目前无任何单元测试守护：若该约束被删，全套 1559 测试仍绿。Round 1 明确要求「若 host 加 `.nonnegative()` 校验，需对应补 rejects negative 用例」，该条件已触发但测试未跟上。详见本轮新发现 f005。

### 本轮新发现

#### t056_test_f005 - plugin-output `.nonnegative()` 约束无测试守护

- 严重度：important
- 位置：`tests/unit/shared/plugin-output.test.ts`（整个文件未覆盖 `cycleDurationMs` 负数拒绝路径）
- 问题：AC4「host 校验 cycleDurationMs>=0（plugin-output nonnegative）」已在 `src/shared/schemas/plugin-output.ts:67` 落地为 `finiteNumber.nonnegative().nullable().optional()`，但对应单元测试缺位。`plugin-output.test.ts` 现有 9 个用例覆盖 provider / schemaVersion / raw_label / display_label 等，独缺 cycleDurationMs 任何用例；`observation.test.ts:44-59` 只覆盖 `Infinity` 拒绝，也不测负数。若有人移除 `.nonnegative()`，无任何测试失败——AC4 的 host 校验半部分形同未守护。
- 建议：在 `plugin-output.test.ts` 加一条 `rejects negative cycleDurationMs`：构造 `items[0].cycleDurationMs: -1`，断言 `result.success === false`。可选再加一条 `accepts zero cycleDurationMs` 确认边界 `0` 通过（`.nonnegative()` 允许 0）。

### 危险模式扫描（本轮新增改动）

逐条扫描 Round 2 新增的测试代码：

- 恒真断言 / 删 expect / 注释断言 / `.skip` / `.only` / `@ts-ignore` / 静默错误：**均未命中**。
- 弱化断言：三条新增 / 修改路径全用 `toBe` / `toBeNull()` / `toBe(0)`，未出现 `toBeTruthy` / `toContain` / `>=` 等弱化形式。kimi 用 `toBe(7*24*60*60*1000)` 而非 `>= 5*60*60*1000`，精确无松动。
- mock 误用：未命中。kimi 新用例复用 `create_ctx()` 系统边界 mock（HTTP 响应），未 mock 被测连接器自身。
- 阈值掩盖：未命中。
- 程序赋值替代真实交互：N/A（非 UI 测试）。

### 结论

- 前轮 finding 复核：f001 / f002 / f003 已修（回归保护有效）；**f004 未彻底修复**（实现落地、测试仍缺）。
- 本轮新发现：1 条（f005，important）。
- 总体判断：三连接器的 `cycleDurationMs` 新语义均有精确断言守护，Round 1 主要问题已解决；但 AC4 的 host 侧 `.nonnegative()` 约束仍无单元测试，f004 的测试半部分未闭环。按 verdict 判定式「前轮 finding 全部已修或已撤回」不满足（f004 未彻底修）+ 本轮 1 新 finding → FAIL。

verdict: FAIL
