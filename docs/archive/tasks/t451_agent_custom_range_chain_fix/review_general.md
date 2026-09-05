# Task review t451（reviewer_focus: 通用）

- task：`t451_agent_custom_range_chain_fix`
- spec：`docs/tasks/t451_agent_custom_range_chain_fix/spec.md`
- diff_anchor：`c474462be7fbda6795cf65f370c4806ba49a7ee8`
- target：`git -C '/home/karon/karson_ubuntu/omni_panel_t451' diff c474462be7fbda6795cf65f370c4806ba49a7ee8`
- round：1
- reviewed_at：2026-09-05 08:36 UTC+8

reviewed_scope: 59e6086ae5a249f5

## Findings

### t451_gen_f001 - AC-005 空输入与相等分支无测试覆盖

- 严重度：minor
- 锚点：AC-005（部分覆盖：`end<start` 已测，空输入与 `end==start` 未测）
- 位置：`src/renderer/components/token-stats/RangePicker.tsx:90-97`；`tests/unit/renderer/components/token-stats/RangePicker.test.tsx:33-51`；`tests/e2e/web/agent_custom_range.spec.ts:24-40`
- 问题：实现区分三分支（NaN→“请输入有效的开始与结束时间”；`s>=e`→“结束时间必须晚于开始时间”，均不回调、不关闭）。单测与 e2e 均只填了 `end<start` 一种非法形态；空输入（NaN 分支）与相等（`s==e` 分支）的行内报错文本与“不发新查询”行为无断言 pin 住，后续改动分支文案或条件时测试不失败。
- 建议：各补一个 case（空输入、起止相等），断言 `role=alert` 文本与 `onApply` 未调用、面板仍开。属“可再加 case”，按阈值规则为 minor。

### t451_gen_f002 - AC-008 测试只断言类名字符串，未锚定 z-index 规则

- 严重度：minor
- 锚点：AC-008（实现满足，测试强度弱一档）
- 位置：`tests/unit/renderer/components/token-stats/RangePicker.test.tsx:53-59`；`src/renderer/components/token-stats/RangePicker.tsx:124`；`src/renderer/styles/globals.css:144`
- 问题：测试仅断言 popup `className` 包含 `z-[var(--z-menu)]`。若 `globals.css` 中 `--z-menu` 定义被删或构建未产出对应 `z-index` 规则，测试仍通过，而 AC-008 真实要求“构建产物中有对应 z-index 规则”。实现本身正确：`--z-menu: 60` 存在，且与 `WorkspaceToolbar.tsx:67` 同模式，Tailwind 任意值生成 `z-index: var(--z-menu)`。
- 建议：补一层源码到规则的映射断言（如读 `globals.css` 含 `--z-menu`）或构建产物规则断言。属测试强度建议，minor。

### t451_gen_f003 - 同值 custom 态下 Select 任意 click 即重开面板

- 严重度：minor
- 锚点：行为缺陷（AC-002 实现的副作用；不违反 AC-002 本身）
- 位置：`src/renderer/views/TokenStatsView.tsx:783-787`
- 问题：`select_range_value === "custom"` 时 `onClick` 无条件 `setRangePickerOpen(true)`。可复现场景：custom 已生效、面板关闭 → 用户单击下拉本想查看选项或切回预设 → 面板在原生下拉之下先打开；若按 Esc 或点外部取消选择（无 `change`），面板仍保持打开（多余打扰，需手动关闭）。反向缺口：键盘聚焦后用方向键加回车重选同值 `custom` 不一定产生 `click`，该路径无法重开面板。
- 建议：现状可接受；若修，收窄为真实选中 `custom` 时才打开（或无 `change` 收场时回关），并补键盘路径测试。minor，不阻断。

## 结论

