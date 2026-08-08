---
tid: "t269"
slug: "ui_component_library"
title: "ui 组件库：Button/Card/Input/Switch/Segmented/Menu/Dialog/Progress 双形态/Badge/StatusDot/KPI/Skeleton + @utility"
status: "done"
branch: "t269_ui_component_library"
worktree: ""
review_level: "single"
diff_anchor: "9d8a7066e441b17644b594a1678e26917573d351"
depends_on: "t268"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 组件盘点（Step 1 交付物：组件 × 现存变体）

| DESIGN 组件                                  | 现存实现                                                           | 盘点结论                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Button                                       | `components/Button.tsx`（default/ghost/outline × default/sm/icon） | 用 `var(--radius)` 等旧变量；t269 建 ui/Button 全形态（primary/secondary/danger/ghost/icon × standard/sm），旧实现待窗口迁移删除 |
| Card                                         | `components/Card.tsx`（border+card 变量）                          | 建 ui/Card（surface-card/surface-raised），旧保留                                                                                |
| PanelTitleBar                                | `components/PanelTitleBar.tsx`                                     | 建 ui/PanelTitleBar（44px + hairline）                                                                                           |
| SecretInput                                  | `components/SecretInput.tsx`（ad-key/ad-input 类）                 | 建 ui/SecretInput（等宽脱敏 + 显隐），旧保留                                                                                     |
| Input / Textarea                             | forms 各表单内联                                                   | 建 ui/Input/Textarea（field-bg + accent 焦点）                                                                                   |
| Select                                       | `components/settings/Select.tsx`                                   | 建 ui/Select（自绘箭头）                                                                                                         |
| Checkbox / Switch / Segmented                | settings/Toggle.tsx、各分段手写                                    | 建 ui/Checkbox（accent-color）/Switch/Segmented                                                                                  |
| Menu                                         | 托盘自绘菜单窗                                                     | 建 ui/Menu + MenuItem（glass-menu @utility）                                                                                     |
| Dialog                                       | 各 AddAccountDialog 等                                             | 建 ui/Dialog（372/420 双宽 + 遮罩）                                                                                              |
| Progress                                     | token-stats/usage-bar 手写                                         | 建 ui/Progress（thin/capsule + 风险阶梯）                                                                                        |
| Badge / StatusDot / KPI / Skeleton / ListRow | 各处内联                                                           | 新建 ui/ 对应组件                                                                                                                |

### 实现

- `src/renderer/components/ui/`：18 组件全形态（Button/Card/Input/Textarea/Select/SecretInput/Checkbox/Switch/Segmented/Menu+MenuItem/Dialog/Progress/Badge/StatusDot/Kpi/Skeleton/PanelTitleBar/ListRow）+ index.ts。
- 组件只消费语义 token（--color-\* 等 @theme 变量 + 工具类），不写 dark: 变体、不散落字面量。
- `@utility`：glass-menu（毛玻璃）、shimmer（骨架屏高光）加 globals.css。
- 测试：tests/unit/renderer/components/ui/ui.test.tsx 19 用例（结构/token 类名/交互态）。

### 合并决策

- 现有 Button/Card 等保留（未迁移窗口用），ui/ 为统一库供 t270 起迁移消费。
- 盘点中「近似手写实现」不删除（spec 非范围），随窗口迁移逐步替换。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-09 05:40 UTC+8)

| finding_id    | severity  | status | rationale                                                                     | fix_ref         |
| ------------- | --------- | ------ | ----------------------------------------------------------------------------- | --------------- |
| t269_gen_f001 | important | 已修   | 补 @utility metric-num（KPI 等宽数字）+ transition-feedback（120ms 交互过渡） | globals.css     |
| t269_gen_f002 | important | 已修   | Progress 风险阈值改 0.6/0.85/0.95（对齐 usage-colors.ts）                     | ui/Progress.tsx |
| t269_gen_f003 | important | 已修   | Dialog 遮罩补 backdrop-blur（DESIGN Elevation）                               | ui/Dialog.tsx   |
| t269_gen_f004 | important | 已修   | ui.test.tsx 补构建产物 grep（Tailwind 类/@utility 生成验证）                  | ui.test.tsx     |
| t269_gen_f005 | important | 已修   | Kpi 用 metric-num @utility（tabular-nums 等宽数字）                           | ui/Kpi.tsx      |
| t269_gen_f006 | minor     | 遗留   | 视觉细节（Switch 尺寸/Button 字重/Badge 配色等）人工对照                      | p098            |

### Round 2 (2026-08-09 06:00 UTC+8)

| finding_id    | severity | status | rationale                                                                                                                | fix_ref       |
| ------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------ | ------------- |
| t269_gen_f007 | minor    | 已修   | Button/Segmented/Switch 消费 transition-feedback @utility                                                                | ui/\*.tsx     |
| t269_gen_f008 | minor    | 已修   | Dialog 遮罩改 color-mix(on-surface 40%) 语义化（无散落字面量）                                                           | ui/Dialog.tsx |
| t269_gen_f009 | minor    | 遗留   | computed 明暗抽查未实现（jsdom 不解析 CSS 变量；ui 组件未被应用消费，app 级 e2e 无法渲染）——待 t270 迁移消费后补黑盒抽查 | p099          |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - 盘点覆盖：18 组件全形态与 DESIGN Components 节一一对应（盘点清单在实施笔记）
    - 渲染测试：ui.test.tsx 20 用例（结构/token 类名/交互态 + 构建产物 grep）
    - 明暗：组件无 dark: 变体（语义 token 翻转）；黑盒 electron e2e 暗色渲染回归 2 passed；computed 明暗抽查待 t270 迁移后补（p099）
    - Progress 细线/胶囊双形态 + 风险阶梯（0.6/0.85/0.95 对齐 usage-colors）
    - @utility：glass-menu/shimmer/metric-num/transition-feedback 产物生成
    - 视觉人工对照（AC5 [deploy]）登记 p098

### Reviewer verdict

`single`：

- Round 1 general：FAIL
- Round 2 general：PASS
- Round 3 general：PASS

### 结果摘要

- 统一 ui 组件库落地（18 组件全形态 + @utility 复合模式），只消费语义 token；t270 起窗口迁移可消费。
