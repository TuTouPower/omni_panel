# Task review t538（reviewer_focus: 通用）

- task：`t538_remove_button_focus_ring`
- spec：`docs/tasks/t538_remove_button_focus_ring/spec.md`
- diff_anchor：`c666bd36e6078b7ae000ff174f9dfb09d4452abb`
- target：`git diff c666bd36e6078b7ae000ff174f9dfb09d4452abb`
- round：Round 1
- reviewed_at：2026-09-30 19:10 UTC+8

## Findings

零 finding。

复核记录（按评审要点逐项，diff 实际内容）：

- 规格合规：AC-001/002 由 `tests/e2e/web/popup_view.spec.ts` 新增 t538 三用例覆盖（初始/点击后/失焦重进三态 `matches(':focus-visible')===false` + 类名无 `ring-` 片段 + box-shadow none；标题栏 Button 与 web 原生 `<a>` 互跳链接抽样同断言）；AC-003 守卫用例证实设置备注输入框聚焦边框变色 + 非 none shadow（B 类未动）。范围：`Button.tsx`、`icon-link.ts`、PopupView p261 段、测试、decisions，与 spec 约束一致，无偏航。`ProviderNav.tsx:90` 的 dashed outline 为拖拽指示器（非 focus-visible 门控），未动正确；ECharts `emphasis.focus` 未动符合非范围。
- 实现正确性：`focus-visible:outline-none` 保留压住 UA 默认描边；`useRef`/`useEffect` 在 PopupView 仍被其余逻辑使用（typecheck+lint 通过）；容器 `outline-none` 类随不可聚焦 div 保留，无害。`tailwind-merge` 残留复查：`ring-[var(--color-accent)]`（非 `-ring` 后缀）在 `src/`、`tests/` 已零命中，半透明 `accent-ring`（B 类）全部保留。
- 安全审视：纯 CSS 类删除 + 事件监听删除，无外部输入、无拼接执行、无 secret/日志变动。无问题。
- 契约·类型·Breaking：无公开签名/schema/配置键变更；`SaveAccountOptions` 等无关。`focus({ focusVisible: true } as FocusOptions)` 中途出现过又被实现移除（见实施笔记），最终 diff 无该写法，无类型滥用。
- 性能与资源：删除 window focus 监听，轻微正向。无问题。
- 架构与可维护性：注释同步（Button/icon-link 互指仍成立）；p261 注释与死 ref 一并清除，无残留死代码（knip 门禁过）。
- 健壮性与可观测：删除的 effect 无清理遗漏（监听与 ref 同删）；其余 effect 不变。无问题。
- 测试可信与覆盖：红绿证据完整（改前 AC-001/002 失败、AC-003 通过；改后三用例通过）；断言触达真实 Chromium 可观察行为（computed box-shadow、类名、`:focus-visible`），无 mock 被测逻辑；p261 jsdom 旧用例整体删除理由在 spec「有意不测」已写明，符合「整体删除并写明理由」，未就地改预期。`pnpm test` 342 文件全绿（含补跑的 `build_code_split` 7 用例），`pnpm build` 通过。
- 文档/配置一致性：`decisions.md` 新增 045 与实现一致，md_format 通过；spec task.md 收尾待 implementer 填写（非 reviewer 门禁）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）。
- 本轮新发现：0 条。
- 未进表的提示：卡片级刷新按钮未逐一 e2e 采样，但其与标题栏按钮共享 `Button` 基类，基类 ring 片段删除由类名断言结构性覆盖，抽样符合 spec 测试策略；无其他。
- 总体判断：实现与 spec 完全一致，测试红绿可信，范围干净，可合入。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`——reviewer 独立重跑 `test:e2e:web popup_view.spec.ts -g t538`（3 passed，见本轮复跑），并逐行核对断言触达真实可观察行为（computed box-shadow、类名片段、`:focus-visible`），非 mock。
- AC-002：`re_verified`——同上复跑覆盖；另独立 grep 确认 `ring-[var(--color-accent)]`（非 `-ring` 后缀）在 `src/`、`tests/` 零命中，抽样外实例无残留。
- AC-003：`re_verified`——同上复跑覆盖守卫用例；实现 diff 未触碰任何 `accent-ring` 样式，删除前后 grep diff 一致。

coverage = 3 / 3。

reviewed_scope: af8203e8d2b4a4d9

verdict: PASS
