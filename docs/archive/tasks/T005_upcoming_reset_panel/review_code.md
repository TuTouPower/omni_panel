# Task review T005

- task：`T005_upcoming_reset_panel`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree：`src/renderer/components/UpcomingReset{Row,Rail,Banner}.tsx` + `src/renderer/views/PopupView.tsx` + `src/renderer/styles/globals.css` + 2 个组件单测）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-20 23:30 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。

## Findings

### T005_code_f001 — log.md 未更新，仍显示"暂未开始实现"

- 严重度：medium
- 位置：`docs/tasks/T005_upcoming_reset_panel/log.md:7`
- 问题：log.md 当前只有一行「暂未开始实现。spec/plan 待用户审核。前置 T004 未合入。」但 working tree 已有完整组件实现 + 装配 + CSS + 37 单测全绿；T004 已于 2026-07-20 合入（`0b5f27f`）。两处中途决策未记录：(1) 把"行"显式抽成独立 `UpcomingResetRow` 组件（plan.md 步骤 3-4 只说 rail/banner 各自渲染行）；(2) Banner 空态不用 `CollapsibleCard`（避免空态出现误导性 chevron）。
- 建议：补一段「实现记录」，覆盖：T004 已合入前置、本批落地范围、两处偏离 plan 的原因、`pnpm vitest run` 37/37 绿的结果。不必写命令流水账。

### T005_code_f002 — `select_provider_from_upcoming` 用全局 `querySelector`，绕开既有 ref 模式

- 严重度：low
- 位置：`src/renderer/views/PopupView.tsx:273-279`（`select_provider_from_upcoming`），其中 `:276` `document.querySelector(".scroll")?.scrollTo(...)`
- 问题：PopupView 已有 `tabsRef`/`content_mirror_ref` 等 ref 模式；这里改用全局 `document.querySelector(".scroll")`，依赖"live 树在 DOM 中先于两个 popup-mirror 出现"这一隐式顺序才命对节点（mirror 也渲染 `.scroll`，见 `PopupView.tsx:868/877`）。若日后有人在 live 树之前插入别的 `.scroll`，会滚错节点且无报错。
- 建议：引入 `const scroll_ref = useRef<HTMLDivElement>(null);` 挂到 `<div className="scroll" ref={scroll_ref}>`（`PopupView.tsx:669`），回调内改 `scroll_ref.current?.scrollTo({ top: 0, behavior: "smooth" })`。与既有 ref 风格一致，更鲁棒。

### T005_code_f003 — Row key 拼接 `index`，削弱 React reconciliation

- 严重度：low
- 位置：`src/renderer/components/UpcomingResetRail.tsx:25`、`src/renderer/components/UpcomingResetBanner.tsx:52`
- 问题：`key={`${item.provider}-${item.accountId}-${item.metricLabel}-${String(index)}`}`。三元组（provider, accountId, metricLabel）已基本唯一；末尾追加 index 反而在列表重排/插删时让 identity 漂移，触发不必要的 unmount/remount，丢失按钮内部 hover/focus 状态。
- 建议：去掉 `-${String(index)}`；若担心碰撞，改用 `resetAt` 或完整四元组作业务键。当前 `collect_upcoming_resets` 每次返回新数组，影响概率低，不阻塞。

### T005_code_f004 — Banner 空态卡片缺 `aria-label`/heading，与其他卡片语义不一致

- 严重度：suggestion
- 位置：`src/renderer/components/UpcomingResetBanner.tsx:21-31`
- 问题：空态返回 `<div className="card upcoming-banner">` 而非 `CollapsibleCard`。这个偏离本身合理（空态不该有误导性 chevron，spec.md:39 要求"不渲染空容器"），但空态卡片既无 `aria-label="即将重置"` 也无 `<section aria-labelledby>`，屏幕阅读器只能逐行朗读"即将重置 / 0 项 / 未来 7 天内暂无重置"，与非空态 `CollapsibleCard` 的 `card-name` 语义不齐。
- 建议：在空态 `<div className="card upcoming-banner">` 加 `aria-label="即将重置"`，或包一个 visually-hidden heading。语义对齐成本很低。

