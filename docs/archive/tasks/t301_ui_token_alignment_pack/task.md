---
tid: "t301"
slug: "ui_token_alignment_pack"
title: "ui 组件 token 对齐包（Switch/Badge/Progress/Button 字重/Menu hover/Dialog 动画）"
status: "done"
branch: "t301_ui_token_alignment_pack"
worktree: ""
review_level: "full"
diff_anchor: "5eee818d6ee62562c218e25896dd0640c8ed76e0"
depends_on: ""
conflicts_with: ""
note: "合并 p110-p113/p117-p118 六条 DESIGN 对照差异：Switch 尺寸/开态色、Badge count 配色、Progress 尺寸（未消费）、Button 字重规格矛盾、Menu hover、Dialog 动画缺失；含设计侧裁决点，对比度不退化"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 环境前置（worktree）

- `node_modules/electron` 缺 `path.txt` 与 `dist/`（postinstall 未全）：从主仓复制 dist 与 path.txt 修复（临时依赖，非源码）。
- `src/generated/`（gitignore 构建产物）目录不存在导致 `gen-build-info.ts` writeFileSync ENOENT：`mkdir -p src/generated` 后 `pnpm build` 成功。

### 六项对齐裁决与实现

| 项                 | DESIGN 依据                                                          | 裁决                                                                      | 实现                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switch 尺寸/开态色 | `switch-track` 38×22、`switch-track-on` success 绿                   | 对齐 token                                                                | `h-[22px] w-[38px]`；开态 `bg-[var(--color-success)]`、关态 `bg-[var(--color-surface-raised)]`；圆钮 18px、开态 `translate-x-[18px]`（38−18−2，轨道无边框，关态留白 2px） |
| Badge count 配色   | `badge-count` primary-container 浅底 + primary 字                    | 对齐 token                                                                | `bg-[var(--color-primary-container)] text-[var(--color-primary)]`                                                                                                         |
| Progress 尺寸      | `progress-track` 6px、`progress-capsule` 22px                        | 对齐 token（未消费仅导出）                                                | thin `h-[6px]`、capsule `h-[22px]`                                                                                                                                        |
| Button 字重        | Components 按钮节正文「字重 600」                                    | 取正文 600（权威）；`body-md` fontWeight 450 是正文档通用档，按钮字重独立 | base `font-medium`→`font-semibold`                                                                                                                                        |
| Menu hover         | `menu-item-hover` primary 底 on-primary 字；菜单节「危险项红底」     | 对齐 token                                                                | 普通项 `hover:bg-primary hover:text-on-primary`；danger 项 `hover:bg-error hover:text-on-primary`                                                                         |
| Dialog 动画        | Motion：浮层入场 ≤200ms 透明度+≤8px 位移；Components：160ms 上浮淡入 | 补动画                                                                    | globals.css 增 `@keyframes dialogIn`（opacity 0→1 + translateY(4px)→none）；Dialog 卡片 `animate-[dialogIn_160ms_var(--motion-easing)] motion-reduce:animate-none`        |

- 六项均不改 DESIGN.md token 值，只改组件消费；`pnpm designmd:check` drift passed（AC-002）。
- 消费方兼容：Switch 消费方（CpaCard/AccountRow/Toggle 等）未覆盖尺寸类，全局生效 +2px 高影响可忽略；TrayMenu danger MenuItem 红底 hover 语义正确；SessionTable 只用 Badge label 变体不受 count 改动影响。

### 测试

- ui.test.tsx：Progress（h-1→h-[6px]、h-6→h-[22px]）为 t269 交付期中间态断言，spec 对齐后旧语义失效，更新为新 token 语义并在本笔记说明理由；其余新增 Switch 两态、Badge count、Menu hover、Button font-semibold、Dialog 动画断言。
- 单测：全量 2866 passed | 2 skipped（254 files）。
- 构建产物：`animation:dialogIn .16s var(--motion-easing)` 已入 out/renderer CSS。

### 黑盒

- `pnpm designmd:check`：drift passed（未改 DESIGN.md token 值，AC-002）。
- `MOCK_FIXTURE=synthetic pnpm test:e2e:web`：74 passed，exit 0；`ui_component_theme.spec.ts` 明暗两态对比度断言 4 项全绿（AC-002 不退化），Switch 开/关两态 track 底色不同断言通过。
- `pnpm test`：全量 2866 passed | 2 skipped（AC-003）。
- 过程发现：`pnpm test:e2e:web` 脚本不注入 `MOCK_FIXTURE`，本地裸跑用 real fixture，`plugin_failure_modes.spec.ts` 期望 failed connector（real fixture 无）而失败；基线（stash 后）复现同 2 failed，确认非本 task 引入。按 `docs/blueprint/testing.md` 约定须 `MOCK_FIXTURE=synthetic` 运行，synthetic 下该 spec 通过。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-11 12:10 UTC+8)

| finding_id     | severity  | status | rationale                                                                          | fix_ref         |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------- | --------------- |
| t301_code_f001 | important | 已修   | 圆钮开态偏移 16px→18px（38−18−2，轨道无边框），对称到右缘                          | Switch.tsx:30   |
| t301_code_f002 | minor     | 遗留   | 暗色下圆钮 surface-window 对 surface-raised 轨道对比低；圆钮色超六项范围，后续裁决 | p128            |
| t301_test_f001 | minor     | 已修   | 补圆钮偏移/尺寸断言，防回归                                                        | ui.test.tsx:127 |

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 六项逐项对齐（含裁决）见实施笔记对照表；AC-002 `designmd:check` drift passed + `MOCK_FIXTURE=synthetic` web e2e 74 passed（ui_component_theme 明暗两态对比度 4 项全绿）；AC-003 全量 `pnpm test` 2866 passed | 2 skipped。

### Reviewer verdict

`full`：

- Round 1 code：FAIL（f001 important 圆钮偏移几何错误）
- Round 1 test：PASS
- Round 2 code：PASS（f001 已修）
- Round 2 test：PASS

### 结果摘要

六项组件 token 对齐 DESIGN.md：Switch 38×22/开态 success 绿、Badge count 浅底 primary 字、Progress 6px/22px、Button 字重 600、Menu hover primary 底、Dialog 160ms 上浮淡入。逐项裁决见实施笔记。遗留 p128（Switch 暗色圆钮对比度）、p129（e2e 默认 fixture 摩擦）已登记。
