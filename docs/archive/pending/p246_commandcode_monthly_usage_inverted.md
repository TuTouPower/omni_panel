# p246 Command Code 月度用量计算反转与展示风格不一致

- 现象：用量面板中 Command Code 账号的「月额度」进度条与数值显示为已消耗 ~80%（如 56.16/70），而实际官方 CLI / Web 明确显示为「Monthly Limit 20%」（重置日期 10/13）；月度消耗量与剩余额度被完全颠倒，且月度重置时间未在用量行中显示。
- 影响：Command Code 账号在用量面板中的月度消耗比例和进度条反向展示（把剩余 80% 渲染成消耗 80%），状态预警阈值（normal/warning/critical）被反向误触发；且因使用了 `ratio` 风格导致月度重置日期被隐藏，无法与 5-Hour、Weekly 两行窗口的百分比和倒计时对齐。
- 根因：
    1. 产品缺陷（数据语义混淆）：Command Code API `/alpha/billing/credits` 返回的 `credits.monthlyCredits` 实际为当月「剩余额度」（balance/remaining credits，与官方 CLI 逆向代码 `monthlyRemaining = credits.monthlyCredits` 一致）。而在 `connectors/commandcode/connector.ts` 中，直接将其赋值给了观察量中的 `used`（`used: monthly_remaining`）。在 OmniPanel 架构与前端组件（`UsageBarRow`）中，`used` 表示「已使用量」，进度条百分比由 `used / limit * 100` 计算。当套餐（如 `individual-goat`）上限为 70、剩余 56.16 时，实际已使用量为 `70 - 56.16 = 13.84`（即 20%），但代码将 56.16 作为 `used` 产出，计算出 `56.16 / 70 = 80.2%`，造成用量完全反转。
    2. 状态阈值反向判定：代码使用了 `ctx.status.for_ratio(monthly_remaining, monthly_cap)`。`for_ratio` 约定首参为已使用量（比例接近 1.0 时为 critical）；传入剩余量导致余额越充足反而越容易被判定为 critical/warning，余额耗尽时反而返回 normal。
    3. 展示风格与重置时间隐藏：5 小时和周窗口均使用 `display_style: "percent"`，而月度使用了 `display_style: "ratio"`。`UsageBarRow.tsx` 中当 `is_ratio` 成立时，强制将 `reset_time` 置空（`const reset_time = !has_value || is_ratio || !period.resetAt ? ""`），导致 `Resets on Oct 13` 的重置时间在薄行模式下丢失。
    4. 同类位点扫描：扫描了 `connectors/` 下所有 18 个连接器的 `for_ratio`、`for_balance` 及 `used` 赋值，其余连接器（GLM、MiniMax、Firecrawl、Tavily、MiMo、Exa、DeepSeek、TikHub 等）对消耗量与余额区分明确，仅 Command Code 存在此语义颠倒问题，已确认无其他同类位点。
- 测试缺口：`tests/unit/connector/commandcode.test.ts` 中 AC-003 测试用例存在「测试假绿」：mock 了 `monthlyCredits: 18.25` 后直接断言 `expect(monthly?.used).toBe(18.25)` 和 `expect(monthly?.display_style).toBe("ratio")`，把错误的实现当成了预期。应在 `tests/unit/connector/commandcode.test.ts` 中补测：
    1. 断言 `used` 为实际已消耗量 `monthly_cap - monthly_remaining`（即 `30 - 18.25 = 11.75`）；
    2. 断言 `display_style` 为 `"percent"`，与官方 5 小时、周窗口保持一致；
    3. 验证 `reset_at` 能在标准百分比模式下正常向前端输出；
    4. 断言高余额（低消耗）时状态为 `normal`，低余额（高消耗）时状态为 `critical`；
    5. 覆盖当套餐 ID 未知（`monthly_cap` 为 null）时的防御降级行为。
- 线索：`.scratch/test_cc.py`（调取官方接口抓取完整数据验证字段语义）、`.scratch/repro_bug.ts`（最小复现与反向算法验证）。
- 处理：t498
