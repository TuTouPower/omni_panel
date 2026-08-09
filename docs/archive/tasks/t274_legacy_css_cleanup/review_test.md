# Task review t274（reviewer_focus: 测试）

- task：`t274_legacy_css_cleanup`
- spec：`docs/tasks/t274_legacy_css_cleanup/spec.md`
- diff_anchor：`67e72b977b489aab635d580b21104b3c9229b99b`
- target：`git diff 67e72b977b489aab635d580b21104b3c9229b99b`
- round：1
- reviewed_at：2026-08-09 22:48 UTC+8

审阅范围：工作区相对 HEAD（67e72b97）的全部改动。diff 统计：121 文件 / 测试相关 69 文件（+1059/-417）；新增测试文件 1 个（`tests/e2e/web/appearance_theme.spec.ts`），无测试文件删除，无新增 `.skip`/`.only`/`@ts-ignore`/`eslint-disable` 行（grep 全 diff 验证）。

## Findings

### t274_test_f001 - scheduler e2e「等刷新完成」断言退化为恒真（spinning 类已删除未同步）

- 严重度：important
- 锚点：AC4（web e2e 门禁）；行为缺陷：刷新完成时序等待失效
- 位置：`tests/e2e/web/scheduler.spec.ts:49`（`await expect(refresh_btn).not.toHaveClass(/spinning/, { timeout: 15_000 })`）
- 问题：本 task 实现已将刷新 spinner 从按钮的 `.spinning` 类迁移为内部 svg 的 `animate-spin`（`src/renderer/views/popup-view/TitleBar.tsx:75`、`src/renderer/components/ui/PanelTitleBar.tsx:86`；全仓 src 已无 `spinning` 类，grep 可证）。此断言对象是按钮元素（`popup.refresh_all_button()` = `getByTitle("刷新全部")`，`tests/e2e/pages/popup_page.ts:26`），按钮 className（`h-8 w-8 p-0` + icon variant）永不含 `spinning` 子串，断言无条件立即通过。原语义「刷新挂起时真实等待 spinner 消失」被掏空：测试点击刷新后不再等待完成，后续 `[data-testid="popup-scroll"]` 可见断言在刷新前即恒真，整个「manual refresh button triggers refresh」用例退化为「点击不崩溃」，不再触达 refreshing 状态机。同类断言在其他文件已同步迁移（`popup_view_height.test.tsx`、`renderer-smoke.test.tsx`、`PanelTitleBar.test.tsx` 均改判 svg `animate-spin`），此处为遗漏。
- 建议：改为 `await expect(refresh_btn.locator("svg")).not.toHaveClass("animate-spin", { timeout: 15_000 })`（或等价的图标级断言），恢复「等待刷新完成」语义。

### t274_test_f002 - 清零守卫用黑名单，与 spec 测试策略约定的「白名单」形式不一致

- 严重度：minor
- 锚点：AC1；上下文区测试策略「清零用 grep 白名单（允许保留的类名清单）做断言」
- 位置：`tests/unit/renderer/globals_css.test.ts:15-88`（`FORBIDDEN_SELECTORS`）
- 问题：spec 测试策略约定白名单式断言（只允许保留类存在），实现为黑名单（`FORBIDDEN_SELECTORS` 枚举禁止类，断言 globals.css 不含其中任一）。黑名单对清单之外的业务手写类不设防：未来新增手写类若未列入清单，守卫不失败，防御面小于白名单。当前清单覆盖两组历史类且 globals.css 已大幅收敛，实际覆盖成立，故不阻断；但形式与 spec 描述不符。
- 建议：改为白名单式守卫（globals.css 中除 `@theme`/`@utility`/`@font-face`/`@keyframes` 与明确保留的基础规则外无其他选择器），或保持黑名单并在 spec 测试策略措辞上对齐。

### t274_test_f003 - AC2 图标来源约束与「无残留引用」无自动守卫

