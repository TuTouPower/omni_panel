# Task review t168（reviewer_focus: 测试）

- task：`t168_tokenstats_24h_precise_delta`
- spec：`docs\tasks\t168_tokenstats_24h_precise_delta/spec.md`
- diff_anchor：`b47b837f0ec4aa186eaf1e3d4520de520fbf61a3`
- target：`git diff b47b837f0ec4aa186eaf1e3d4520de520fbf61a3`
- round：1
- reviewed_at：2026-07-31 05:32 UTC+8

## Findings

无 finding。

## 评估详情

### 1. 24h 测试是否正确验证 records 驱动 delta

**结论：是，测试有判别力，非恒真。**

新测试 `derives 24h delta from records (not day-bucketed) so windows are symmetric`（token_stats_view.test.tsx:225-269）通过以下组合验证 records 驱动：

- mock `get_buckets` 只返回今天一个 bucket（`bucket_date: today_str`），不含前段 bucket。
- mock `get_records` 按 epoch 范围返回两条记录：`cur`（now-1h）、`prev`（now-25h）。
- 实现侧 `filtered()`（filter.ts:7-14）按 `timestamp` 过滤，currentRecords=[now-24h, now] 含 cur 不含 prev，prevRecords=[now-48h, now-24h] 含 prev 不含 cur。
- 若实现退回 buckets 路径：prevBuckets 为空 → `kpiFromBuckets([])` → prevTokens=0 → `deltaHtml` 返回「前段无数据」（TokenStatsView.tsx:342-345）→ 测试断言 `queryAllByText("前段无数据").toHaveLength(0)` 会失败。
- 因此测试能真正捕获"24h 未走 records 分支"的回归。

`▲|▼` 字符仅在 `deltaHtml` 出现（全仓 grep 确认 src/renderer 仅 TokenStatsView.tsx:349-358），不会因无关文本误匹配。

### 2. mock get_records 的 start/end 过滤逻辑是否精确

**结论：精确，未 mock 被测逻辑。**

mock 实现按 `cur >= start && cur <= end` 过滤（test:236-241），与真实 IPC 语义一致（边界闭区间）。过滤逻辑本身由真实 `filtered()`（filter.ts）执行，mock 只在系统边界（IPC `getRecords`）返回数据，属合法 mock。

时间戳选取严格落在预期窗口：

- cur=now-1h ∈ [now-24h, now] → currentRecords
- prev=now-25h ∉ [now-24h, now]（25h>24h），∈ [now-48h, now-24h] → prevRecords

### 3. 现有 7d delta 测试是否受影响

**结论：未受影响。**

`shows period-over-period delta when the prior window has buckets`（test:195-223）未改动，仍用 buckets 驱动 7d delta，且通过。新实现仅在 `is_short_window <= 25h` 时切 records 路径，7d=168h 走原 buckets 路径，断言路径不变。

### 4. 边界覆盖

- "长窗口不触发 records delta"：现有 7d 测试间接覆盖（仅 mock buckets，不依赖 records 2x 拉取）。
- 24h/7d 边界：24h preset 走 records，7d 走 buckets，二者均有测试。
- AC 列出的 4 个指标（tokens/sessions/calls/hitRate）：测试通过 `toHaveLength(0)` 断言所有 4 处 delta 均无「前段无数据」，配合 `getAllByText(/▲|▼/).length > 0`，覆盖全部 4 个指标有前段数据并出箭头。

### 5. 断言精确性 / 危险模式扫描

逐条扫描，无命中：

- 恒真断言：无。断言依赖 records epoch 过滤与 4 个 KPI 前段数据齐备。
- 删/反转 expect：无（纯新增 46 行）。
- `.skip` / `.only`：无。
- mock 误用：mock 边界为 IPC（getRecords/getBuckets/getSessions），未 mock 内部模块/被测函数。
- 弱化断言：`toHaveLength(0)` 与 `toBeGreaterThan(0)` 在此处语义恰当（不是用 `toBeTruthy`/`toContain` 规避精确比较）。
- 阈值掩盖：用默认 waitFor 超时，未抬 timeout。
- 条件跳过弱化：无 `if (cond) { expect }`。
- 静默错误：无 `@ts-ignore` / `eslint-disable`。

### 运行确认

`npx vitest run tests/unit/renderer/views/token_stats_view.test.tsx` → 8 passed（含新增测试）。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：测试在 IPC 边界 mock，断言路径具判别力（能区分 records/buckets 驱动），覆盖 AC 的 4 个 KPI delta；7d buckets 路径有既有测试保护。可选增强（非 finding）：可补一条精确数值断言（如 `getByText(/150%/)`）以捕获窗口宽度细微偏差，但当前行为级断言已满足 AC「单测覆盖 24h 窗口切分正确性」。

verdict: PASS
