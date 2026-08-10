---
tid: "t283"
slug: "ui_component_theme_blackbox_check"
title: "ui 组件明暗主题抽查与 DESIGN 视觉对照"
status: "done"
branch: "t283_ui_component_theme_blackbox_check"
worktree: ""
review_level: "single"
diff_anchor: "db02c7118c8403acadcb7114856220225f79d3f3"
depends_on: ""
conflicts_with: "t281,t288,t292"
schedule_status: "scheduled"
note: "p099：组件已消费，补暗色渲染抽查; merged from t286"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- worktree 环境：`pnpm install` 后 electron 二进制缺失（postinstall 跳过），需手动解压 `~/.cache/electron` 对应版本 zip 至 `node_modules/electron/dist` 并补 `path.txt`；`src/generated/` 目录不存在需先 `mkdir` 再跑 `gen-build-info.ts`。
- web e2e 环境：本机 `http_proxy`（127.0.0.1:7890）劫持 playwright webServer 探测（探测返回 400 被误判「already available」→ 复用失效连接 → ECONNREFUSED）。运行 web e2e 必须 `env -u HTTP_PROXY ... MOCK_FIXTURE=synthetic`（与 p097/t292 同根因）。
- 主按钮暗色对比 2.65 < 3.0 的根因排查：一度定位为 DESIGN token 暗色 accent 过亮并调暗七处 token，Review Round 1 f001 指出调暗后 accent 文字场景跌破 4.5。复核实测确认真正根因是 **Button sm 尺寸类 `text-label-md` 被 tailwind-merge 误判为颜色类、吞掉 `text-[var(--color-on-primary)]`**，sm 主按钮文字回退 on-surface-dark（#e9ecf3）。修复：sm 字号改 `text-[length:var(--text-label-md)]`；撤销 token 调暗（accent 文字回 4.5+）；`.dark` 块硬编码五档 hex 改 token 引用（机制修复，值不变）。
- 全量 web e2e 74 passed 且单测 2833 passed 均无回归；designmd:check drift 通过。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending`「待办」节（普通模板）**，新条目先运行 `scripts/repo_template/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-10 21:50 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                                                              | fix_ref                                  |
| ------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| t283_gen_f001 | important | 已修   | 根因是 tailwind-merge 吞 sm 按钮的 text-on-primary；改 Button sm 字号类为显式 length 后 on-primary 恢复纯白，撤销 token 调暗（accent 文字场景回 4.5+） | src/renderer/components/ui/Button.tsx:31 |
| t283_gen_f002 | minor     | 已修   | token 调暗已撤销（无 rationale 残留）；.dark 硬编码副本改 token 引用保留；2.65 实测依据复核成立（sm 按钮文字非纯白导致）                               | DESIGN.md + globals.css                  |
| t283_gen_f003 | minor     | 已修   | globals.css 导出区后多余空行已清理                                                                                                                     | src/renderer/styles/globals.css          |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC-001：`tests/e2e/web/ui_component_theme.spec.ts` light/dark 两态对设置页 ui 组件（Switch/Select/Input/Checkbox/Button primary+secondary/Segmented/Dialog）做 WCAG 对比度断言，全绿（见 Reviewer verdict 前 `pnpm test:e2e:web` 74 passed）。
    - AC-002：明暗两态参数化循环覆盖；dark 下页面背景亮度 < 0.05 与 light > 0.5 证明主题真实切换，非假绿。
    - AC-003（`[deploy]`）：DESIGN.md components token 逐项对照清单见下方「AC-003 对照清单」。
    - AC-004（`[deploy]`）：差异项处置见对照清单「处置」列；已修复项附实测对比度。

### AC-003 对照清单（项 → DESIGN 规格 → 现状 → 处置）