- 严重度：minor
- 锚点：AC2
- 位置：`tests/unit/renderer/components/icon.test.tsx`（`describe("Icon")`）
- 问题：AC2「操作/导航图标全部来自 lucide-react，旧手绘图标实现已删除且无残留引用」——Icon 用例（既有）测渲染行为（SVG 输出、size/color/className 透传、未知名空 path），VendorMark 用例保留 vendor logo 资产证据；但「图标来源全部 lucide / 无手绘图标残留引用」无自动断言（如 Icon 映射全部来自 lucide import、全仓无旧手绘 SVG 定义残留），依赖 code review grep。图标来源约束是本 task 的核心清除目标，建议有守卫。
- 建议：加守卫测试断言 Icon 组件图标映射全部来自 lucide-react import（或 grep 全仓无手绘图标实现残留）。

### t274_test_f004 - provider_account_row 测试标题与断言对象过时（.card--critical 断言退化）

- 严重度：minor
- 锚点：行为缺陷（断言验证力下降）
- 位置：`tests/unit/renderer/components/provider_account_row.test.tsx:116-121`
- 问题：测试标题「card has .card class and no status-specific class when critical」已过时——`.card` 断言已迁为 `[data-testid="collapsible-card"]`，标题未更新；`.card--critical` 否定断言保留原样，但实现已删除该类（状态改由 `CollapsibleCard` 的 `data-status` 属性表达，`src/renderer/components/CollapsibleCard.tsx:45`），断言恒真化且验证力下降（仅能防 `.card--critical` 字面回归，无法验证 critical 状态表达本身）。该断言有失败条件（类回归时红），非无条件恒真，故不阻断。
- 建议：标题更新为 testid 表述；断言改为验证 `[data-status="critical"]`（或等价属性断言）以维持状态表达覆盖。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮为首轮）
- 改测方向复核：无「迁就实现」的改测。对既有测试的全部修改为三类，均方向正确：(1) 类选择器 → `data-testid`/属性定位（断言对象与强度不变，抽查实现确认新选择器均存在，如 `data-mode="cpa-source"`、`data-testid="set-row"`、`account-vendor` 等）；(2) token 名同值改名（`--risk-yellow:#eab308` = `--color-risk-mid:#eab308`、`--risk-red` = `--color-risk-critical`、`--risk-green` = `--color-success`，逐项核对新旧值一致）；(3) 状态类 → 视觉 utility（`dragging`/`drag-over` → `opacity-45`/`outline-dashed`，实现 `ProviderNav.tsx:88-90`、`ProviderCard.tsx:110` 确认，断言改为用户可观察的视觉类，属「旧测试语义失效后按新语义更新」的合法做法）。
- 本轮新发现：4 条（1 important + 3 minor）
- 未进表的提示：
    - AC5（blueprint/AGENTS.md 一致性）：diff 中 `docs/` 仅 `task.md` 改动，无 `docs/blueprint/`、`AGENTS.md`、`DESIGN.md` 变更。spec 上下文区「Finalization 时更新的 blueprint」列明三个文件，推断为 finalization 阶段交付，不判实现缺口；请 code reviewer 与 finalization 核对 AC5 落地。
    - globals_css.test.ts 删除的布局级规则断言（overview-grid 420px 地板、.scroll 无滚动条、rel-time 不隐藏）属上下文区「有意不测」的像素级视觉范围；其中 `minmax(420px, 1fr)` 已由 `provider_account_list_spacing.test.ts` 迁移为组件源码断言补回，rel-time 渲染由 `provider_account_row.test.tsx` 覆盖；`.scroll-inner` 容器查询容器上下文无直接补测（像素级，人工对照）。
    - `settings_view_general.test.tsx`「ml-auto」断言改为组件源码字符串匹配（`AccountRow.tsx`/`CpaCard.tsx`），与既有「JSDOM 不加载 Tailwind 产物」策略一致；正则仅匹配字符串字面量形式，className 改模板拼接时会漏报（当前实现为字面量，可工作）。
    - `knip.json` 从 ignore 移除 `lucide-react` 合理（图标已直接 import，knip 可正常检测）。
    - `.token-stats` 类仍保留在 `TokenStatsView.tsx:641` DOM（utility 混合类），electron e2e 与 packaged smoke 的 `.token-stats` 选择器有效，非残留问题。
- 总体判断：测试迁移整体规范（选择器/testid 化、token 同值改名、新 web 主题 e2e 与 mock config 状态单测质量良好，AC1/AC3 覆盖到位）；存在 1 处未解决的 important（scheduler e2e 恒真断言，其他文件同类断言均已同步而此处遗漏），故 FAIL。
- 系统性 follow-up：无（发现的问题均为本 task 内遗漏，无跨 task 基础设施缺口；已只读运行 `scripts/task.py list` 核对，无等价处理中 task）

