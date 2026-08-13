# Task review t333（reviewer_focus: 通用）

- task：`t333_settings_reset_watch_bell_off_slash`
- spec：`docs/tasks/t333_settings_reset_watch_bell_off_slash/spec.md`
- diff_anchor：`90bc99395c531c8d51e8eef1ff746a3aa8c62d9b`
- target：`git diff 90bc99395c531c8d51e8eef1ff746a3aa8c62d9b`
- round：1
- reviewed_at：2026-08-13 03:40 UTC+8

## Findings

### t333_gen_f001 - settings_view_watched.test.tsx 新用例 AC 锚定错误（标 AC-002 实测 SettingsForm 路径）

- 严重度：minor
- 锚点：AC-002（LabelMapDialog 铃铛）与 AC-001（SettingsForm 铃铛）证据映射混淆，不影响断言有效性
- 位置：`tests/unit/renderer/views/settings_view_watched.test.tsx:165`、`:185`
- 问题：两个新用例标注「t333 AC-002」。但流程「编辑 → 点 getByText("数据标签映射")」展开的是 `SettingsForm.tsx:599` 内嵌 labelRows（`:616-664` 的 onToggleWatched 铃铛，AC-001 路径），并非 LabelMapDialog（打开入口是 `title="编辑数据标签映射"` 按钮，见 settings_view_cpa.test.tsx:132）。断言本身有效（AC-001 组件层覆盖增强），但 AC 编号错位——`handoff.json` 的 ac_evidence 若引用此处当 AC-002 证据将失真。
- 建议：用例名改为「t333 AC-001」；LabelMapDialog（AC-002）斜杠断言补到 `label_map_dialog.test.tsx`（见 f002）。

### t333_gen_f002 - spec 测试策略清单未完全落实：AC-002 组件层与 SettingsForm 路径 AC-004 斜杠断言缺失

- 严重度：minor
- 锚点：spec 上下文区「测试策略」列出的 `label_map_dialog.test.tsx` / `settings_view_cpa.test.tsx` / `settings_provider_accounts.spec.ts` 均未更新；AC-004 即时更新仅 e2e 一处验证
- 位置：`tests/unit/renderer/components/label_map_dialog.test.tsx`（未改）、`tests/unit/renderer/views/settings_view_cpa.test.tsx`（未改）、`tests/e2e/electron/settings_provider_accounts.spec.ts`（未改）
- 问题：
    1. `label_map_dialog.test.tsx` 有铃铛 aria-pressed 用例（`:564-599`）但无 `data-slash` 断言，LabelMapDialog（AC-002）组件层斜杠无测试——仅靠 e2e `cpa_label_map_watch.spec.ts:91` 兜底。spec 测试策略明确列出该文件更新。
    2. `settings_view_cpa.test.tsx`（CPA LabelMapDialog 铃铛持久化，`:135-154`）亦无斜杠断言。
    3. AC-004「斜杠即时更新」仅 e2e `cpa_label_map_watch.spec.ts:91-95` 覆盖 LabelMapDialog 单向（斜杠出现→点击→消失）；SettingsForm 路径（AC-001/AC-004）组件层测试用 `vi.fn()` mock 回调，watched props 不变，斜杠不翻转，即时更新无可观察断言。两处按钮共用同一 `name={watched ? "bell" : "bell_off"}` 派生逻辑，行为同一，不构成行为缺陷。
- 建议：`label_map_dialog.test.tsx` 补斜杠存在性断言（含切换后消失）；其余清单项若不补，在 spec 测试策略注明降级理由。

## 结论

