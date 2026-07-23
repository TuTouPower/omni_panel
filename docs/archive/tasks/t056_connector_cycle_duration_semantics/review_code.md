# Task review t056（reviewer_focus: 代码）

- task：`t056_connector_cycle_duration_semantics`
- spec：`docs/tasks/t056_connector_cycle_duration_semantics/spec.md`
- diff_anchor：`090e8dd9560d466b95e9af1cd064c5670b325ea1`
- target：`git diff 090e8dd9560d466b95e9af1cd064c5670b325ea1`
- round：1
- reviewed_at：2026-07-23 16:50 UTC+8

## Findings

### t056_code_f001 - schema 缺 cycleDurationMs 语义注释

- 严重度：important
- 位置：`src/shared/schemas/observation.ts:38`
- 问题：spec AC4「schema 注释 + host 校验 cycleDurationMs>=0」要求 schema 注释明确「cycleDurationMs = 完整周期时长（非剩余）」；spec 范围同样写「observation schema 注释明确」。当前 `cycleDurationMs: finite_number.nullable().optional()` 无任何 JSDoc 注释。`docs/specs/observation-store.md:18` 已有「周期总长度（毫秒）」但未点明「非剩余」语义，不足以替代代码注释——本次 task 的核心就是消除「剩余 vs 完整周期」混淆，schema 作为契约源头不留语义说明将使混淆复现。
- 建议：在 `src/shared/schemas/observation.ts:38` 上方加 JSDoc：`/** 完整周期时长（毫秒），非「距下次重置剩余时间」；无限周期/余额类用 null。 */`。

### t056_code_f002 - host 层缺 cycleDurationMs>=0 校验

- 严重度：important
- 位置：`src/shared/schemas/observation.ts:15,38`（`finite_number = z.number().finite()`，无 `.nonnegative()`）
- 问题：spec AC4 要求「host 层 cycleDurationMs>=0 校验」，spec 范围写「host 层 cycleDurationMs>=0 校验」。当前 schema 仅要求 finite，仍允许负数通过。`tests/unit/shared/observation.test.ts` 也未覆盖「拒绝负 cycleDurationMs」用例（只有 Infinity 拒绝、null/正数接受）。本 task 的入口就是 minimax/kimi/opencode_go 出现负值/剩余当周期；无契约层防御等于未来连接器可再次回退。
- 建议：将 `finite_number` 用于 cycleDurationMs 时改用新定义（如 `finite_nonnegative = z.number().finite().nonnegative()`），或在 `cycleDurationMs` 字段直接 `.nonnegative()`；并在 `tests/unit/shared/observation.test.ts` 加「rejects negative cycleDurationMs」用例。

### t056_code_f003 - 三连接器缺 cycleDurationMs 单测

- 严重度：important
- 位置：
    - `tests/integration/connector/kimi-connector.test.ts`（全文 0 处 `cycleDurationMs`）
    - `tests/unit/connector/opencode_go.test.ts`（全文 0 处 `cycleDurationMs`）
    - `tests/integration/connector/minimax-connector.test.ts`（全文 0 处 `cycleDurationMs`）
- 问题：spec AC5「单测覆盖三连接器」、CLAUDE.md「TDD：可测部分先红后绿」。本次 diff 改动三条 cycleDurationMs 计算路径，三个测试文件无任何 cycleDurationMs 断言。回归保护为零——后续若再回退成 `reset_at - now` 或漏改常量，测试不会失败。kimi 测试现有 fixture（`weekly`+`limits[0]`）与 minimax 测试现有 fixture（`start_time`/`end_time`）已具备断言条件，仅需补 `expect(...).toEqual(expect.objectContaining({ cycleDurationMs: ... }))`。
- 建议：
    - kimi：`weekly.cycleDurationMs === 7*24*60*60*1000`、`five_hour.cycleDurationMs === 5*60*60*1000`。
    - opencode_go：`rolling.cycleDurationMs === null`、`weekly === 7*24*60*60*1000`、`monthly === 30*24*60*60*1000`。
    - minimax：常规用例断言 `cycleDurationMs === end-start`；新增 end<start 用例断言「不出现负值」（配合 f004 决定 0/null）。

### t056_code_f004 - minimax AC 字面偏差：Math.max(0,…) 而非 null

- 严重度：minor
- 位置：`connectors/minimax/connector.ts:189`
- 问题：spec AC3「minimax end<start 时 **null**（不出现负值）」、spec 范围「end<start 时 **null 或 throw**」。实现用 `Math.max(0, end-start)`，end<start 时得到 0，既非 null 也非 throw，是 spec 未列举的第三种行为。下游 `src/renderer/lib/provider-usage.ts:597`（`if (!cycle || cycle <= 0) continue;`）与 `src/renderer/components/UsageRows.tsx:70`（`period.resetAt && period.cycleDurationMs` 假值短路）将 0 与 null 等价处理，故无功能性 bug；但 AC 字面与 spec 范围均明确「null 或 throw」，实现路径不在其中。0 语义为「零长度周期」，对未来新增的下游计算（如平均周期、周期分布）可能产生误导。
- 建议：改为 `const cycle = to_number(model.end_time) - to_number(model.start_time); cycleDurationMs: cycle > 0 ? cycle : null,`；或在 schema 层拒绝 0（见 f002）后保留当前写法并在 spec 补说明。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：4 条（3 important + 1 minor）。
- 总体判断：三条连接器 cycleDurationMs 计算路径本身正确（kimi 固定常量、opencode_go 按 raw_label 分发、minimax 防负），核心修复达标；但 spec 的 schema/host/测试三条 AC 完全未落地，连接器代码层留 minimax 字面偏差。AC 覆盖不全，不可直接收尾。

verdict: FAIL
