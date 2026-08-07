---
tid: "t242"
slug: "draggable_provider_tabs"
title: "用量面板厂商 tab 支持拖动排序"
status: "done"
branch: "t242_draggable_provider_tabs"
worktree: ""
review_level: "single"
diff_anchor: "780c544deb5fc13ff6ab33096a21186438c52143"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- 复用既有 `providerOrder` 配置字段控制 tab 顺序，未新增 `providerTabOrder`。
- 拖拽手柄限定为 `<span class="tab-ic">`；按钮保留 `onClick`、`onDragEnter`、`onDragOver`，避免整颗 tab 可拖拽。
- dragEnd 后浏览器可能派生 click，用 `draggingRef` + setTimeout 抑制误切换。
- 黑盒验证时发现 `MOCK_FIXTURE=synthetic` 未透传给 Playwright webServer 子进程，改为手动启动 vite preview 后跑 e2e。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-07 08:10 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                                                                                                                   | fix_ref                                                                                             |
| ------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| t242_gen_f001 | important | 已修   | 将 draggable/onDragStart/onDragEnd 从 `<button class="tab">` 移到 `<span class="tab-ic">`，仅图标可发起拖拽；按钮保留点击切换与 dragenter/dragover 放置目标检测。同步更新单测目标元素。                     | src/renderer/components/ProviderNav.tsx:74-91, tests/unit/renderer/components/provider_nav.test.tsx |
| t242_gen_f002 | minor     | 撤回   | reviewer 在 Round 2 追加撤回记录：函数名 `use_provider_tab_drag` 为 snake_case，不满足 `react-hooks/rules-of-hooks` 的 `use[A-Z]` 模式，disable 为项目约定下的必要 suppress；Round 1 判为「不必要」系误报。 | review_general.md Round 2                                                                           |

### Round 2 (2026-08-07 08:19 UTC+8)

Round 2 无新 finding。reviewer 复核确认 `t242_gen_f001` 已消除，并追加 `t242_gen_f002` 撤回记录。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1/AC2/AC4：`tests/unit/renderer/components/provider_nav.test.tsx` 通过；`pnpm test:e2e:web` 全量通过。
    - AC3：`tests/unit/renderer/views/popup_view_config.test.tsx` 中「saves providerOrder to config when user reorders provider tabs」通过。
    - AC5：`tests/unit/renderer/hooks/use_provider_tab_drag.test.ts` 与 `provider_nav.test.tsx` 覆盖默认顺序回退。
    - AC6：由 web e2e 覆盖；Electron 端与 web 共享同一 renderer 组件与配置持久化路径。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：FAIL
- Round 2 general：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

用量面板厂商 tab 已支持仅通过图标拖拽排序，顺序复用 `providerOrder` 持久化；lint、typecheck、全量单元测试与 web e2e 均通过，review 两轮回后 PASS。
