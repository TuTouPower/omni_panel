# Task review t400（reviewer_focus: code）

- task：`t400_cli_help_unify`
- spec：`docs/tasks/t400_cli_help_unify/spec.md`
- diff_anchor：`66b8d5a375ee63bc729bb9e25d693aeed9a3d514`
- target：`git diff 66b8d5a375ee63bc729bb9e25d693aeed9a3d514`
- round：1
- reviewed_at：2026-08-16 02:35 UTC+8

## Findings

（无）

## 结论

- 本轮新发现：0 条
- 未进表的提示：
  - `CLI_COMMANDS` 仍含 `"help"` token，但 `translate_launcher_args` 在 `CLI_COMMANDS.has` 前特判 `command === "help"` → `mode: "help"`。语义正确（合法 token、不注入 `--cli`）；Set 与 mode 表意略分叉，可读性可接受，非缺陷。
  - 主进程仍保留 `command.type === "help"` 分支，打印 `CLI_HELP_TEXT` 后 `app.exit(0)`——服务 AC-003（`--cli help` 兼容路径），内联旧文案已删（AC-004）。
  - 打包约束：`electron-builder.yml` `files` 仅 `out/**`；构建产物 `out/main/index.js` 已内联完整 `CLI_HELP_TEXT`（含 `--gui`），与 s029/d038 结论一致，运行时不依赖 `scripts/`。
- 总体判断：
  - **AC-001**：launcher 四入口（无参/`--help`/`-h`/`help`）均 `mode: "help"`，打印同一 `CLI_HELP_TEXT`。
  - **AC-002**：共享文本含 `--gui` 与 serve/open/refresh-all/pause/resume/restart/quit/autostart/export。
  - **AC-003**：`--cli help` 仍 `mode: "cli"` 转发主进程；主进程写同一常量。
  - **AC-004**：`scripts/omni_panel.mjs` 与 `src/main/index.ts` 均 import `scripts/cli_help.mjs`；旧「OmniPanel CLI 子命令：」内联已删。
  - **AC-005**：`[deploy]`，本 diff 不自证 release 包；构建期已证明文本进 `out/main`。
  - 范围克制：无 CLI 语义改动、无 `translate` 其他子命令行为变化、无无关重构。
- 文件规模 / 复杂度：新建 `scripts/cli_help.mjs` ~19 行；触及文件均远低于阈值；无高 CC 新增。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: dfe9719c0bb08c06

> 指纹说明：Round 1 审阅锚定 `c21ef1d85493d241`。此后 7a 收尾文档（`docs/specs/cli_help_unify.md`、`docs/specs_index.md`、`docs/guides/cli-mode.md`、`docs/blueprint/decisions.md` ADR 019）使指纹变为 `dfe9719c0bb08c06`。纯文档收尾，不涉本轴已审生产逻辑；更新 reviewed_scope 以通过 checker。verdict 不变。
