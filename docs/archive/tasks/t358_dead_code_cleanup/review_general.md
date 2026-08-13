# Task review t358（reviewer_focus: 通用）

- task：`t358_dead_code_cleanup`
- spec：`docs/tasks/t358_dead_code_cleanup/spec.md`
- diff_anchor：`6ea0b16d81866cac48385bf10952f1c0e51990f3`
- target：`git diff 6ea0b16d81866cac48385bf10952f1c0e51990f3`
- round：1
- reviewed_at：2026-08-14 01:51 UTC+8

## Findings

### t358_gen_f001 - vitest 全绿门禁被预存 flaky 测试打断（非本 task 引入）

- 严重度：minor
- 锚点：可测试性声明「全部 AC 可自动测试：删除后 typecheck/lint/test 通过即证明无残留引用」；AC-001/002/003 均满足
- 位置：`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:352`
- 问题：全量 `tests/unit/renderer tests/integration/observation tests/unit/main/core/token-stats` 跑出 1 失败（1503/1504），失败项为「最近会话：快捷选择最近 6 个并按结束时间取前六」，断言 `.session-recent-check` 文本等于 `["1","2","3","4","5","6",""]` 却收到全空串。经对比锚点基线（临时 worktree @ 6ea0b16）验证：该测试在**未含 t358 改动**的锚点同样 flaky——单文件跑一次失败、复跑通过；全量跑一次通过。t358 未触及 `WorkspaceView.tsx` / `RecentSessionsModal.tsx` / `lib/workspace/slots.ts` 及其测试，删除的 `content_hits` 为只写不读的纯状态移除（`SessionLibrary.tsx` 四行），与渲染无关。判定为预存 flaky（事件时序/选择器先于标记写入），非 t358 回归。建议另行登记 flaky 修复 task（与 t358 同批无关），不阻塞本 task。
- 建议：另建 task 稳定该测试（如对标记渲染加 waitFor 或在响应 mock 后同步 flush）；t358 不需动。

## 结论

- 前轮 finding 复核：Round 1 无前轮
- 本轮新发现：1 条（minor，预存 flaky，非本 task 引入）
- 未进表的提示：
    - **BarChart records 兜底已不可达**：`src/renderer/components/token-stats/BarChart.tsx:150-160` 的 `prepareBarData(records ?? [], ...)` 兜底分支，因唯一生产调用方 `TokenStatsView.tsx:1027` 恒定传 `chartData={dashboard.chart_data}` 而实际不可达（`BarChart.tsx:119-134` 先走 chartData 路径）。属 task 注释明确声明的防御性保留（「kept for the prepareBarData fallback when chartData is absent」），组件保持独立可复用，非误删、非漏删，不计 finding。
    - **`records` 改可选无破坏**：BarChart 仅 TokenStatsView 一处生产调用（全仓 grep 确认），改 optional 后该调用方不传 records，`tsc` 通过；`buckets`/`hourBuckets`/`rollup` 本就可选，删除传参无类型破坏。
    - **删除完整性实测**：`Button.tsx`/`Card.tsx`/`lib/session_meta.ts`/`CpaAddDialog.tsx`/`usage_window_elapsed`/`showCpaAdd`/`content_hits`/`plugin_infos`/`TokenTimeRange` 均零生产与零测试引用（全仓 grep 空）；`lib/session_meta` 被删模块与 `lib/workspace/slots.ts` 的 `session_meta` 函数同名但不同模块，未误删。
    - **测试删除一致性**：删 5 测试文件（button 7 / card 4 / session_meta 2）+ token_panel 2 + usage-colors 1 = 16 case，与基线 1519 → 1503 逐项吻合；删除对象均为只测死组件的用例或与已删控件强耦合的用例，保留断言全部触达可观察行为（无恒真断言残留）。
    - **AC-002 单一入口验证**：`AddAccountDialog.tsx:14,395-396` 经 `CpaMgmtForm` 承接 CPA 添加，`common-services.ts:21` `cpa` 仍在 `ADD_COMMON_SERVICES`，VendorPicker 删 plugin_infos 后 CPA 选项仍走 `on_select` → AddAccountDialog；`CpaConnectorSettings.tsx`/`CpaCard.tsx`/`CpaLabelMapDialog.tsx` 均无 CpaAddDialog 残留引用。
- 总体判断：9 项死代码删除全部落地且零残留引用，`tsc --noEmit` / `eslint --max-warnings=0` / `knip --include files,dependencies` 均绿；t358 相关测试（renderer/components、lib、add_account、session-library、settings_view、token-stats、integration/observation、main/core/token-stats）全过。唯一失败为预存 flaky 测试（锚点基线同样复现），非本 task 引入。仅有 1 条 minor（预存、范围外），无未解决 critical / important。
- 系统性 follow-up：建议登记 flaky 测试修复（`WorkspaceView.test.tsx:352` 最近会话标记断言），与 t358 解耦。

verdict: PASS
