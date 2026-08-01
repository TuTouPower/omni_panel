# Task review t188（reviewer_focus: 通用）

- task：`t188_rollup_title_window_filter`
- spec：`docs/tasks/t188_rollup_title_window_filter/spec.md`
- diff_anchor：`6d6345616bfc83d933a9f2b675aaac30d129fb98`
- target：`git diff 6d6345616bfc83d933a9f2b675aaac30d129fb98`
- round：1
- reviewed_at：2026-08-02 20:30 UTC+8

## Findings

### t188_gen_f001 - 子查询窗口过滤注释含元引用 `(p024)`

- 严重度：minor
- 锚点：风格 / 元引用违规（非行为缺陷）
- 位置：`src/main/core/token-stats/token-stats-store.ts:619`
- 问题：本次新增的注释结尾「an unscoped subquery would pick a title from outside the window (p024)」嵌入了 pending 编号 `p024`。CLAUDE.md「文档规范」明令禁止正文嵌入决策/spike/ticket/task 编号。原 t184 注释不含此编号，本次新增引入。
- 建议：删 `(p024)` 或改为「outside the window (see pending.md)」之类不带编号的描述；编号本身在 `task.md` 的 `note: "p024"` 字段已留痕。

## AC 覆盖核对

- **AC1**（窗口外改名不影响 rollup title）：覆盖。`token-stats-store.test.ts:497-517` 构造 s1 在窗口内（A@T0、A2@T1）与窗口外（B@T2+10_000，晚于 end=T2），断言 `query_range_rollup({start:T0,end:T2})` 返回 `title="A2"`。子查询 `t2.timestamp >= @start AND t2.timestamp < @end` 排除窗口外 B，选窗口内最新 A2。实现 `token-stats-store.ts:629-630` 与断言一致。
- **AC2**（不带 start 全表最新）：覆盖。`token-stats-store.test.ts:519-534` 用 `query_range_rollup({})`，外层无 WHERE；`params.start=0`、`params.end=Number.MAX_SAFE_INTEGER` 使子查询等价全表扫描，B 晚于 A 故选 B。断言 `title="B"`。
- **AC3**（带 start 但窗口内无记录的 session 不引入额外行）：间接覆盖。子查询位于 SELECT 列表为相关子查询，逻辑上不可能引入行；外层 WHERE 已过滤。AC1 测试中 `expect(rows).toHaveLength(1)`（仅一个 session s1）佐证无额外行。无独立 case 专门构造「窗口外唯一 session」场景，但该场景价值有限，按「可以再加 case」类不阻断。

## 半开区间与默认参数一致性

- 外层窗口：`filters.start !== undefined` 才加 `timestamp >= @start`，`filters.end !== undefined` 才加 `timestamp < @end`（`token-stats-store.ts:598-603`）。半开 `[start, end)` 与既有注释一致。
- params 默认：`start ?? 0`、`end ?? Number.MAX_SAFE_INTEGER`（行 596-597）保证子查询无条件引用 `@start`/`@end` 不报错；undefined 时默认值涵盖全部真实 timestamp，子查询语义等价全表，与外层「不带 start/end 即不过滤」语义吻合。无性能问题（默认值下子查询仍走 timestamp 索引扫描全表，与原行为一致；带窗口时缩小扫描集）。

## 测试可信度

- timestamp 构造真实区分窗口内外：T0(07-10 08:00Z) < T1(09:00Z) < T2(07-11 10:00Z) < T2+10_000。窗口 `[T0, T2)` 排除 `T2+10_000` 的 B 行。无假绿。
- AC2 测试不传 start，仅传空 filters `{}`，触发默认参数路径，断言 B（全表最新）。覆盖默认参数分支。
- 断言均触达可观察行为（`rows[0].title`），非 mock。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：1 条（minor）。
- 未进表的提示：AC3 无独立 case 但间接覆盖充分；测试描述与文件名中的 `t188` 属测试标识豁免，不计 finding。
- 总体判断：实现正确覆盖 AC1-AC3，半开区间与默认参数语义自洽；仅一处注释元引用违规，不影响行为。仅 minor → PASS。
- 系统性 follow-up：无。

verdict: PASS

## Round 2 (2026-08-02 21:05 UTC+8)

### 前轮 finding 复核

- **t188_gen_f001（minor，注释元引用 `(p024)`）**：已修确认。`token-stats-store.ts:619` 原结尾「outside the window (p024)」改为「outside the window」，无编号残留；同时第 612-617 行注释整体重写为「window-local latest」「rs[0].title is the window-local latest」「unscoped subquery would pick a title from outside the window」，描述与子查询新增的 `t2.timestamp >= @start AND t2.timestamp < @end`（行 629-630）一致。无元引用违规。

### 本轮新发现

无。diff 仅三处文件变动：

- `token-stats-store.ts`：注释修订（f001 修复）+ 既有窗口过滤逻辑（Round 1 已核），无新代码引入。
- `token-stats-store.test.ts`：测试用例未变（Round 1 已核 AC1-AC3 覆盖）。
- `task.md`：处置表填写，非 review 范围。

### 结论

- 前轮 finding：1 条 minor，已消除。
- 本轮新发现：0 条。
- 总体判断：f001 修复到位，无新问题。
- 系统性 follow-up：无。

verdict: PASS
