# Task plan

## 关键设计

`bucketize(start, end, gran)` 改为**自然边界切分**：

1. 求 `first_boundary`：大于 `start` 的第一个自然边界（day 模式为本地 0 点；hour 模式为本地整点）。
2. bucket 列表：
    - bucket 0: `[start, first_boundary)` — 首 partial
    - bucket 1..n-2: 完整自然日/小时
    - bucket n-1: `[last_boundary, end)` — 末 partial（若 end 非整点/非 0 点）
3. `n` = 完整 bucket 数 + (首 partial 存在 ? 1 : 0) + (末 partial 存在 ? 1 : 0)。
4. `label(i)`：取 bucket i 起点所在自然日（day 模式 `M/D`；hour 模式 `H:00`）。
5. `idx(ts)`：二分或线性扫 bucket 边界数组找到 ts 所属 bucket；ts < start 或 ≥ end 时 clamp 到 [0, n-1]。

实现要点：

- day 模式首边界：`next_midnight = new Date(start); next_midnight.setHours(24, 0, 0, 0)`（自动跨日）。
- hour 模式首边界：`next_hour = new Date(start); next_hour.setMinutes(60, 0, 0)`。
- 完整 bucket 仍按固定 step（86400000 / 3600000）步进，遇到 DST 边界让 `setHours` 自动处理。

## 步骤与验证

1. 重写 `bucketize`：生成 bucket 边界数组 `bounds: number[]`（长度 n+1），`idx(ts)` 用二分查找 → 验证：新增单测覆盖各场景。
2. 单测：
    - start=7/17 15:30, end=7/24 15:30, gran=day → n=8，labels = `["7/17","7/18",...,"7/24"]`，idx(7/17 16:00)=0，idx(7/18 01:00)=1，idx(7/24 10:00)=7。
    - start=7/23 15:30, end=7/24 15:30, gran=hour → n=25（首末 partial + 23 完整），labels 含 `15:00, 16:00, ..., 15:00`。
    - start=0 点整（已对齐）→ 不产生额外 partial bucket。
    - end=0 点整（已对齐）→ 末 bucket 完整，无额外 partial。
3. 更新既有 `aggregate.test.ts` 的 bucketize 用例（原 `T00:00:00` 起点仍应通过）→ 验证：测试通过。
4. 手工黑盒：打开代理面板选「7 天」目视确认 8 根柱子，首末 partial。
5. `pnpm test` 全量。

## 风险与回退

- 风险：n 变大（7→8、30→31）导致柱状图过密，dataZoom slider 触发阈值 `nCat > 14` 被触发。
    - 缓解：30d 原本 30 根已超阈值；7d 8 根仍 < 14 无变化；视觉自洽。
- 风险：hour 模式 axisLabel `interval` 函数 `new Date(start + index * 3600000)` 假定 step=3600000 等距，改用自然边界后该假设仍成立（bucket i 起点是自然整点），但 formatter 取 `start + i * 3600000` 不再等于 bucket 起点。
    - 缓解：`BarChart.tsx:144-151` 的 formatter / interval 需同步改为通过 labels[i] 或 bucket 起点取时间。plan 实施时一并改。
- 风险：`prevRangeRecords` 与当前窗口对比时，前一窗口数据对应不上新 bucket 边界。
    - 缓解：`prevRangeRecords` 仍按等长窗口计算，对比数据按新 bucketize 重新分配，逻辑自洽。
- 回退：revert commit。

## Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：如有 token-stats 时间窗口约定条目则更新。