### T005_code_f005 — 视觉快照回归未验证（spec.md:40 验收项）

- 严重度：medium
- 位置：`spec.md:40`（验收：「PopupView 视觉快照无回归」）；`tests/user_e2e/visual/popup_states.spec.ts-snapshots/`
- 问题：验收明确要求视觉快照无回归，本批只新增了组件级 RTL 单测（37 绿），未触达 `pnpm test:visual`（需 e2e 环境）。横屏新增 264px rail 占第二列后，`.overview-grid` 可用宽度从 100% 缩到 `calc(100% - 264px - 12px)`，卡片列数可能由 N 降到 N-1，是潜在的视觉回归点。T004 review 也曾遗留"视觉快照环境限制"（`0b5f27f` commit message 提及 6 项遗留）。
- 建议：finalization 前跑一次 `pnpm test:visual` 四档宽度（472 / 640 / 1023 / 1024+）确认形态切换与卡片列数无意外回归；若快照需更新，按实际形态重新生成并在 log 记录原因。

### T005_code_f006 — rail sticky `max-height` 的 `40px` 是未注释的 magic number

- 严重度：suggestion
- 位置：`src/renderer/styles/globals.css:398`（`.overview-row > .upcoming-rail { max-height: calc(100vh - 40px); }`）
- 问题：`40px` 偏移量未注释来源（推测对应 `.scroll-inner` 上下 padding/gap 之和）。将来改 scroll-inner padding 时容易漏改这里，导致 rail 滚动区高度与视口错位。
- 建议：加一行注释说明 40px 对应哪些 padding/gap；或抽 `--popup-rail-maxheight-offset: 40px;` 变量，与 scroll-inner 的间距变量联动。

## 结论

**PASS with minor reservations。**

实现与 spec 范围一致，硬约束全部满足：

- 时间字段统一用 `format_reset_time`；3 个新组件（Row/Rail/Banner）grep 无 `relative_time` import，单测 `upcoming_reset_rail.test.tsx:91-106` 显式断言「刚刚」不出现。
- 复用 `CollapsibleCard`（Banner）、`VendorMark`（Row）、`.dot/.red/.amber/.green`（Row 的 `STATUS_DOT_CLASS` 映射），未新造状态点 token。
- 脱敏：`UpcomingResetRow.tsx:24` `desensitizeRemarks` 时 `account_label = ""`，`{account_label && ...}` 不渲染；单测 `:79-89` 验证账号 label 不出现在 DOM。
- 行 `onClick` → `select_provider_from_upcoming` → `setActiveTab(provider)` + `.scroll` 回顶（`PopupView.tsx:273-279`）。
- `@container (min-width: 1024px)` rail 显示 / banner 隐藏，<1024px 反之，与 T004 `.scroll-inner` 的 `container-type: inline-size` 衔接正确（`globals.css:342 + 385`）；`.overview-row` 作为外层包装，未破坏 T004 的 `.overview-grid` 内层多列拓扑。
- 偏离 spec 评估：(1) `UpcomingResetRow` 抽独立组件——plan.md 步骤 3-4 本就预期 rail/banner 共享行渲染，显式独立更清晰，合理；(2) Banner 空态不用 `CollapsibleCard`——避免空态出现误导性 chevron，与 spec.md:39「不渲染空容器」契合，合理。
- PopupView 装配未破坏既有 overview/tab 逻辑：`tests/unit/renderer/views/popup_view.test.tsx` + `popup_view_mirror.test.tsx` + `popup_view_height.test.tsx` 全绿。
- popup-mirror 在 wide popup 下 `container-type: normal` 导致镜像按窄屏测高（banner 显示、rail 隐藏），但 rail 自带 `max-height: calc(100vh - 40px) + overflow-y: auto`，内部滚动，不要求 BrowserWindow 长高，镜像上报偏差不会裁切内容——设计自洽。

主要遗留：log.md 未更新（f001, medium）与视觉快照回归未验证（f005, medium）应在 finalization 前闭合；f002-f004、f006 为 low/suggestion，不阻塞合并。
