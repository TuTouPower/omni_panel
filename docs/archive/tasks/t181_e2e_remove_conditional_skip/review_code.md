# Task review t181（reviewer_focus: 代码）

- task：`t181_e2e_remove_conditional_skip`
- spec：`docs/tasks/t181_e2e_remove_conditional_skip/spec.md`
- diff_anchor：`ed238e9d2e3a011c784f4db1a5820097b640b83c`
- target：`git diff ed238e9d2e3a011c784f4db1a5820097b640b83c`
- round：1
- reviewed_at：2026-08-01 16:06 UTC+8

## Findings

### t181_code_f001 - spec 头注释把手工 fixture 补充误记为 gen_synthetic 机制，重生成会静默破坏测试数据

- 严重度：minor
- 锚点：AC3（既有通过用例不受影响 / skip 处置可复核）；非 AC 缺口，属实现说明与事实不符
- 位置：`tests/e2e/web/account_error_badge.spec.ts:6-8`、`tests/e2e/web/opencode_go_usage.spec.ts:9-10`
- 问题：
    - `account_error_badge.spec.ts` 头注释写 "gen_synthetic 把该错误注入其 items（last_error → item.error）"；`opencode_go_usage.spec.ts` 头注释写 "synthetic fixture 由 gen_synthetic 补充 opencode_go connector"。但 `scripts/e2e/gen_synthetic.mjs` 本 task 未改动（spec 非范围，禁改），本次 KIMI items 的 `error` 注入与 opencode_go connector 条目均为手工直接写入 `tests/e2e/fixtures/synthetic.json`。
    - 机制性风险：`gen_synthetic.mjs` 只做脱敏 + 取前 3 instance + 补 failed_real connector，重跑 `pnpm e2e:gen-synthetic` 会用生成结果整体覆写 `synthetic.json`，静默抹掉手工的 KIMI `error` 注入与 opencode_go connector。本 task 已删除对应条件 guard，重生成后 `account_error_badge` / `opencode_go_usage`（可能连带 `popup_card_states` 的错误 banner 分支）会从可跑变红，且无 skip 兜底。
    - 该风险在 `task.md` 实施笔记有记录（"下次 e2e:gen-synthetic 重生成会覆盖这些手工条目"），但 spec 文件内注释把机制归属写成 gen_synthetic，未来维护者读注释会误以为重生成安全。
- 建议：两处注释改为"手工补充 synthetic.json（gen_synthetic 未含此项，重生成会覆盖）"；如需持久，按 spec 非范围约束另立 task 更新 `gen_synthetic.mjs`。

### t181_code_f002 - synthetic.json 全文件缩进重排（4→2 空格）造成约 3350 行 diff 噪音

- 严重度：minor
- 锚点：无 AC 违反；代码质量（diff 可审阅性）
- 位置：`tests/e2e/fixtures/synthetic.json`
- 问题：语义变更仅 6 处（`/v1/connectors` 数组 4→5、KIMI connector `[3].snapshot.items[0/1].error`、KIMI state items `[0/1].error`、新增 `GET /v1/connectors/synthetic-opencode-go/state`），但 diff 达 3358 行，其中约 3350 行是纯缩进重排（旧 4 空格 → 新 2 空格）。我做了语义 diff（parse 两版本 JSON 逐节点比较）确认除上述 6 处外无其它内容变化。重排虽与 `gen_synthetic.mjs` 的 `JSON.stringify(out, null, 2)` 输出格式对齐（可减少下次重生成的 diff），但属于本 task 功能范围外的全文件改动，放大了审查噪音与合并冲突面。
- 建议：如保留 2 空格格式，缩进重排应独立 commit 并与功能变更分离；或在 task 说明中注明重排动机。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 范围外观察（pre-existing，非本 task 引入）：synthetic fixture 的 trend key 用短 metricId（如 `metricId=rolling`），而 renderer 的 trend 拉取用 `period.id`（完整 item id，见 `src/renderer/components/ProviderAccountRow.tsx:98` → `src/web/usageboard-web.ts:230-240`）。因此 synthetic 下所有 provider 的 sparkline trend 请求都返回 `[]`。本次新增的 opencode_go trend 数据同样未被消费。本 task 未触碰 trend key，判定为既有系统性 fixture 不一致；如要修复建议单独立 task（改 fixture 生成或对齐 trend key）。
    - 注释小误：`popup_card_states.spec.ts:13-14` 称 KIMI "含 stale items"，但 fixture items `stale: false`，且 `.card-state.err` banner 的触发条件是 `hasError && hasUsage`（`ProviderCard.tsx:94-95`），与 stale 无关——功能不受影响，仅注释与事实不符。
    - 文件过大 / 复杂度：无（改动集中在 fixture 数据正文与 spec 测试文件，测试文件均远低于阈值）。
- 总体判断：实现层与代码质量无 blocking 问题。6 处条件 skip 全部有明确处置（5 处补 fixture 可跑、1 处修正选择器），`src/` 生产代码零改动；synthetic.json 的 opencode_go connector 形状与真实 `connectors/opencode_go/connector.ts` 输出一致（provider=opencode_go、raw_label rolling/weekly/monthly、normalized_label 滚动/一周/一月、source=session、window 语义经 MetricRecord 映射一致）；KIMI items `error` 注入走通真实渲染链（item.error → `to_period` → `buildAccountErrors` → `ProviderAccountRow._error` → `.error-badge`）。AC1/AC2 满足，AC3 无可跳过用例（web e2e 已无 `test.skip` 残留）。仅 minor 可 PASS。
- 系统性 follow-up：无（trend metricId 不一致若修，建议标题「对齐 synthetic fixture trend key 与 renderer metricId 语义」，slug `e2e_synthetic_trend_key_alignment`，非阻断）。

verdict: PASS