verdict: FAIL

## Round 2 (2026-08-09 23:36 UTC+8)

- round：2
- reviewed_at：2026-08-09 23:36 UTC+8
- 审阅范围：`git diff 67e72b977b489aab635d580b21104b3c9229b99b`（工作区相对 anchor）；重点复核 Round 1 findings 与 headless web e2e / 断言强度 / AC 覆盖。
- 本轮无新增 finding（finding_id 未续编）。

## Findings

（本轮无新 finding）

## 结论

- 前轮 finding 复核：
    - `t274_test_f001`（important）：**已消除**。`tests/e2e/web/scheduler.spec.ts:49-51` 现对刷新按钮内 `svg` 先 `toHaveClass(/animate-spin/)` 再 `not.toHaveClass(/animate-spin/)`，恢复「进入刷新态 → 完成」时序；与生产 `TitleBar.tsx:72-76`（`refreshing ? { className: "animate-spin" } : {}`）及 `Icon` 把 `className` 透传到 lucide SVG 一致。非换形式弱化：比旧「仅 not spinning」更强（强制观察到 spin 出现）。同类迁移在 `renderer-smoke.test.tsx`、`popup_view_height.test.tsx`、`PanelTitleBar.test.tsx` 一致。
    - `t274_test_f002`（minor）：**已消除**。`tests/unit/renderer/globals_css.test.ts:16-61` 改为 `ALLOWED_TOP_LEVEL_SELECTORS` 白名单 + `top_level_heads` 提取顶层 selector，出现白名单外 selector 即失败；对齐 spec 测试策略「清零用 grep 白名单」。
    - `t274_test_f003`（minor）：**已消除**。`tests/unit/renderer/components/icon.test.tsx` 新增 `describe("Icon 来源守卫（t274 AC2）")`：断言 `UI_ICONS` RHS 标识符全部来自 `lucide-react` import，且 `Icon.tsx` 不再引用 `assets/ui` / 旧手绘文件名。diff 删除 `clock-fast-forward.svg` / `message-chat-square.svg`；工作区 `rg` 无 `assets/ui` 残留引用。
    - `t274_test_f004`（minor）：**已消除**。`provider_account_row.test.tsx:117-125` 标题改为「card carries account status via data-status (critical)」，正向断言 `data-status === "critical"`，不再依赖已删除的 `.card--critical` 否定恒真。
- 改测方向复核：无「迁就实现」的改测。既有改测均为语义迁移后同步（选择器→testid、`.spinning`→`animate-spin`、token/legacy 删除后改断言目标）；删测均有对应生产 API 移除或覆盖上移依据（`over_id`/`handle_drag_enter` 从 `use_dnd_handlers` 删除；globals 业务类断言由白名单守卫与组件源码断言替代；first_paint 的 `.window` 规则改断言 `PopupView` utility）。
- 本轮新发现：0 条
- 未进表的提示：
    - AC5：`docs/blueprint/architecture.md` 本轮 diff 已更新样式体系终态表述；`conventions.md` / `testing.md` / `AGENTS.md` 若仍属 finalization 交付，由 finalization/code 路径核对，不单列测试 finding。
    - Icon 来源守卫只读 `Icon.tsx` 源码（非全仓 AST）；当前手绘资产已删且全仓无路径残留，守卫对「映射回退手绘」有效。若未来在其他文件直接 import 手绘 SVG 作操作图标，守卫不覆盖——可选扩展，非 blocking。
    - `test_web` 每用例 `POST /v1/config/reset` + mock 可变 `/v1/config` 支撑主题刷新保持 e2e；单测覆盖 save/invalid/empty/reset/hasSecrets 保留，门禁可信。
- 总体判断：Round 1 唯一 important（scheduler 恒真等待）已真实修复且断言加强；3 条 minor 均按建议落地；AC1 白名单守卫、AC2 图标来源守卫、AC3 web 主题/accent e2e + bridge 单测、e2e 选择器迁移与危险模式扫描均无新 blocker。PASS。
- 系统性 follow-up：无

verdict: PASS
