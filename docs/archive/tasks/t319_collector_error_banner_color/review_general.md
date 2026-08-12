# Task review t319（reviewer_focus: 通用）

- task：`t319_collector_error_banner_color`
- spec：`docs/tasks/t319_collector_error_banner_color/spec.md`
- diff_anchor：`91999104981fc8d5690614f49932ade3ca7e977c`
- target：`git diff 91999104981fc8d5690614f49932ade3ca7e977c`
- round：1
- reviewed_at：2026-08-12 16:30 UTC+8

## Findings

无（clean review）。

## 结论

- 本轮新发现：0 条
- 未进表的提示：
    - 非范围确认：auth 分支（`provider_card_states.tsx:48` 保留裸 STATE_BASE 灰）与 off 分支（`:99` STATE_BASE + muted）未改；SelectionTray/SessionRail 等 `muted + hover:error` 位点未触碰，与 spec 非范围声明一致。全 `src/renderer` 内 `text-[var(--color-error)]` 位点中，仅本两处由 STATE_BASE 组合而成，无遗漏同类冲突位点。
    - 断言方式为 className 串断言（error 存在 + 灰类不存在），触达真实 `cn()`/twMerge 输出，与 spec 测试策略明文一致；jsdom 不做 CSS 级联，computed 色值以 p143 复现（rgb(239,68,68)）佐证，断言非恒真。
    - 全量 `pnpm test` 独立重跑通过：257 files / 2941 tests passed，9 skipped。
- 总体判断：两处 err 分支由裸字符串拼接改为 `cn(STATE_BASE, "text-[var(--color-error)]")`，twMerge 将冲突灰类去重、error 保留（独立 node 复验确认），最小改动、无范围外偏航；测试断言触达真实输出且能挡住「灰覆盖红」回归，三条 AC 全部落实，无 blocking finding，PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`。读 `src/renderer/components/provider_card_states.tsx:73`：err 分支 className 改为 `cn(STATE_BASE, "text-[var(--color-error)]")`；独立 node 跑 tailwind-merge，`cn` 输出灰类被去重、仅保留 `text-[var(--color-error)]`（`text-[13px]` 字体组不受影响）；AC-001 测试渲染无 group 的 ProviderCard（isFailed→err 分支），`getByTestId("card-state")` 断言 `data-variant="err"`、error 类存在、灰类不存在，测试文件 11/11 通过。
- AC-002：`re_verified`。读 `src/renderer/components/provider_card_states.tsx:126`：banner err 分支同改；AC-002 测试渲染 group=makeGroup()（periods 非空→has_stale_error→ProviderCardErrorBanner），经 `采集失败：` 文本 closest 定位 `data-testid="card-state"`，断言 variant=err、error 存在、灰类不存在，测试文件通过。
- AC-003：`re_verified`。读测试源 `tests/unit/renderer/components/provider_card_states.test.tsx:85-117`：新增两处颜色断言（AC-001/AC-002 各一），均断言 error 类存在且 `--color-on-surface-variant` 灰类被消除，非恒真；全量 `pnpm test` 独立重跑 257 files / 2941 tests passed（9 skipped），全绿。

coverage = 3 / 3

reviewed_scope: e1ca6761046b1921

verdict: PASS
