# Task review t453（reviewer_focus: 通用）

- task：`t453_custom_select_click_close_polish`
- spec：`docs/tasks/t453_custom_select_click_close_polish/spec.md`
- diff_anchor：`9d3e56f53e17264c04c684135b5a297c91b018e1`
- target：`git -C '/home/karon/karson_ubuntu/omni_panel_t453' diff 9d3e56f53e17264c04c684135b5a297c91b018e1`
- round：1
- reviewed_at：2026-09-05 14:58 UTC+8

reviewed_scope: ad9313a7c6b06483

## Findings

无。本轮 0 finding（clean review，不凑数）。

## 结论

- 前轮 finding 复核：Round 1，无前轮，无复核项。
- 本轮新发现：0 条。
- 7 视角覆盖：规格合规 / 实现正确性 / 安全 / 契约·Breaking / 性能·资源 / 架构·可维护性 / 健壮性·可观测 / 测试可信·文档一致性均已扫过 diff 触及路径（`src/renderer/views/TokenStatsView.tsx`、`tests/unit/renderer/views/token_stats_header.test.tsx`；`task.md` 仅状态字段流转，不在评审 scope）。各视角均无可辩护 finding，细节见下。
    - 规格合规：AC-001（失焦自动关闭、区间保持 custom、不发新查询）实现与测试一一对应；AC-002 预设分支有测试，custom 重应用分支经代码确认受同一 flag 清除保护（`handleCustomApply` 清 flag + blur 入 zone 豁免），属“可再加 case”而不 blocking；t451 回归用例同文件全过。
    - 实现正确性：flag 生命周期闭环（置位仅 `TokenStatsView.tsx:795` onClick；清零点：`661/670/782/689/805`），blur 关面板与 change 收场互斥正确（onChange 先清 flag，AC-002 不受干扰）；blur 入 zone 豁免（`800-803`）保证焦点进面板编辑时不误关；`relatedTarget === null` 视作外部而关闭，符合 AC-001 取消语义。
    - 安全：纯前端受控开关，无外部输入拼接/执行、无 secret/PII、无鉴权面。无 finding。
    - 契约·Breaking：仅内部 `useRef<boolean>` + 局部 handler，无公开签名/schema/配置键变更。无 finding。
    - 性能·资源：一次 ref + 同步状态置位，无循环查库/IO/订阅泄漏（未新增 effect）。无 finding。
    - 架构·可维护性：`handleRangeOpenChange` 非薄包装（承载清 flag 语义），改动面最小。见未进表提示第 1 条。
    - 健壮性·可观测：无空 catch/吞错/重试语义；关闭路径幂等（重复 blur/外部点击均收敛于关 + flag false）。无 finding。
    - 测试可信：两新增用例断言可观察行为（面板“应用”按钮存在性、下拉值、`get_dashboard` 调用次数/窗口），无恒真/删 expect/skip/mock 被测逻辑；复用既有 dashboard stub，符合上下文区测试策略。
- 未进表的提示（非 finding，不阻断；implementer 可自行决定是否跟进）：
    - `src/renderer/views/TokenStatsView.tsx:806` blur 路径直调 `setRangePickerOpen(false)` 而非 `handleRangeOpenChange(false)`，现状等价（flag 已在 805 手动清零），但后续若给 handler 加逻辑会漏 blur 路径，建议统一走 handler。
    - AC-002 的“重选 custom（经 RangePicker 应用）”子分支与“blur 焦点落入 zone 内不关闭”行为无专项用例，当前仅 preset 分支有测试；属覆盖可更广，加 case 即 minor，不 blocking。
    - change-open 后的尾随 click（userEvent/jsdom 序列在 change 后补发 click，见既有注释）会把 `click_opened_ref` 置 true，使 change-open 与 click-open 不可区分；现状 benign（入 zone blur 豁免、出 zone blur 本就该关），只记一笔，未来若依赖该 flag 区分来源需重构。
- AC 复验方式：
    - AC-001：`re_verified`。独立重跑 `pnpm vitest run tests/unit/renderer/views/token_stats_header.test.tsx`（21/21 通过，含新增 t453 AC-001 用例）；复核断言本身：面板关闭（“应用”按钮消失）、下拉值保持 `custom`、`get_dashboard` 停留 2 次。
    - AC-002：`re_verified`（preset 分支）。同命令重跑通过；复核 t453 AC-002 用例断言预设生效关面板；custom 重应用分支仅代码走读确认（`handleCustomApply` 清 flag + zone 豁免），无独立用例。
    - AC-003 `[deploy]`：`trust_prior`。真机原生下拉/Esc 手势 reviewer 无法复验，依赖实施侧人工操作确认证据。
    - coverage = 2 / 3。trust_prior 占比 33% > 30%：建议合并前人工抽查 trust_prior 项（AC-003 真机点外部/Esc 后面板不滞留）。
- 总体判断：diff 小而闭环，无 blocking 问题，PASS。
- 系统性 follow-up：无（`task.py list/show` 只读核查省略：本轮无跨 task 基础设施缺口，未触公共代码）。

