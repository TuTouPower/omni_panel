# Task review t187（reviewer_focus: 通用）

- task：`t187_custom_short_window_hour_bar_aggregate`
- spec：`docs/tasks/t187_custom_short_window_hour_bar_aggregate/spec.md`
- diff_anchor：`12fb72c38dab2b9c9ea216648226b7c733f6eb04`
- target：worktree 未提交改动（`git diff` against `12fb72c3`）
- round：1
- reviewed_at：2026-08-02 11:05 UTC+8

## 审查范围

仅本次 diff 触及的文件 + 函数内部：

- `src/renderer/views/TokenStatsView.tsx`：`hour_fetch` 条件（L242-259）与 `loadData` useCallback deps（L349-358）。
- `tests/unit/renderer/views/token_stats_view.test.tsx`：RangePicker mock（L57-65）与新增 ≤25h 自定义范围测试（L822-878）。
- `docs/tasks/t187_.../task.md`：状态字段（创建期）。

未审 hour 聚合 SQL、records LIMIT、KPI/donut/项目/会话轴逻辑——均在非范围。

## Findings

无 blocking finding。

### t187_gen_f001 - AC1 断言未直接证明「未走 records」

- 严重度：minor
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:873-876`
- 问题：测试只断言 `hourBuckets?.length === 7`，未断言 `records.length < 7` 或 BarChart `records` prop 与 `hourBuckets` 来源区分。理论上若实现错误地同时填充 records，测试仍绿。但 records mock 仅返回 2 条、hour buckets 7 条，注释明示意图「BarChart receives the complete hour buckets, not the LIMIT-truncated records slice」，配合 t183 同模式测试，整体可接受。
- 失败场景：仅在实现同时填 records 与 hourBuckets 且 records 长度 ≥7 时漏检——该场景与本次条件改动无因果关系。
- 建议：可选追加 `expect(mocked_bar_chart.props?.records?.length ?? 0).toBeLessThan(7)` 强化区分；不阻断。

### t187_gen_f002 - 窗口断言容差来源未注释

- 严重度：minor
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:871`
- 问题：`expect(last_call.end - last_call.start).toBeGreaterThanOrEqual(12 * hour - 60_000)` 用 `-60_000` 容差吸收 `Date.now()` 在 test-local `now` 与 onApply 调用时刻之间的漂移，但未注释来源。后续维护者可能误以为是窗口对齐误差。t183 同位置用 `now ± 5000` 容差并显式注释「The full 24h window must be forwarded」。
- 失败场景：无运行风险；纯可读性。
- 建议：可加一行注释说明 60_000 是 mock 内 `Date.now()` 漂移上限；不阻断。

## 覆盖核对

### AC1：≤25h 自定义范围 BarChart 接收 query_hour_buckets 完整窗口

- 实现：`hour_fetch` 条件去掉 `(is_short_window && preset !== "24h")` 短路（`TokenStatsView.tsx:251-252`），custom 范围 + hour + time-axis 进入 `getHourBuckets` 分支（L253-259），`setHourBuckets(hour_bkts)`（L318）传给 BarChart。
- 测试：`token_stats_view.test.tsx:822-877` 触发 12h custom range + 小时粒度，断言 `hourBuckets.length === 7`（mock 完整窗口）。
- 结论：覆盖。

### AC2：getHourBuckets 收到完整自定义窗口 [start, end]

- 实现：`getHourBuckets({ ...env_filter, ...agent_filter, start: currentRange.start, end: currentRange.end })`（L253-259），`currentRange` 在 custom 设置后等于完整自定义窗口。
- 测试：断言 `last_call.end > last_call.start` 与 `end - start >= 12*hour - 60_000`（L870-871）。
- 结论：覆盖。

### AC3：24h preset、≥7d、day 粒度回归

- 实现：新条件 `gran !== "hour" || !time_axis` 对原走 hour 聚合的路径（24h preset hour+time、7d/30d hour+time）返回 false → 进入聚合；对 day 粒度或非时间轴返回 true → 跳过。语义与 t183 后版本对上述路径等价。
- 测试：
    - day 粒度跳过：`skips the hour bucket fetch on day granularity (t173)`（L545-569）未改。
    - 24h preset hour buckets：`feeds BarChart full 24h hour buckets on the 24h preset`（L571-626）未改。
    - 7d hour buckets：`feeds BarChart full multi-day buckets ... on 7d window`（L395-543）未改。
- 结论：覆盖。

## 重点项核对

