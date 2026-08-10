---
tid: "t271"
slug: "settings_design_migration"
title: "设置窗口迁移到统一设计规范"
status: "done"
branch: "t271_settings_design_migration"
worktree: ""
review_level: "single"
diff_anchor: "02f0b93fab91ab065a2f620cc3bf1421bf2ddc6a"
depends_on: "t270"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 迁移记录

| 范围                  | 迁移                                                                                 | 说明                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| settings sections     | appearance/data/about/accounts/general 改用 `ui/*` 与 utility class                  | 保留设置、代理、数据操作、关于、账号和 CPA inline 编辑行为            |
| dialogs               | Account/Add/Rename/Confirm/CpaAdd/LabelMap 改用 `ui/Dialog`、`ui/Button`、`ui/Input` | 保留保存、取消、Escape、遮罩关闭、密钥回填和错误流程；删除嵌套 Dialog |
| account controls      | AccountRow/CpaCard/CpaConnectorSettings 改用 `ui/Button`、`ui/Switch`                | 开关提供 `role="switch"`；保留账号增删改、刷新、隐藏和 CPA 监控范围   |
| forms/auth            | SettingsForm、CPA 管理表单、API/OAuth/WebLogin/Session/Device 表单改用统一控件       | 保留 secret vault 回填、登录、Cookie 和参数保存                       |
| add-account flows     | VendorPicker、LocalScanForm 与添加账号表单改用统一控件                               | 保留 vendor/auth 两步选择、OAuth、CPA、local scan 和错误路径          |
| label-map / style CSS | 标签映射、用量条、about、picker、dialog、local scan 旧专属 CSS 删除或迁移            | 保留账号/CPA 布局与其他窗口共享样式                                   |

### 关键决策

- `set-seg`、`ad-input`、`set-select`、旧 `acct-dialog` 等控件迁移到 `ui/*`；布局机制类保留。
- 统一 `Dialog` 增加 alertdialog、aria label 和 backdrop test id 支持，不改变关闭与焦点行为。
- 账号区不新增上下文菜单：现有账号路径未发现 `ctx-menu` 或 `onContextMenu` 行为。
- 测试定位改用语义 role、aria label 和稳定 test id；行为断言保持原语义。

### 验证

- `pnpm test`：252 个 test files 通过，2750 passed，2 skipped。
- 受影响 renderer 单测：6 个 test files，112 tests 全部通过。
- `pnpm typecheck`、`pnpm lint`：通过。
- `pnpm build`：Electron main/preload/renderer 与 web bundle 均通过。
- settings Web E2E：使用 `MOCK_FIXTURE=synthetic` 与手动 preview，9 tests 全部通过；默认 `tests/e2e/fixtures/data/responses.json` 缺失，未使用默认 fixture。
- settings Electron E2E：`E2E_HEADLESS=1 xvfb-run -a ...`，12 tests 全部通过。
- t271 改动文件 `prettier --check`、`git diff --check`：通过；reviewer 报告未纳入 implementer 格式门禁。
- `pnpm check`：typecheck/lint 通过；仓库级 format check 被 11 个 t271 diff 外文件阻断，deadcode/arch 未执行。
- 设置专属旧 selector 扫描：当前 renderer 无 `.acct-dialog`、`.ad-*`、`.set-select`、`.ah-logo`、`.ah-ver`、`.back-btn`、`.cf-save`、`.cf-remove` 运行时引用。
- 人工视觉验收未执行。

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

### Round 1 (2026-08-09 11:24 UTC+8)

| finding_id    | severity  | status | rationale                                                | fix_ref                                                      |
| ------------- | --------- | ------ | -------------------------------------------------------- | ------------------------------------------------------------ |
| t271_gen_f001 | important | 已修   | 按统一 Dialog 真实语义与当前无入场动画契约重写首帧测试。 | `tests/e2e/web/add_account_dialog_first_frame.spec.ts:17-41` |
| t271_gen_f002 | important | 已修   | About Web E2E 改用 logo 稳定属性与版本文本语义定位。     | `tests/e2e/web/settings_provider_accounts.spec.ts:17-18,28`  |

### Round 2 (2026-08-09 11:55 UTC+8)

| finding_id    | severity  | status | rationale                                                     | fix_ref                                       |
| ------------- | --------- | ------ | ------------------------------------------------------------- | --------------------------------------------- |
| t271_gen_f003 | important | 已修   | 移除旧导航基础色规则，保留选中态 token 并补充选中态回归测试。 | `src/renderer/views/SettingsView.tsx:431-456` |

### Round 3 (2026-08-09 12:20 UTC+8)

| finding_id    | severity  | status | rationale                                                          | fix_ref                                               |
| ------------- | --------- | ------ | ------------------------------------------------------------------ | ----------------------------------------------------- |
| t271_gen_f004 | important | 撤回   | Round 4 撤回原失败描述；当前测试已改用 `aria-pressed` 提升可信度。 | `review_general.md:139`                               |
| t271_gen_f005 | important | 已修   | 删除无引用旧控件 CSS，保留 settings-head/cpa-foot 布局。           | `src/renderer/styles/globals.css:1234-1240,1582-1587` |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：自动化 AC 1–4 满足；AC 5 `[deploy]` 未人工自证。
- 证据：`pnpm test` 通过（252 个 test files，2750 passed，2 skipped）；`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；Web E2E 通过 9 tests；Electron E2E 以 `E2E_HEADLESS=1 xvfb-run -a` 无头运行并通过 12 tests；旧 Settings 专属 selector 扫描无生产引用。人工视觉逐屏对照未执行。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：FAIL
- Round 2 general：FAIL
- Round 3 general：FAIL
- Round 4 general：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 设置窗口完成统一组件与语义 token 迁移；自动化门禁和 Round 4 review 通过，视觉逐屏对照未执行。
