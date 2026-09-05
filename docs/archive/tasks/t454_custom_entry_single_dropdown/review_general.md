# Task review t454（reviewer_focus: 通用）

- task：`t454_custom_entry_single_dropdown`
- spec：`docs/tasks/t454_custom_entry_single_dropdown/spec.md`
- diff_anchor：`eab2856a6c33e2eadae24f963a6e4365607aa588`
- target：`git -C '/home/karon/karson_ubuntu/omni_panel_t454' diff eab2856a6c33e2eadae24f963a6e4365607aa588`
- round：1
- reviewed_at：2026-09-06 05:05 UTC+8

注：本会话默认 cwd 落在主仓（不带 `-C` 的 `git rev-parse --show-toplevel` 输出 `/home/karon/karson_ubuntu/omni_panel`），按任务指令后全体 git 与文件操作均以 `workdir='/home/karon/karson_ubuntu/omni_panel_t454'` / 绝对路径执行，未在错误仓库审阅。

## Findings

无。本轮零发现（clean review，0 finding）。

抽查结论（各视角已扫过 diff 引入/触及路径，无可报项）：

- 规格合规：AC-001（删 `title="自定义时间范围"` 按钮，下拉保留 custom 项）、AC-002（`mousedown`+`click` 开下拉不弹面板 vs 无 down 阶段 click/`change` 才弹）均实现；旧按钮入口测试整体删除且面板用例改走受控 `open`，与范围声明一致；面板校验/应用/持久化/层级未动（非范围守住）。
- 实现正确性：`select_down_ref` 置位/消费/`change` 复位闭环完整；`click_opened_ref` 语义保持（`change` 清零、`onClick` 选中路径置位、吞掉的开下拉动作不碰该 flag）；`RangePicker` 纯受控化后三处关闭路径统一走 `onOpenChange(false)`。`select_down_ref` 在 blur/关闭时不复位的残留窗口已推演：残留 `true` 必被下一次真实 `mousedown` 覆盖（`change` 亦复位），无可达的可观测失败场景，按 Pre-Report Gate 丢弃。
- 安全审视：纯前端受控开关与原生 select 手势区分，无外部输入拼接/执行、无网络面、无 secret/PII；`single` 级无鉴权/资金面（与上下文区一致）。
- 契约·类型·Breaking：`RangePickerProps` 删除 `active`、收紧 `open`/`onOpenChange` 为必填；唯一调用方 `TokenStatsView` 已同步；`rg` 确认 `src` 内无第二调用方；`pnpm typecheck` 全仓干净；mock `RangePicker` 的 `token_stats_view.test.tsx`（38 用例）全绿，无 Breaking 残留。
- 性能与资源：新增单次 `mousedown` 监听与 ref 翻转，无查库/IO/循环；无影响。
- 架构与可维护性：删 `toggleOpen`/`internalOpen` 双态（此前受控/非受控双轨），复杂度下降；`Select` 组件经 `{...props}` 透传 `onMouseDown`/`onClick`/`onBlur` 到原生 `<select>`，无错层。
- 健壮性与可观测：无新增 catch/吞错/重试面；关闭收敛到 `handleRangeOpenChange` 单点清 `click_opened_ref`。
- 测试可信与覆盖：新单测用真实 `TokenStatsView`（未 mock `RangePicker`），`fireEvent.mouseDown`+`click` vs 单独 `click` 正交断言开/不开，直触可观察行为（面板 `应用` 按钮显隐），无恒真/弱化/`.skip`/mock 误用；`user-event` 的 `selectOptions` 语义（开下拉 `click(select)` 含 down 阶段、选项第二次 `click` 无 down 阶段，见 `node_modules/@testing-library/user-event/dist/esm/utility/selectOptions.js:79-95`）与实现模型一致，故 t451 AC-001/AC-002（`user.selectOptions`）与 t453 用例在新逻辑下仍成立——已独立重跑验证 28+38 全绿。风险区已披露的浏览器差异由 e2e 同值 `selectOption`（change 路径）+ AC-005 人工缓释，测试注释如实标注，不作假绿 finding。
- 文档/配置一致性：`RangePicker.test.tsx` 旧按钮用例删除（入口不存在，spec 范围已预告删除并写明理由），其余面板用例改走受控 `open`；实现注释（t454/d052 引用）与行为一致；无配置键/schema 变更。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无前轮。
- 本轮新发现：0 条。
- 未进表的提示：`tests/unit/renderer/views/token_stats_header.test.tsx:176` 注释仍写「center 插槽的 RangePicker 触发」（按钮已删，措辞轻微过时），属 diff 未触及行的注释滞后，不进 finding 表，可随手改或忽略。
- AC 复验方式：
    - AC-001：`re_verified`——`token_stats_header.test.tsx` 新用例（标题栏无该 title、下拉含 custom）独立重跑通过；`RangePicker.tsx:83-86` 确认按钮 JSX 已删、`TokenStatsView.tsx:826` 确认 custom 项保留。
    - AC-002：`re_verified`——新单测（开下拉手势不弹/选中动作弹）独立重跑通过；`TokenStatsView.tsx:785-809` 逐行核对置位/消费/复位逻辑。
    - AC-003：`re_verified`——t451 AC-001 `user.selectOptions` 全序列用例独立重跑通过（28 用例之一）；`onChange` 照常开面板路径未动（`TokenStatsView.tsx:785-794`）。
    - AC-004：`re_verified`——t453 失焦关闭/预设切换既有用例（`token_stats_header.test.tsx` 23 用例 + `token_stats_view.test.tsx` 38 用例）独立重跑全绿；`pnpm typecheck` 干净。
    - AC-005 `[deploy]`：`trust_prior`——需真机原生下拉手势，依赖实施侧 e2e（新增同值重选 change 路径用例）与人工抽查；reviewer 未跑 e2e。
    - coverage = 4 / 5。
- 总体判断：无 blocking finding，AC-001~AC-004 独立复验通过，AC-005 按契约声明属人工项——PASS。
- 系统性 follow-up：无。

reviewed_scope: f46382f4a4689748

verdict: PASS
