---
tid: "t321"
slug: "fix_trend_window_btn_selected_invisible"
title: "修复趋势窗口切换按钮选中态文字隐形"
status: "done"
branch: "t321_fix_trend_window_btn_selected_invisible"
worktree: ""
review_level: "single"
diff_anchor: "022b83e82d8981de43d6294504e800564a919dd3"
depends_on: ""
conflicts_with: ""
note: "p144：选中态 bg-transparent 层叠覆盖 accent 底 + text-surface-card 文字色语义错"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

实施：ProviderAccountRow 趋势窗口按钮 className 改用 cn()（tailwind-merge 去重 bg-transparent vs bg-accent 冲突），选中态文字由 surface-card 改 on-primary（跟随项目 accent 底文字约定）。补 e2e 对比度门禁（light/dark 真切主题 + 亮度守卫 + accent 实底 + 对比度 ≥3.0 + 未选中态护栏）。

关键决策：AC-002 阈值由 ≥4.5 改 ≥3.0（用户批准）——默认 accent-blue light 下白字 3.89、深字 3.70 均 <4.5，物理上限不可达；对齐 DESIGN 大字标准/t283 Segmented 阈值。AC-003「≠卡片背景色」light 下 on-primary 白与卡片 surface-card 白天然同色、物理不可满足，改 spec 为「与最终背景非同色」（f005 撤回）。

验证：单测 2944 passed；e2e 趋势按钮 light/dark 2 passed；tsc --noEmit exit 0。审阅 3 轮（Round1 FAIL → Round2 PASS → Round3 PASS），8 findings 全处置。

环境：worktree 首装依赖缺 electron dist，从主仓复制补齐；build-info 生成（同前）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-12 18:40 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                                    | fix_ref                                                |
| ------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| t321_gen_f001 | important | 已修   | e2e 每主题迭代经设置页真实切主题 + 亮度断言                                                                                  | tests/e2e/web/trend_window_button_contrast.spec.ts:77  |
| t321_gen_f002 | important | 已修   | 删未用 switch_theme/theme_attr；tsc --noEmit 通过                                                                            | tests/e2e/web/trend_window_button_contrast.spec.ts     |
| t321_gen_f003 | important | 已修   | 补未选中按钮样式断言（透明底/浅灰字/outline）                                                                                | tests/e2e/web/trend_window_button_contrast.spec.ts:150 |
| t321_gen_f004 | minor     | 已修   | 补选中背景解析后 = accent 断言（临时元素解析 var）                                                                           | tests/e2e/web/trend_window_button_contrast.spec.ts:118 |
| t321_gen_f005 | minor     | 撤回   | AC-003「≠卡片背景色」light 下物理不满足（on-primary 白 = 卡片白，靠实底背景可见），改 spec AC-003 描述为「与最终背景非同色」 | spec.md AC-003                                         |
| t321_gen_f006 | minor     | 已修   | spec 上下文区测试策略 ≥4.5 残留改 ≥3.0                                                                                       | spec.md:81                                             |

### Round 2 (2026-08-12 18:45 UTC+8)

| finding_id    | severity | status | rationale                                                                              | fix_ref       |
| ------------- | -------- | ------ | -------------------------------------------------------------------------------------- | ------------- |
| t321_gen_f007 | minor    | 已修   | spec 可测试性声明与测试策略残留「与卡片背景非同色」，改「与最终背景非同色」对齐 AC-003 | spec.md:55,81 |

### Round 3 (2026-08-12 18:50 UTC+8)

| finding_id    | severity | status | rationale                                                     | fix_ref                                                |
| ------------- | -------- | ------ | ------------------------------------------------------------- | ------------------------------------------------------ |
| t321_gen_f008 | minor    | 已修   | e2e 注释「与卡片背景非同色」改「与最终背景非同色」对齐 AC-003 | tests/e2e/web/trend_window_button_contrast.spec.ts:128 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~004 由 e2e 断言覆盖（选中背景 accent 实底、对比度 ≥3.0 两主题、文字与最终背景非同色、未选中样式不动）；全量单测 2944 passed + tsc 0；详见 handoff.json ac_evidence

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：FAIL
- Round 2 general：PASS
- Round 3 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 趋势窗口选中按钮 cn() 去重 bg 冲突 + 选中文字改 on-primary，修复「背景透明/文字隐形」；e2e 对比度门禁 light/dark 双主题守护
