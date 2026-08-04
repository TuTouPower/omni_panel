---
tid: "t203"
slug: "e2e_account_form_baseline"
title: "electron e2e 账号/表单用例基线失败调查"
status: "done"
branch: "t203_e2e_account_form_baseline"
worktree: ""
review_level: "full"
diff_anchor: "b1b89b9614ae25646973cd2e290ed12b1b3c8ae3"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 复现（AC1）

diff_anchor b1b89b96 全量 electron e2e 复现：**11 failed / 24 passed / 4 skipped**，与 p038 登记一致。逐组隔离复跑确认非 t194 引入，与本仓分支状态无关。

### 根因总判：全部 11 个失败均非 t189-t193 回归，也非本机环境差异

spec 假设「t189-t193 范围内回归或本机 connector 发现 / auto-seed 差异」**被实证否定**。11 个失败分三类，全部是测试选择器 / fixture 与渲染层长期漂移的产物，CI nightly 同样会红：

1. **过期账号 DOM 选择器（8 个）**：2026-06-14 渲染层重构（b8abaaea）把 settings 账号列表从扁平 `.acct-row`/`.acct-group`/`.ao-item` 改为按服务商分组的 VendorCard/CpaCard + `.acc-row`。历史测试从未同步（同期只有 a85a965e 更新了 add_account.spec.ts）。
    - `plugin_config`×3、`secrets_persistence`×3、`settings_view`×1、`auto_seed`×1 都落在 `.acct-row`/`.acct-group`/`.ao-item` 上。
    - 修复：选择器统一改为 `.acc-row`（CPA 源行是 `.acc-row.ds-row`，编辑按钮标题是「编辑（连接设置）」而非「编辑」）。
2. **测试 fixture 与删除功能（3 个）**：
    - `auto_seed`「existing config」：fixture 的 executablePath 指向已删除的 `resources/plugins/claude-usage-plugin.ts`（插件已迁 `connectors/`，且 executablePath 应指向含 manifest.json 的目录），且条目缺 `instanceId`、缺 `displayName` → `is_plugin_healthy` 判定不健康被 prune。
    - `settings_view`「用量标签映射」：全局外观字段 2026-06-12（24ae7d78）已删，标签映射改为按服务商在连接设置内编辑。重写为打开 CPA 连接设置 → 编辑数据标签映射 → LabelMapDialog。
    - `tray_menu_actions` quit：默认 fixture 不开 tray（E2E_WITH_TRAY 门控），托盘窗口从未创建。改用 `createTestWithSetup({ enableTray: true })`，并轮询 `.tray-menu-body` 出现（窗口隐藏创建、URL 异步加载）。
3. **生产代码缺陷（1 个）**：`popup_window_constraints` collapsing 用例。ProviderCard 对不可折叠卡片（无账号 / 采集失败 / 未挂 onToggleExpand）也渲染折叠箭头（CollapsibleCard 只要 children 非空就出按钮），箭头 `aria-label="折叠"`、onToggle 空操作、`aria-expanded="true"` 误导。测试的「循环点击到无剩余」永不终止（死按钮残留 ~16 个）→ 30s 超时。非回归（f7230fb9，2026-06-07 引入，已存在 2 个月）。用户确认**修生产代码**：CollapsibleCard 增加 `collapsible` prop（默认 true），ProviderCard 传 `collapsible={can_collapse}`，不可折叠卡片不再渲染箭头。

### 修复与验证

- 生产：`src/renderer/components/CollapsibleCard.tsx` + `ProviderCard.tsx`（TDD：先补单测再实现；collapsible_card 12 例、provider_card_states 9 例、popup_view 44 例全绿。stash 生产代码验证 3 条新单测先行失败）。
- 测试：plugin_config（openAccountForm 改 `.acc-row` + `button[title^="编辑"]`，CPA 内联渲染先取 class 再点击，重启前等保存落盘）、secrets_persistence（fixture 加 displayName、`.acc-card`）、settings_view（测试 1 去 dialog 断言、测试 2 重写为 CPA 标签映射对话框空态）、auto_seed（fixture 路径/instanceId/displayName、`.acc-row`）、tray_menu_actions（仅 quit 测试用 enableTray + 轮询 `.tray-menu-body`，其余 3 测试保持默认 fixture 避免 firstWindow 歧义）。
- 全量 electron e2e 复跑见下方收尾报告。

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

### Round 1 (2026-08-04 16:20 UTC+8)

code PASS + test PASS，5 条 finding 全 minor，逐条已修。

| finding_id     | severity | status | rationale                                                                         | fix_ref                                       |
| -------------- | -------- | ------ | --------------------------------------------------------------------------------- | --------------------------------------------- |
| t203_code_f001 | minor    | 已修   | settings_view 测试名去掉「saves」，改「renders empty label-map dialog」           | settings_view.spec.ts:37                      |
| t203_code_f002 | minor    | 已修   | 过时注释同步（settings_view 头部 .acct-row/appearance、auto_seed 计数）           | settings_view.spec.ts:6, auto_seed.spec.ts:98 |
| t203_test_f001 | minor    | 已修   | plugin_config「filled and saved」改等 cpa-connector-settings 隐藏（真保存可观测） | plugin_config.spec.ts:64                      |
| t203_test_f002 | minor    | 已修   | 同 code_f001，测试名已改                                                          | settings_view.spec.ts:37                      |
| t203_test_f003 | minor    | 已修   | 补 popup live 分支单测（onToggleExpand + 空账号组），stash 验证先行失败           | provider_card_states.test.tsx:141             |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1（复现 + 区分回归与环境）：diff_anchor b1b89b96 全量 e2e 复现 11 failed / 24 passed / 4 skipped；根因实证为 8 个过期选择器 + 3 个 fixture/删除功能 + 1 个生产缺陷，非 t189-t193 回归、非本机环境差异（详见实施笔记）。
    - AC2（代码回归修复）：CollapsibleCard `collapsible` prop 生产修复，popup_window_constraints 恢复通过；TDD 单测 3 条 stash 验证先行失败、修复后通过。
    - AC3（环境/fixture 修复）：auto_seed fixture 路径/instanceId/displayName、tray enableTray、settings_view 用例重写，相关用例恢复通过。
    - AC4（无新增失败）：全量 electron e2e **35 passed / 4 skipped / 0 failed**（4 skipped 为既有 pre-existing skip）。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（2 minor，均已修）
- Round 1 test：PASS（3 minor，均已修）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- p038 结案：11 个失败非回归亦非环境差异，全部为测试选择器/fixture 与渲染层漂移 + 1 个既有生产缺陷（死折叠箭头），修复后 e2e 全绿；审阅建议的兄弟组件同类缺陷登记 p041。