1. **AC1-AC3 覆盖**：见上，全部满足。
2. **hour_fetch 条件改动正确性**：
    - 24h preset + hour + time-axis：`gran !== "hour"`=false、`!time_axis`=false → 进入聚合 ✓
    - 7d/30d + hour + time-axis：同上 ✓
    - custom ≤25h + hour + time-axis：同上 ✓（本次目标）
    - day 粒度：`gran !== "hour"`=true → 跳过 ✓
    - 非时间轴（项目/会话）+ hour：`!time_axis`=true → 跳过 ✓（hour 聚合只服务于时间轴小时柱）
    - 默认 30d + day：跳过 ✓
      全部覆盖正确。
3. **useCallback deps 删 `preset`**：`loadData` 体内不直接读 `preset`，唯一相关派生是 `use_rollup_summary = preset === "24h"`，仍保留在 deps。`use_rollup_summary` 为布尔原值，Object.is 比较；preset 在影响该布尔时必引发 use_rollup_summary 变化 → useCallback 重创建。preset 在不影响该布尔的切换间（如 7d↔30d）不影响 loadData 行为，且 `currentRange`/`gran` 等其他 deps 已覆盖窗口与粒度变化。删除冗余 deps 正确，无闭包陈旧风险。
4. **RangePicker mock 改动**：原 `() => <div />` 改为渲染 `apply-custom-range` 按钮触发 `onApply`。按钮 accessible name `apply-custom` 与现有所有 `getByRole("button", { name: ... })` 查询（`Kimi Code`/`Win`/`WSL`/`全平台`/`24 小时`/`7 天`/`1 月`/`小时`/`天`/`项目`/`用量面板`/`设置`/`OpenCode`）无重名冲突。真实组件 `onApply: (range: { start: number; end: number }) => void` 签名与 mock 一致。现有测试无通过 RangePicker 内元素查询的用例。无破坏。
5. **测试假绿排查**：
    - `beforeEach` 清空 localStorage + mock reset，每测试独立。
    - 新测试初始 mount 用默认 day/30d，records mock 实现不会破坏 mount。
    - 点击 apply-custom-range 后 `custom`/`currentRange` 变化触发 loadData；再点「小时」gran 变化再触发 loadData，此时 hour_fetch 走聚合分支。
    - `waitFor(get_hour_buckets).toHaveBeenCalled` 等真实调用；`last_call` 取实际调用参数。
    - 默认 metric=tokens、xaxis=time → `time_axis=true`，gran 切 hour 后条件满足。
      未发现假绿。

## 其他核对

- 元引用：spec 无元引用残留；测试注释含 `(t187)` `(p023)` 属代码可追溯标识，非正文文档元引用，且与 t183/t164 同模式一致。
- 命名：`snake_case` 一致（`hour_fetch`/`is_short_window`/`use_rollup_summary`/`currentRange` 例外为 React 惯例 camelCase）。
- 缩进：4 空格，无 tab。
- task.md front matter 改动经脚本路径（status/branch/worktree/diff_anchor 同步），符合规范。

## 结论

- 前轮 finding 复核：N/A（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：RangePicker mock 改动经全量 button name 冲突排查，无碰撞。

overall: PASS
verdict: PASS

## Round 2 (2026-08-02)

- round：2
- reviewed_at：2026-08-02 11:20 UTC+8
- 复核范围：仅 f001/f002 修复落点（`tests/unit/renderer/views/token_stats_view.test.tsx` 末段测试）+ 同 diff 内源码/文档改动是否引入新问题。

### 前轮 finding 复核

- **t187_gen_f001 (minor)** — 已修确认。测试末尾新增 `expect((mocked_bar_chart.props?.records?.length ?? 0)).toBeLessThan(7)`（L877），配合已有 `hourBuckets?.length === 7`（L876）形成双向断言：hour buckets 完整 7 行 + records 严格少于 7 行，显式区分两条数据源。f001 假想漏检场景（实现同时填 records 与 hourBuckets 且 records ≥7）现已被阻断。
- **t187_gen_f002 (minor)** — 已修确认。L872-874 注释「The 60_000 slack absorbs Date.now() drift between the test's `now` snapshot and the onApply call moment inside the component」明确容差来源，与 t183 同模式注释风格一致。

### 本轮新发现

无。源码侧 `hour_fetch` 条件简化与 `useCallback` deps 删 `preset`、注释同步更新（提及 t187 + custom ≤25h），与 Round 1 分析一致；未引入新行为或新风险。task.md 处置表两条 status=已修、rationale 与 fix_ref 齐全。

overall: PASS
verdict: PASS