verdict: PASS

## Round 2 (2026-09-05 15:02 UTC+8)

- round：2
- reviewed_at：2026-09-05 15:02 UTC+8
- diff_anchor：`9d3e56f53e17264c04c684135b5a297c91b018e1`
- target：`git -C '/home/karon/karson_ubuntu/omni_panel_t453' diff 9d3e56f53e17264c04c684135b5a297c91b018e1`

reviewed_scope: ca7dac2a3b3bf525

## Findings（本轮）

无。本轮 0 finding（clean review，不凑数）。

## 结论（本轮）

- 前轮 finding 复核（Round 1 共 0 条 finding）：无可复核 blocker。另复核 Round 1 未进表提示第 1 条（blur 路径直调 `setRangePickerOpen(false)` 建议统一走 `handleRangeOpenChange`）：已落实——当前 diff 中 `TokenStatsView.tsx:806` blur 路径已改为 `handleRangeOpenChange(false)`，flag 清零内聚于 handler（`688-691`），与 `RangePicker onOpenChange` 共用同一收口；无引入新问题。Round 1 其余两条提示（AC-002 custom 重应用无专项用例、change-open 尾随 click 置 flag）现状依旧 benign，不升级为 finding。
- 本轮新发现：0 条。
- 7 视角覆盖（仅 diff 触及路径 `src/renderer/views/TokenStatsView.tsx`、`tests/unit/renderer/views/token_stats_header.test.tsx`；`task.md` 仅状态字段流转，不在评审 scope）：
    - 规格合规：AC-001/AC-002 实现与测试对应关系不变；blur 统一走 handler 后语义等价（flag 已在 handler 内清零），AC-001/AC-002 不受影响；t451 回归用例同文件全过（21/21）。
    - 实现正确性：flag 生命周期仍闭环（置位仅 `795` onClick；清零点 `661/670/782/689` + handler `689` 覆盖 blur 与外部关闭）；blur 入 zone 豁免（`800-803`）保留；`relatedTarget === null` 视作外部关闭，符合 AC-001 取消语义；`onClick` 直调 `setRangePickerOpen(true)` 与 handler 的 `open=true` 分支等价，无行为差。
    - 安全：纯前端受控开关，无外部输入拼接/执行、无 secret/PII、无鉴权面。无 finding。
    - 契约·Breaking：仅内部 `useRef<boolean>` + 局部 handler，无公开签名/schema/配置键变更。无 finding。
    - 性能·资源：一次 ref + 同步置位，无循环查库/IO/订阅泄漏（未新增 effect）。无 finding。
    - 架构·可维护性：`handleRangeOpenChange` 承载清 flag 语义且三处关闭路径（blur/RangePicker 外部关闭）共用，内聚较 Round 1 提升；剩余直调点（`796` open、`666/826-827` close）与 handler 等价，统一与否不影响行为，不进 finding。
    - 健壮性·可观测：无空 catch/吞错/重试语义；关闭路径幂等（重复 blur/外部关闭收敛于关 + flag false）。无 finding。
    - 测试可信·文档一致性：两新增用例断言可观察行为（面板“应用”按钮存在性、下拉值、`get_dashboard` 次数/窗口），diff 内无恒真/删 expect/skip/mock 被测逻辑（grep 危险模式无命中）；复用 dashboard stub 符合上下文区策略。
- 未进表的提示（非 finding，不阻断）：
    - AC-002 的“重选 custom（经 RangePicker 应用）”子分支与“blur 焦点落入 zone 内不关闭”仍无专项用例（沿用 Round 1 结论），属覆盖可更广，加 case 即 minor，不 blocking。
    - change-open 后的尾随 click 置 flag 现象依旧（沿用 Round 1 结论），现状 benign（入 zone 豁免、出 zone 本就该关），仅记录。
- AC 复验方式：
    - AC-001：`re_verified`。独立重跑 `pnpm vitest run tests/unit/renderer/views/token_stats_header.test.tsx`（21/21 通过，含 t453 AC-001 用例）；复核断言本身：面板关闭（“应用”按钮消失）、下拉值保持 `custom`、`get_dashboard` 停留 2 次。
    - AC-002：`re_verified`（preset 分支）。同命令重跑通过；复核 t453 AC-002 用例断言预设生效关面板；custom 重应用分支仅代码走读确认（`handleCustomApply` 清 flag + zone 豁免），无独立用例。
    - AC-003 `[deploy]`：`trust_prior`。真机原生下拉/Esc 手势 reviewer 无法复验，依赖实施侧人工操作确认证据。
    - coverage = 2 / 3。trust_prior 占比 33% > 30%：建议合并前人工抽查 trust_prior 项（AC-003 真机点外部/Esc 后面板不滞留）。
- 总体判断：Round 1 建议已按预期闭环且未引入新问题，无 blocking，PASS。
- 系统性 follow-up：无。

verdict: PASS
