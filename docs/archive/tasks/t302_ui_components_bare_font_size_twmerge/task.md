---
tid: "t302"
slug: "ui_components_bare_font_size_twmerge"
title: "ui 组件库批量清理：自定义字号类被 tailwind-merge 吞色（d032 机制扩展）"
status: "done"
branch: "t302_ui_components_bare_font_size_twmerge"
worktree: ""
review_level: "single"
diff_anchor: "2e3f7322b192405b6f2489f0130bb2122135fb40"
depends_on: ""
conflicts_with: ""
note: "p126（t298 顺手发现）：d032 机制（tailwind-merge 吞自定义字号 token 颜色类）扩展清理 ui 组件库多组件；修法同 Button（text-[length:var(--text-*)]）"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 实施（2026-08-11）

- **根因确认**：d032 机制（tailwind-merge 3.6 实测：`text-body-md text-[var(--color-on-surface)]` twMerge 输出丢字号类；`text-[length:var(--text-body-md)]` 两者共存）。p126 列举组件 + grep 扫描补全后受影响文件 59 个、245 处「自定义字号 token 与颜色类并存」。
- **范围界定**：AC-002 要求全仓无裸自定义字号类残留。白名单替换 8 个 token（body-md/sm、label-md/caps、title-sm/md/lg、display-num）→ `text-[length:var(--text-*)]`。纯 className 字面量与 cn() 内统一处理（Tailwind 下字色不同属性无冲突，但统一显式防未来并入 cn() 踩坑）。
- **排除**：`text-label-sm`（11 处）无对应 `--text-label-sm` token，Tailwind 下不生成字号类，属存量失效类——不引入新 token 语义，登记遗留；`text-code-md` 源码无使用；globals.css 定义处不动。Badge 属 d032 机制适用（cn() 内 label-caps+on-primary），与 t301 的 Badge 配色正交不冲突，保留改动。
- **测试**：ui.test.tsx 新增 2 测试——(1) 受影响 ui 组件（Input/Textarea/Select/SecretInput/PanelTitleBar）渲染断言 length 字号类 + 颜色类共存，ListRow subtitle 改静态源码断言（渲染容器在连续 render 后偶发 undefined，非业务问题）；(2) AC-002 全仓 grep 门禁（node:fs 递归扫描，排除 length 形式与 label-sm）。
- **e2e 适配**：`ui_component_theme.spec.ts:191` Dialog 标题选择器 `.text-title-sm` 改为转义 arbitrary 形式 `.\text-\[length\:var\(--text-title-sm\)\]`。
- **踩坑**：PanelTitleBar 的 base 在 `data-panel-titlebar` 属性 div；ListRow subtitle 无独立 class 选择器；探针测试放 tests/ 目录才被 vitest 收集（.scratch 不在 include）。

### 验证

- `pnpm typecheck`：PASS（0 错误）。
- `pnpm test` 全量：253 files passed / 1 skipped，2859 tests passed，无回归（含 session_typography 字号层级断言——`font_px` 的 `includes("text-body-sm")` 在 length 形式下仍子串匹配，测试绿）。
- renderer 定向：110 files / 1096 tests passed。
- AC-002 grep 门禁测试：通过（目标 token 无裸类残留）。

### 遗留观察

- `text-label-sm`（11 处）无 token，Tailwind 不生成字号类，视觉与删除等价——不属本 task 引入，登记 pending 供后续定夺（补 token 或改用现有字号）。

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

### Round 1 (2026-08-11 10:55 UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id    | severity | status | rationale                                                   | fix_ref             |
| ------------- | -------- | ------ | ----------------------------------------------------------- | ------------------- |
| t302_gen_f001 | minor    | 已修   | AC-002 门禁 regex 补 code-md + 守卫改 token 级 + 注释行排除 | ui.test.tsx:323-351 |
| t302_gen_f002 | minor    | 已修   | length_form regex 加 /g 消除双 length 形式行误报            | ui.test.tsx:327     |

Round 1-4 全部 PASS；f001/f002 已修，label-sm 排除已登记 p127（主仓）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 渲染断言（Input/Textarea/Select/SecretInput/PanelTitleBar cn() base length 类 + 颜色共存）；AC-002 全仓 grep 门禁（无裸自定义字号类，排除 label-sm）；AC-003 `pnpm test` 全绿 + typecheck 0 错误

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS
- Round 2 general：PASS
- Round 3 general：PASS
- Round 4 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 全仓 59 文件自定义字号类统一 `text-[length:var(--text-*)]`（d032 机制扩展清理），AC 全满足，4 轮 review 全 PASS，登记 p127（label-sm 无 token）。
