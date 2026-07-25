# Task review t115（reviewer_focus: 测试）

- task：`t115_opencode_go_html_scrape`
- spec：`docs\tasks\t115_opencode_go_html_scrape/spec.md`
- diff_anchor：`4eb3e8cd3c76fc565043f5013d1237428f5f3678`
- target：`git diff 4eb3e8cd3c76fc565043f5013d1237428f5f3678`
- round：2
- reviewed_at：2026-07-26 03:05 UTC+8

## Findings

本轮新发现：0 条。

## Round 1 复核

### t115_test_f001（important）— 已修，彻底

- 位置：`tests/unit/connector/opencode_go.test.ts:404-430`
- 复核：`it.skipIf(!existsSync(".scratch/opencode_go_probe/go.html"))` 替代原 `try/catch + return`。snapshot 缺失时 vitest 报 skipped（非 passed），CI 信号诚实。snapshot 存在时跑硬编码断言（rolling=0 / weekly=22 / monthly=100 + 三 raw_label + error null）。
- 弱化检查：未换成另一种 silent-pass 形式（如 `if (!exists) expect(true).toBe(true)`），整用例被 skipIf 条件化，断言块完整保留。

### t115_test_f002（minor）— 已修，彻底

- 位置：`tests/unit/connector/opencode_go.test.ts:399-401`
- 复核：data-slot 用例补三条 `expect(result.observations[i]?.used).toBe(12|34|56)`，与 SSR 用例数值对齐，覆盖 `parse_data_slot_window` 的 value 正则提取路径。

### t115_test_f003（minor）— 已修，彻底

- impl 侧：`connectors/opencode_go/connector.ts:228` value 正则由 `[^0-9]*(\d+(?:\.\d+)?)` 改为 `[\s\S]*?(-?\d+(?:\.\d+)?)`，支持负号捕获。
- 测试侧：`tests/unit/connector/opencode_go.test.ts:479-501` 新增 `clamps negative data-slot usage value to 0`，fixture `<span data-slot="usage-value">-5%</span>`，断言 `used === 0` 且 `Number.isFinite(...)`。如果 regex 退化（`[^0-9]*` 吞掉 `-`），used 会等于 5，断言失败。回归被拦截。
- 复核：SSR 侧负数用例（`primary path: clamps negative usagePercent to 0`）原本就在，AC#6 两条解析路径（SSR + data-slot）均覆盖。

### t115_test_f004（minor）— 已修，彻底

- 位置：`tests/unit/connector/opencode_go.test.ts:503-521`
- 复核：`error messages are sanitized (no HTML or cookie leakage)` 用例注入 `SESSION_COOKIE: "session=secret-leak-xyz"`，触发 `/auth` 不跳转 workspace 错误路径，断言：
    - `result.error` 含固定常量文案 `"Cookie 可能已失效，未跳转到 workspace"`
    - `result.error` 不含 `session=secret-leak-xyz`（cookie 原值）
    - `result.observations === []`
- AC#7「不含 cookie」核心被覆盖。AC#7 的「不含原始 HTML」与「长度受限」未单独构造 fixture（当前 error 路径 error 字符串均为 hardcoded 常量，不含 HTML；长度限制无显式 sanitize 函数）。属覆盖可加宽项，非 finding——AC 主要语义（cookie 不泄露）已验证。

## 本轮扫描结论

危险模式扫描（逐条）：

- 恒真断言 / 删除反转 expect / 注释断言：无。
- 弱化断言：无。`expect(result.error ?? "").not.toContain(cookie_value)` 是合理的反向包含断言；`Number.isFinite(... ?? NaN)` 是 finite 校验，非弱化。
- 删测试 / `.only`：无。
- `.skip`：仅 `it.skipIf(!existsSync(...))` 一处，针对 live snapshot（AC#8 依赖可选 snapshot 文件），合法。
- 静默错误（`eslint-disable` / `@ts-ignore`）：测试文件无；impl 文件两处 `// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition` 在 connector.ts，非测试轴范围。
- mock 误用：mock 边界限定在 `ctx.http`（系统边界），未 mock 内部模块或被测逻辑本身。
- 阈值掩盖 / 条件跳过弱化断言 / 程序赋值 / 存在即通过：无。

AC 覆盖：AC1-AC8 均有用例对应（详见 Round 1 报告 + 本轮复核）。

测试可信：黑盒 `run_connector(manifest, script, ctx)`，不 import 内部 parse 函数（impl 禁 `import/export`，spec 已说明）。异步全 `await`。无 race / timeout 掩盖。

## 总体判断

前轮 4 条 finding 全部真修，无换形式弱化。本轮 0 新发现。

verdict: PASS
