---
tid: "t399"
slug: "cli_launcher_parse"
title: "launcher 参数语义反转:无参=CLI 帮助,--gui=GUI,子命令免 --cli 前缀"
status: "done"
branch: "t399_cli_launcher_parse"
worktree: ""
review_level: "full"
diff_anchor: "4e540e81dbededb75bd796a04a9ef8729b58c669"
depends_on: ""
conflicts_with: ""
note: "双击进 GUI;命令行无参打印帮助含 --gui;serve/quit 等免 --cli 前缀自动注入;--cli 兼容保留"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 需求确认（2026-08-15，用户）

- 双击（桌面图标）→ GUI（不变）。
- 命令行 `omni_panel` 无参 → 打印 CLI 帮助（含 `--gui`），不启动任何东西。
- 命令行 `omni_panel --gui` → GUI（剥掉 `--gui` 转发）。
- 命令行 `omni_panel serve|quit|open|...` → 免 `--cli` 前缀直接是 CLI 子命令。
- `--cli` 前缀兼容保留。
- 所有命令行相关帮助文案都加上 `--gui`。

实施步骤执行期记录。

### 执行记录（2026-08-15）

- 新增 `scripts/cli_arg_translate.mjs`（纯函数翻译：无参→help、--gui 首参→GUI、子命令注入 --cli、--cli 兼容、未知→invalid）+ `.d.mts` 类型声明 + 单测 `tests/unit/scripts/launcher_arg_translate.test.ts`（10 用例）。
- `vitest.config.mts` node project include 加 `tests/unit/scripts/**`。
- 改造 `scripts/omni_panel.mjs`：help/invalid 前置（RELEASE_BIN 检查前）；GUI 分支剥 --gui 转发；CLI 分支保留 probe/后台/前台逻辑。
- 踩坑：
  - ESM 顶层 `return` 非法 → main() 包装。
  - `.mjs` 混入 TS 注解 `: Promise<void>` → 移除。
  - 重写丢 `pathToFileURL` import → 补回。
  - `stdio:"inherit"` 时 `child.stderr` 为 null，dbus 过滤死代码 → 前台分支恢复 `["inherit","inherit","pipe"]`。
  - 入口守卫（`import.meta.url === argv[1]`）symlink 安装下失效（review f001）→ 移除守卫直接 `await main()`。
- 黑盒（xvfb/DISPLAY=:0，软链主仓 artifacts）：无参打印帮助 exit0；未知命令 exit1；serve 免前缀起服务写 cli.json port 正确；quit 免前缀停止；`serve --gui` 走 CLI；symlink shebang 执行 help/无参正常。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

有 critical / important，建表逐条处置。

### Round 1 (2026-08-15 20:01 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t399_code_f001|critical|已修|移除入口守卫，main() 无条件执行；symlink shebang 实测 help/无参正常|scripts/omni_panel.mjs:258|
|t399_code_f002|important|已修|前台 CLI 分支恢复 `stdio:["inherit","inherit","pipe"]`，dbus 过滤生效；lint 去多余 optional chain|scripts/omni_panel.mjs:196|
|t399_code_f003|minor|已修|GUI spawn 加 error handler|scripts/omni_panel.mjs:84|
|t399_code_f004|minor|已修|--gui 仅首参生效，`serve --gui` 走 CLI；补对应单测|scripts/cli_arg_translate.mjs:40|
|t399_test_f001|minor|遗留|HELP_TEXT 内容断言留在黑盒层（AC-001/006 已实测含 --gui 与子命令）；单测层无文本断言，minor 非阻断。Round 2 复核确认|p185|
|t399_test_f002|minor|已修|测试 2 命令枚举改硬编码期望列表，防 Set 缩水假绿|tests/unit/scripts/launcher_arg_translate.test.ts:24|

**关于 t399_test_f001 处置说明**：reviewer 建议 HELP_TEXT 内容加自动断言。本 task 决定 help 文本断言留在黑盒层（AC-001/006 已实测帮助含 --gui 与全部子命令），单测仅断言翻译出口 mode="help"。理由：help 文案属展示内容，逐字断言在单测层维护成本高、易碎；黑盒已覆盖「含 --gui 与子命令」验收点。此为 reviewer 可接受的处置方式（AC 验收未受影响）。

**关于 t399_code_f001（critical）根因**：`bin` 声明的 `omni_panel` 经 npm link/pnpm -g 安装是 symlink。Node 经 symlink 执行 shebang 脚本时 `process.argv[1]` 保持 symlink 路径，`import.meta.url` 是 realpath，入口守卫二者不等 → `main()` 永不执行 → 全部子命令静默 exit 0。旧代码无守卫可正常。移守卫后 symlink 场景实测通过。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/006 黑盒实测帮助含 --gui 与全部子命令；AC-002 转发参数单测 + 黑盒 serve 免前缀；AC-003/004 serve/quit 免前缀端到端；AC-005 --cli 兼容保留；AC-002 完整开窗属人工验证（转发参数正确性已自动覆盖）。详见 handoff.json `ac_evidence`。

### Reviewer verdict

`full`：

- Round 1 code：FAIL（f001 critical / f002 important / f003+f004 minor）
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

- launcher 参数语义反转落地：命令行默认 CLI（无参打印帮助含 --gui）、--gui 显式 GUI、serve/quit 等免 --cli 前缀自动注入、--cli 兼容保留；doc 更新 cli-mode 指南 + specs_index；1 遗留登记 p185。

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
