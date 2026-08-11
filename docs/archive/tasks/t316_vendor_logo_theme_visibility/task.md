---
tid: "t316"
slug: "vendor_logo_theme_visibility"
title: "修复 provider 亮暗 logo 双图叠加"
status: "done"
branch: "t316_vendor_logo_theme_visibility"
worktree: ""
review_level: "single"
diff_anchor: "acdcfaae10b6b290daddd98639b1730a0f47e7cc"
depends_on: ""
conflicts_with: "t313"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- TDD：先加 2 个失败单测（theme_logo 图片含 `block` 且 wrapper 无 img display 规则、单图分支 `block`+尺寸回归），再写 web e2e（`vendor_logo_theme.spec.ts`），红→实现→绿。
- 修复：`Icon.tsx` wrapper 移除 `[&_img]:block`（特异性 (0,1,1) 覆盖状态类），`logo_img` 加 `block`（与 `hidden`/`dark:hidden`/`dark:block` 同层 (0,1,0)）。`[&_svg]:block` 保留。单图分支同样受益。
- web e2e：真实构建 CSS + chromium computed display。三个坑：① popup 有 offscreen mirror（`data-popup="mirror"`）复制 nav，选择器必须限定 live 树；② grok/opencode_go 的 svg logo（<4KB）被 Vite 内联为 data URL，不能按 `src*="_light"` 定位，改按 DOM 顺序（组件固定 light 前 dark 后）；③ playwright `reuseExistingServer` 复用时需显式 `pnpm build:web` 重建产物。
- fixture：`synthetic.json` 固化注入 `synthetic-exa`/`synthetic-grok` 空 snapshot connector（tab 需要 connector 才渲染 VendorMark）；`gen_synthetic.mjs` 同步加固化注入块防重跑覆盖（沿用 synthetic-kimi-failed/opencode-go 模式）。
- 编译 CSS 核对：`[\&_img\]\:block img` 规则无任何元素再持有该 class（单测守卫 `not.toContain`），不再作用于 img；`.block`/`.hidden`/`.dark\:block` 同层生效。死规则仍会出现在产物 CSS——Tailwind v4 全文本扫描会把 spec.md/测试断言里的 `[&_img]:block` 候选串编译进 CSS，无 DOM 应用即无效果，不修。
- 全量 web e2e 82 passed（含既有 spec，fixture 新增 tab 无回归）；`pnpm test` 2929 passed，仅 designmd.test.ts 存量失败（与本次改动无关）；typecheck/lint 干净。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-12 02:20 UTC+8)

| finding_id    | severity | status | rationale                                                                                                                                                                                                                                                                                                                 | fix_ref                                                |
| ------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| t316_gen_f001 | minor    | 已修   | 产物 CSS 残留 `[&_img]:block img` 死规则（Tailwind 全文本扫描把 Icon.tsx 注释/spec/单测断言候选串编译进 CSS，无 DOM 应用、e2e 实测行为正确）。按 reviewer 建议接受现状并处置表留痕：删除注释候选串损害修复解释价值；维护者若从注释复制该 class 回 wrapper 会重现 bug，单测可拦 DOM 层但拦不住注释复制路径——留痕即处置完成 | 本行留痕（无代码改动；观察登记即 reviewer 建议的处置） |

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002/003 由 web e2e vendor_logo_theme.spec.ts 4 用例（真实构建 CSS + computed display 互斥）覆盖；AC-004 由 e2e 单图 provider 用例 + icon.test.tsx 单图分支回归覆盖。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：PASS（f001 minor）
- Round 2 general：PASS（f001 处置留痕登记，0 finding）

`full`：

- N/A（single 级）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- VendorMark 亮暗双图叠加修复完成：wrapper 去 `[&_img]:block`（特异性覆盖状态类）、img 加 block 同层显隐；web e2e 真实构建 CSS 验证三 provider 双图两主题互斥；AC 四条全绿，review 2 轮全 PASS（1 minor 留痕）。存量 designmd 失败见 p142。
