---
tid: "t300"
slug: "renderer_act_warnings_cleanup"
title: "renderer 存量 act 警告清理（settings_form 等）"
status: "done"
branch: "t300_renderer_act_warnings_cleanup"
worktree: ""
review_level: "single"
diff_anchor: "db4f25c5c15cab206dc8dc83ae7e9e29b8b0dc3c"
depends_on: ""
conflicts_with: ""
note: "p119：全量 pnpm test 约 80 条 not wrapped in act 警告（settings_form/cpa_connector_settings/provider_card_label_map/label_map_dialog 等），单文件不现全量现，疑似跨用例污染；按 t290 方式清理或定位污染源"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## 根因

全量 80 条 act 警告集中在 4 个组件：SettingsForm(30)/SessionLibrary(25)/CpaConnectorSettings(22)/SettingsView(3)。源是测试内 render 后组件挂载 effect 的异步 setState（config getSecrets/getState/label map 查询等，mock 立即 resolve 落微任务）在同步测试结束 act 外更新。t290 已修 popup_view_height，本 task 清其余存量。

## 方案

按 t290 已验证方式「等待包 act」：各测试文件的 render helper（renderForm/renderWebLoginForm/renderSettings）改 async，render 后 `await act(async () => { await Promise.resolve(); })` flush 微任务，使挂载 effect 的 setState 在 act 内落地；同步调用点加 await、同步 it 变 async。裸 render 的个别用例（label map loading / SettingsView web mode）同样补 flush。

- settings_form.test.tsx：renderForm + renderWebLoginForm async 化，39 用例
- cpa_connector_settings.test.tsx：renderSettings async 化，28 用例
- SessionShell.test.tsx：7 处 render 后 flush
- settings_view_general.test.tsx：hides window controls 用例 render 后 flush

断言零改动（用例数/断言数不减少）。

## 验证记录

- RED：全量 80 条 act 警告（settings_form 30 / SessionLibrary 25 / cpa 22 / SettingsView 3）。
- GREEN：逐文件修后单文件 0 警告；全量 `pnpm test` 0 act 警告、2857 passed。
- typecheck + lint 全绿。

无

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

### Round 1 (2026-08-11 05:00 UTC+8)

零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 全量 `pnpm test` stderr 0 条 act 警告；AC-002 4 文件 it/expect 计数与 base 完全一致（diff 比对 IDENTICAL，无删 expect）；AC-003 全量 254 files / 2857 passed

### Reviewer verdict

`single`：

- Round 1 general：PASS（零 finding）

### 结果摘要

renderer 测试全量 80 条 act 警告清零：render helper（renderForm/renderWebLoginForm/renderSettings）async 化 + render 后 flush 微任务，使挂载 effect 异步 setState 在 act 内落地；断言零改动。全量 2857 passed、0 警告、typecheck + lint 绿。

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
