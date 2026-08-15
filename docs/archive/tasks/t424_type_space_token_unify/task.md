---
tid: "t424"
slug: "type_space_token_unify"
title: "字号字重与间距圆角回归 token 档位"
status: "done"
branch: "t424_type_space_token_unify"
worktree: ""
review_level: "single"
diff_anchor: "3db780fe60ce263f0d727d37da427e9de7ae0934"
depends_on: ""
conflicts_with: "t402,t403,t404,t405,t406,t407,t408,t409,t410,t411,t412,t413,t415,t418,t419,t420,t421,t422,t423"
schedule_status: "scheduled"
note: "merged from t416,t417"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

doctor_cmd：无（testing.md）

### 决策

- 字号统一 `text-[length:var(--text-*)]`（d032 规避 twMerge 吞色）。
- canvas/SVG 字号经 `TEXT_SCALE_PX` / 圆角经 `RADIUS_SCALE_PX`（`echarts_token_resolver.ts`），与九级/六档 token 同源。
- 字重：仅清 `font-medium`(500)→`font-[550]`、`font-normal`(400)→`font-[450]`；`font-semibold`(600)/`font-bold`(700) 已在五档内保留。
- 间距：`*.5` 中 2.5(=10) / 3.5(=14) 属组件/语义豁免保留；0.5→1、1.5→2（就近 4px 基网）。
- 任意间距像素：9/10/12/14/16/18/24/40 豁免；其余就近 4 倍数（11→12、22→24、5→4、7→8、3→4、15→16、13→12、70→72、1→0）。
- Heatmap `borderRadius` 3→`RADIUS_SCALE_PX.xs`(6)。
- AC-008 [deploy] 人工目检：本 attempt 不部署，handoff 标注待 task-run/人工。

### AC-004 字号/字重映射表

| 旧值 | 新档 | token / class |
|---|---|---|
| 9 / 9.5px | label-caps | `text-[length:var(--text-label-caps)]` / `TEXT_SCALE_PX["label-caps"]` |
| 10 / 10.5px | label-caps | 同上 |
| 11px | label-md | `--text-label-md` |
| 11.5px | label-md | 同上 |
| 12 / 12.5px | body-sm | `--text-body-sm` |
| 13 / 13.5 / 14px | body-md | `--text-body-md` |
| 15 / 15.5px | title-sm | `--text-title-sm` |
| 16px | title-md | `--text-title-md`（Markdown h1） |
| 21px | title-lg | `TEXT_SCALE_PX["title-lg"]`（Donut 中心） |
| 28px | display-num | `--text-display-num` |
| Tailwind `text-sm` | body-md | accounts_section |
| Tailwind `text-lg` | title-md | SessionPreview |
| 内联 `fontSize: "13px"` | body-md | App.tsx 加载态 class |
| chart tooltip 12 | body-sm | TEXT_SCALE_PX |
| chart axis 10/10.5 | label-caps | TEXT_SCALE_PX |
| chart axis/label 11 | label-md | TEXT_SCALE_PX |
| sparkline SVG 9.5 | label-caps | TEXT_SCALE_PX |
| `font-medium` | 550 | `font-[550]` |
| `font-normal` | 450 | `font-[450]` |

### AC-007 间距/圆角映射表

| 旧 | 新 | 说明 |
|---|---|---|
| gap/m/p-0.5 | *-1 | 2→4px |
| gap/m/p-1.5 | *-2 | 6→8px |
| *-2.5 / *-3.5 | 保留 | 10/14px 语义·组件豁免 |
| mt/mb-[11px] | mt/mb-3 | 12px |
| mt-[22px] / pr/pl-[22px] | *-6 | 24px≈section-gap |
| gap-[3px] | gap-1 | 4px |
| gap-[5px] | gap-1 | 4px |
| gap-[7px] | gap-2 | 8px |
| gap-[9px] 等 9/10/12/14/16/18 | 保留 | 组件/语义豁免 |
| pt-[15px] | pt-4 | 16px |
| mb-[13px] | mb-3 | 12px |
| py-[70px] | py-18 | 72px |
| p-[7px] | p-2 | 8px |
| py-[1px] | py-0 | 徽章紧凑 |
| px-[5px] | px-1 | 4px |
| p-[10px_12px] | 保留 | 10/12 豁免（Markdown pre） |
| py-px | 保留 | 徽章 1px 发丝内边（豁免笔记） |
| rounded-[4px]/[7px] | rounded-xs | 6px |
| rounded-[9px]/[10px]/t-[11px] | rounded-md / rounded-t-md | 10px |
| rounded-[18px] | rounded-xl | 18px |
| Heatmap borderRadius 3 | RADIUS_SCALE_PX.xs (6) | 就近 xs |

### 豁免清单（AC-005/006）

- 组件 token：按钮 `px-[18px]`/`py` 配方中的 9/18；输入 9/12；列表行 10/12；`gap-[9px]` 等组件内间距。
- 语义 token：`panel-padding` 14（含 `px-3.5`/`py-3.5`）、`card-gap` 12、`card-padding` 16、`section-gap` 24、`row-height` 40。
- `py-px`：Badge/chip 发丝垂直内边，非布局网格节奏。
- 非 p/gap/m：`top-[2px]`、`h-[26px]`、`border-[0.5px]`、图标尺寸等不在本 AC 范围。

### 验证

- `pnpm test`：3348 passed / 9 skipped
- 审计单测 `type_space_token_unify.test.ts` 覆盖 AC-001/002/003/005/006
- session_typography：title label-md 11.5 < meta body-md 13.5


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

### Round 1 (2026-08-16 06:55 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-008 [deploy] 待人工四窗口目检）
- 证据：见 `handoff.json` `ac_evidence`；审计单测锁死字号/字重/间距/圆角/canvas；映射表见实施笔记

### Reviewer verdict

`single`：

- Round 1 general：PASS

### 结果摘要

字号字重间距圆角归位 DESIGN token；`TEXT_SCALE_PX`/`RADIUS_SCALE_PX` 收口图表；全量测试绿。