- 前轮 finding 复核：首轮，无前轮 finding。
- 本轮新发现：3 条（均为 minor）。
- 未进表的提示：7 视角已扫过 diff 触及路径——规格合规（AC-001~008 实现与测试一一对应）、正确性（NaN/`>=`/open-guard/zone 豁免/持久化非法值丢弃分支已读，均正确）、安全（纯前端展示交互，无输入拼接或执行、无 secret/PII、无鉴权面）、契约·类型（新增 `zoneRef` 为可选 prop，向后兼容；无 schema 与查询形态变更）、性能与资源（effect 依赖最小，无 N+1/阻塞）、架构与可维护性（zone 耦合轻微但理由充分，与 WorkspaceToolbar 层级模式一致）、健壮性与可观测（非法路径不回调不关闭正确，无吞错；f003 已进表）。范围外观察：经按钮入口打开面板时下拉瞬时显示 `custom`（`select_range_value` 含 `rangePickerOpen` 条件），关闭即恢复，无数据影响，不进表。
- 总体判断：diff 完整实现 AC-001~008，无 critical/important，可 PASS；3 条 minor 由 implementer 写入 `task.md` 处置表。
- 系统性 follow-up：无

### AC 复验方式

- AC-001 `re_verified`：运行 `token_stats_header` AC-001（userEvent 全序列）通过；代码核对 `RangePicker.tsx:71` zone 豁免与 `TokenStatsView.tsx:768,802` 接线。
- AC-002 `re_verified`：运行 AC-002 测试通过；代码核对重开 `onClick`（`TokenStatsView.tsx:783-787`）。
- AC-003 `re_verified`：运行 AC-003 测试通过；代码核对 `select_range_value`（`TokenStatsView.tsx:679-680`）。
- AC-004 `re_verified`：运行 AC-004 测试通过（精确起止断言、下拉保持 `custom`）；代码核对 `apply`→`handleCustomApply` 关闭链。
- AC-005 `re_verified`（部分）：运行 `RangePicker` AC-005 单测通过（`end<start` 报错、不回调、面板仍开）；e2e 同场景已读未执行；空输入与相等分支仅代码核对（见 f001）。
- AC-006 `re_verified`：运行 AC-006 测试通过（`fire_updated(0)` 后输入保留、应用带用户日期）；代码核对 open-guard effect（`RangePicker.tsx:55-59`）。
- AC-007 `re_verified`：运行 AC-007 测试通过（首个 `getDashboard` 即用持久区间）；代码核对 `load_saved_custom` 非法值丢弃（`TokenStatsView.tsx:183-191`）、初始化（`210-215`）与持久化 effect（`539-541`）。
- AC-008 `re_verified`：运行 AC-008 类名测试通过；独立 grep 验证 `globals.css:144`（`--z-menu: 60`）与既有同模式（见 f002）。
- AC-009 `trust_prior`：`[deploy]` 真机手势本环境无法复验；依赖实施侧 e2e（`tests/e2e/web/agent_custom_range.spec.ts`，已读未执行，需浏览器）与 jsdom 近似覆盖。

coverage = 8 / 9

verdict: PASS

## Round 2 (2026-09-05 08:39 UTC+8)

reviewed_scope: c7d6475398a02a35

### 前轮 finding 复核（以 diff/代码为准，不采信处置表自称）

- t451_gen_f001（AC-005 空输入与相等分支无覆盖，minor）——已消除。实现分支未动（`src/renderer/components/token-stats/RangePicker.tsx:90-97`：NaN→“请输入有效的开始与结束时间”，`s>=e`→“结束时间必须晚于开始时间”，均不回调不关闭）。测试已补齐：`tests/unit/renderer/components/token-stats/RangePicker.test.tsx:70-84`（空输入，断言 alert 文本为“请输入有效的开始与结束时间”+`onApply` 未调用+面板仍开）与 `:85-99`（起止相等，断言 alert 为“结束时间必须晚于开始时间”+未调用+仍开）。本轮重跑 `RangePicker.test.tsx`（6 tests）+ `token_stats_header.test.tsx`（19 tests）共 25 passed，含上述两 case。
- t451_gen_f002（AC-008 只断言类名未锚定规则，minor）——已消除。测试已加强：`tests/unit/renderer/components/token-stats/RangePicker.test.tsx:55-68` 保留类名断言（`:60`）并追加 `readFileSync(globals.css)` 断言 `:67` `toMatch(/--z-menu:\s*60/)`。独立 grep 核实 `src/renderer/styles/globals.css:144` 为 `--z-menu: 60`，实现类 `src/renderer/components/token-stats/RangePicker.tsx:124` 为 `z-[var(--z-menu)]`，映射成立；同文件测试通过。
- t451_gen_f003（同值 custom 态 Select 任意 click 即重开，minor）——仍存在，同意遗留。生产代码未收窄：`src/renderer/views/TokenStatsView.tsx:783-787` 仍为 `select_range_value === "custom"` 时 `onClick` 无条件 `setRangePickerOpen(true)`。遗留凭据有效：`docs/pending/todo/p219_custom_select_click_reopen_polish.md` 存在且内容与 finding 一致（打扰场景 + 键盘路径缺口 + 与 AC-002 共存约束）。minor 遗留不阻断。