| 组件/项                    | DESIGN 规格（token/正文）                        | 现状实现                                    | 处置                                                                                                          |
| -------------------------- | ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Button 圆角/尺寸/间距      | rounded md、9px 18px（button-\* token）          | rounded-md、h-9 px-[18px]                   | 一致                                                                                                          |
| Button 字重                | 正文 600 vs typography body-md 450（规格矛盾）   | font-medium（500）居中                      | 标注不修：p113（设计侧统一规格）                                                                              |
| Button sm 字号类           | label-md 字级                                    | 修复为 `text-[length:var(--text-label-md)]` | **已修**：tailwind-merge 吞 on-primary 颜色致暗色主按钮文字回退 on-surface（2.65:1），修复后纯白 3.13:1 ≥ 3.0 |
| Button primary 暗色对比    | 白字 on 暗色 accent ≥ 3.0（大字验收线）          | 修复后 #fff on #5b8dff = 3.13               | **已修**：撤销 token 调暗方案（避免 accent 文字场景跌破 4.5），改修 Button 字号类根因                         |
| 暗色 accent 数据链         | DESIGN.md → @theme → .dark 翻转                  | `.dark` 块原硬编码五档 hex                  | **已修**：`.dark` 改引用 `--color-accent-*-dark` token，消除不同步机制（值不变，无观感影响）                  |
| Switch 尺寸/开态色/关态色  | 38×22、track-on success 绿、track surface-raised | 20×36（h-5 w-9）、开态 accent、关态 muted   | 标注不修：p110（设计侧裁决；两态底色不同已由 e2e 断言，对比达标）                                             |
| Badge count 配色           | primary-container 浅底 + primary 字              | accent 实底白字                             | 标注不修：p111（设计侧裁决；实底白字 3.13+ 达标）                                                             |
| Badge tag                  | surface-raised 底 + on-surface-muted 字          | 一致（SessionTable 消费）                   | 一致                                                                                                          |
| Menu 菜单项 hover          | primary 底 + on-primary 字                       | hover surface-raised                        | 标注不修：p117（设计侧裁决）                                                                                  |
| SecretInput 显隐图标/等宽  | code-md 等宽 + 脱敏 + 显隐切换                   | 一致                                        | 一致                                                                                                          |
| Progress 粗细              | thin 6px / capsule 22px                          | thin 4px / capsule 24px，未消费             | 标注不修：p112（未消费无影响，消费时对齐）                                                                    |
| Dialog 入场动画            | 160ms 上浮淡入                                   | 无动画类                                    | 标注不修：p118（设计侧裁决）                                                                                  |
| Dialog 宽/圆角/遮罩        | 372px、rounded lg、blur 遮罩                     | rounded-xl（lg）卡片 + 遮罩 ✓               | 一致（宽度随内容自适应，未硬编码 372px——标注：token dialog 宽度 372 未强制）                                  |
| Input/Select/Textarea 表单 | field-bg + md + 9px 12px                         | h-9 + px-3 + rounded-md                     | 一致                                                                                                          |
| Segmented 选中块           | surface-card 底 + on-surface 字 + shadow         | 一致（e2e 两态断言 ≥ 3.0 通过）             | 一致                                                                                                          |
| Checkbox                   | 16px xs、checked primary 底白勾                  | h-4 w-4 rounded + 选中 primary              | 一致                                                                                                          |
| 暗色 danger 按钮对比       | 白字 ≥ 3.0                                       | #ff6b6b 暗底白字 2.78                       | 标注不修：p116（t268 token 基线，e2e 未取样；登记 pending）                                                   |
| standard Button 字号类     | body-md 字级                                     | base `text-body-md` 被 tailwind-merge 吞    | 标注不修：p115（t269 基线问题，字号 fallback 继承值；建议同法修复）                                           |

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：FAIL（f001 important 暗色 accent 文字对比 + f002/f003 minor）
- Round 2 general：PASS（3/3 finding 处置复核成立，0 新 finding；附 2 条非 blocking 提示已登记 p115/p116）

### 结果摘要

- 新增 web e2e 明暗两态对比度抽查（74 passed 无回归）；修复暗色主按钮对比失效根因（tailwind-merge 吞 on-primary）；消除 .dark 硬编码 token 副本；登记 9 条 pending（p110-p118）。
