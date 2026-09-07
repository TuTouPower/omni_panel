---
tid: "t458"
slug: "session_library_title_cwd_ui"
title: "会话库 UI 独立标题、工作目录筛选"
status: "done"
branch: "t458_session_library_title_cwd_ui"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "1e6a9c13d40277c88a8c928d108d998cb3870c4e"
depends_on: "t457"
conflicts_with: ""
note: "会话库筛栏对齐查询契约；single：纯 UI 接线，无鉴权/资金/迁移"
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- TDD：组件层先行红 6 例（aria-label「标题」「工作目录」无对应输入），实现 `title_filter`/`directory_filter` state + `backend_filters`/searchContent filters 透传 + 清空逻辑 + 输入框后全绿。
- AC-006 论证：web `main-web.tsx` 与桌面共用同一 `App` → `SessionShell` → `SessionLibrary`（无组件分叉），bridge 差异只在 `window.usageboard` 实现——web `getSessions` 序列化由 t457 用例覆盖，本 task 补 web `searchContent` body 透传断言。
- e2e 适配（非掩盖回归）：新输入框使筛栏增高约 44px，中视口 2100 下 50 条首屏 sh 1859 > ch 1856 恰好翻转溢出，refill 按定义停止，`session_library_mount_refill` f001「50 条不溢出」前提被破坏。探针实测基线 ch 1900/sh 1900 → 改后 ch 1856/sh 1859；视口 2100→2200 恢复前提，断言语义不变。未改视口的另外两用例通过，证明 refill 语义无回归。
- 黑盒验证：`pnpm test:e2e:web` 全量 96 passed（含会话库搜索/筛选/排序/预览闭环、mount refill 3 用例）。
- worktree 环境：electron dist 与 path.txt 从主仓复制；门禁按 testing.md worktree 注意事项执行。
- 门禁记录：format:check 全量仍红，但 warn 集合是 main 的严格子集（22 vs 24；少的是 t457 已修的 server.ts / token-stats.ts），分支不新增违规。
- review 流程纠正：front matter `review_level=single`，最初误按 full 派 code/test reviewer（`review_code.md`/`review_test.md` 为该误派产物，独立有价值，保留入库但不作 single 级门禁证据）；随后按 general prompt 派 single 级 reviewer 写 `review_general.md`（PASS）。gate 以 general 报告判定。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `.repo_template/scripts/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-09-08 08:02 UTC+8)

general 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用；组件层 6 用例 + web bridge 1 用例 + e2e 全量 96 passed

### Reviewer verdict

`single`：

- Round 1 general：PASS（0 finding）

### 结果摘要

- 会话库筛栏新增独立「标题」「工作目录」输入，值作为查询 `title`/`directory` 与全部条件 AND；内容搜索候选同约束；清空筛选一并清空；桌面/web 同组件同行为。