### 本轮新发现

- 0 条。修复增量仅为单测补齐（f001×2）与 AC-008 映射断言加强，无生产代码行为变更；7 视角已扫过 diff 触及路径：规格合规（AC-001~008 实现与测试仍一一对应）、正确性（NaN/`>=`/open-guard/zone 豁免/持久化非法值丢弃分支复读，均正确）、安全（新增仅读本地静态 `globals.css`，无外部输入拼接/执行、无 secret/PII）、契约·类型（无新签名变更）、性能与资源（无新增 IO/循环）、架构与可维护性（无新增耦合）、健壮性与可观测（error 清除路径 `RangePicker.tsx:62-64,138,150` 不变）、测试可信（新增无恒真/删 expect/`.skip`/mock 误用；`toContain` 为类名字符串包含断言，属合法非弱化）。

## 结论（Round 2）

- 前轮 finding 复核：f001 已消除 / f002 已消除 / f003 仍存在但同意遗留（p219）。
- 本轮新发现：0 条。
- 未进表的提示：`RangePicker.test.tsx:2-3,63-66` 经 `process.cwd()` 定位 `globals.css`，在非仓库根 cwd 下运行单文件时可能找不到文件；项目默认从根运行，本轮 25 passed，属可接受脆弱性，不进表。
- 总体判断：无未解决 critical/important，前轮 minor 已修或有效遗留，本轮无新 blocker，可 PASS。
- 系统性 follow-up：p219（f003 遗留，已有 tid 文件），无新增。

### AC 复验方式（Round 2）

- AC-001 `re_verified`：重跑 `token_stats_header.test.tsx` AC-001（userEvent 全序列）通过；代码核对 `RangePicker.tsx:71` zone 豁免与 `TokenStatsView.tsx:768,802` 接线。
- AC-002 `re_verified`：重跑 AC-002 测试通过；代码核对重开 `onClick`（`TokenStatsView.tsx:783-787`）。
- AC-003 `re_verified`：重跑 AC-003 测试通过；代码核对 `select_range_value`（`TokenStatsView.tsx:678-680`）。
- AC-004 `re_verified`：重跑 AC-004 测试通过（精确起止断言、下拉保持 `custom`）。
- AC-005 `re_verified`：重跑 `RangePicker` 三分支单测（`end<start` / 空输入 / 相等）全部通过；代码核对 `RangePicker.tsx:90-97`。
- AC-006 `re_verified`：重跑 AC-006 测试通过（`fire_updated(0)` 后输入保留、应用带用户日期）；代码核对 open-guard effect（`RangePicker.tsx:55-59`）。
- AC-007 `re_verified`：重跑 AC-007 测试通过（首个 `getDashboard` 即用持久区间）；代码核对 `load_saved_custom` 非法值丢弃与初始化/持久化 effect。
- AC-008 `re_verified`：重跑增强后 AC-008 测试通过；独立 grep 验证 `globals.css:144`（`--z-menu: 60`）。
- AC-009 `trust_prior`：`[deploy]` 真机手势本环境无法复验；依赖实施侧 e2e（`tests/e2e/web/agent_custom_range.spec.ts:9-53`，已读未执行，需浏览器）与 jsdom 近似覆盖。

coverage = 8 / 9

verdict: PASS