- 前轮 finding 复核（Round 1，无）
- 本轮新发现：2 条（均为 minor）
- 未进表的提示：opacity 由 0.35 统一调为 0.5 属未监控视觉配套（spec 非范围只约束 on 状态，on 仍 opacity 1，未越界）；「未知契约清单」UNVERIFIED-SPIKE 已由 d037 收敛为结论，流程合规
- 总体判断：实现正确、AC-001/002/003/004 可观察行为全部落地，无未解决 critical / important；2 条 minor 为测试锚定与覆盖清单问题
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified`——settings_form.test.tsx:1018-1019（已监控无斜杠/未监控有斜杠）+ settings_view_watched.test.tsx 两用例；本环境重跑 73 个相关单测全通过
- AC-002：`re_verified`——LabelMapDialog.tsx:269-271 代码核对（`name` 条件 + `data-slash` 透传，与 AC-001 同一机制，该机制已被 AC-001 单测验证）；组件层无斜杠断言，e2e `cpa_label_map_watch.spec.ts:91` 断言代码审核有效但本环境无法运行（见下）
- AC-003：`re_verified`——settings_view_watched.test.tsx:100-137 与 settings_view_cpa.test.tsx:135-154 持久化断言通过，toggle 逻辑（onToggleWatched / on_toggle_watched / upcomingResetWatched 读写）diff 未触碰
- AC-004：`trust_prior`——组件层 mock 不更新 watched props，无法复验；依赖实施侧 e2e `cpa_label_map_watch.spec.ts:91-95` 已过证据。我尝试在本 WSL 环境重跑该 e2e 失败（`electronApplication.firstWindow` 30s 超时，electron 窗口无法拉起，环境限制非断言问题）；断言代码审核有效（未监控 `[data-slash="true"]` 可见 → 点击后 `aria-pressed=true` 且 count 0，斜杠即时消失语义正确）

coverage = 3 / 4（AC-004 trust_prior；另注明 AC-002 的 e2e 断言未能本环境实跑，靠代码+机制佐证）

reviewed_scope: a69e9bd1256ad1a8

verdict: PASS

## Round 2 (2026-08-13 03:50 UTC+8)

### 前轮 finding 复核

- **t333_gen_f001（AC 锚定错误）——不撤回，仍成立**。调度方主张「settings_view_watched.test.tsx 走 SettingsView.tsx:693 CpaLabelMapDialog = AC-002 路径」，与代码证据不符：
    - `AccountDialog.tsx:122` 渲染 `<SettingsForm`，`:154/:158` 透传 `onSaveLabelMap` / `onToggleWatched`，`:63` 注释「t048: upcomingResetWatched 查表，透传给 SettingsForm 数据标签映射 bell」，签名单参 `(raw_label: string) => void`。
    - `SettingsView.tsx:560` AccountDialog 分支（`:607` onSaveLabelMap、`:654` onToggleWatched、`:661-665` 聚合多 account_key）→ `SettingsForm.tsx:599` 渲染「数据标签映射」label、`:616-664` 渲染内嵌 labelRows 铃铛（AC-001 路径）。
    - `CpaLabelMapDialog`（`SettingsView.tsx:693`）仅由 `label_map_dialog` state 触发，而该 state 只在 `accounts_section.tsx:154` 的 `if (editing_cpa_id)`（CPA 连接设置「编辑数据标签映射」按钮）分支设置；settings_view_watched 用 DeepSeek（poll）、点「编辑」(`getAllByTitle("编辑")[0]`) 打开 AccountDialog，不触发 CpaLabelMapDialog。且 settings_view_watched 铃铛回调走 `SettingsView.tsx:654` 单参 onToggleWatched（聚合三 key 的 `persists add_watched_metric` 用例：100-137），与 CpaLabelMapDialog 自管理 save_target 无关。
    - 判定：settings_view_watched.test.tsx:165/185 两用例实走 AccountDialog→SettingsForm 内嵌 labelRows，锚定 t333 AC-001 而非 AC-002；f001 维持 minor，不作 blocking。若实施方仍持异议，可提供实跑证据（如 DOM dump 确认打开的是 CpaLabelMapDialog）继续举证。
- **t333_gen_f002（spec 测试策略清单部分未落实）——保留 minor**，不阻断。spec 上下文区「测试策略」列出的 `label_map_dialog.test.tsx` / `settings_view_cpa.test.tsx` / `settings_provider_accounts.spec.ts` 未加 data-slash 断言；SettingsForm 路径 AC-004 即时更新无组件层测试（mock 不更新 watched props）。此为覆盖扩展建议，不构成行为缺陷，符合 minor 定级。

### 本轮新发现

无。

### 总体判断

Round 1 的 PASS 判定复核后维持：无未解决 critical / important；2 条 minor（f001 不撤回、f002 保留）均不阻断。

reviewed_scope: a69e9bd1256ad1a8

verdict: PASS

## Round 3 (2026-08-13 04:00 UTC+8)

### 前轮 finding 复核（以 git diff 为准）

- **t333_gen_f001（AC 锚定错误）——已修，关闭**。`git diff HEAD` 实证 `tests/unit/renderer/views/settings_view_watched.test.tsx` 两用例标注已改为 `t333 AC-001`（`it("未监控状态铃铛叠加斜杠（t333 AC-001）")` / `it("已监控状态铃铛无斜杠（t333 AC-001）")`），与实走 AccountDialog→SettingsForm 内嵌 labelRows 路径一致。AC-002（LabelMapDialog 对话框路径）由 e2e `cpa_label_map_watch.spec.ts:91/95` data-slash 断言覆盖（用户报告已实跑通过；本环境 electron 窗口无法拉起，断言代码审核有效）。
- **t333_gen_f002（spec 测试策略清单部分未落实）——遗留，登记 p149**。task.md 处置表 Round 1-2 登记 `t333_gen_f002 | minor | 遗留 | … | p149`；`docs/pending/todo/p149_settings_bell_slash_test_coverage.md` 已建，内容准确（补 LabelMapDialog 组件层 data-slash 断言、settings_view_cpa / settings_provider_accounts 斜杠断言、SettingsForm 路径 AC-004 即时更新组件测试）。minor 遗留不阻断本轮 verdict。

### 本轮新发现

无。

### 总体判断

Round 1 两个 minor finding 处置闭环：f001 已修、f002 已登记 pending p149 遗留。无未解决 critical / important，verdict 维持 PASS。

reviewed_scope: b0a62e3b9fb222d8

verdict: PASS
