# Task review t400（reviewer_focus: test）

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
- 覆盖核对：
  - **AC-001**：`cli_help.test.ts` 断言四入口 `translate_launcher_args` → `mode: "help"`；`launcher_arg_translate.test.ts` 补 `help` 子命令专测。与 spec「有意不测」一致：不跑四入口字节 e2e，靠共享常量 + 同一 mode 间接证明；黑盒已用 md5 实比四入口一致。
  - **AC-002**：共享文本断言 `--gui` + 硬编码子命令列表（非从被测 Set 派生，避免循环假绿）。
  - **AC-003**：`--cli help` 仍 `mode: "cli"` + `forwardArgs: ["--cli","help"]`；主进程写 `CLI_HELP_TEXT` 由源码 import 断言 + 构建内联/electron 黑盒旁证。
  - **AC-004**：源码扫描 `omni_panel.mjs` / `index.ts` import `cli_help.mjs`，且禁止旧内联标题残留。
  - **AC-005**：`[deploy]`，无自动测，符合可测试性声明。
- 危险模式扫描：
  - 无 mock 掉被测逻辑；帮助常量真实 import。
  - `REQUIRED_SUBCOMMANDS` / 四入口表为测试侧硬编码，不读被测模块拼期望。
  - 源码 `readFileSync` 扫描属契约锁，略脆但锚定稳定字符串，可接受。
  - 旧测「每个 CLI 子命令注入 --cli」改为 skip `help`，并新增 help→help mode 用例，语义更新而非改弱断言（未把旧期望改成错误实现的输出）。
- 总体判断：测试触达生产路径（`cli_help.mjs` / `cli_arg_translate.mjs` / 源码引用面）；红→绿路径清晰；无假绿信号。PASS。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: dfe9719c0bb08c06

> 指纹说明：Round 1 审阅锚定 `c21ef1d85493d241`。7a 收尾文档使指纹变为 `dfe9719c0bb08c06`（无测试/生产代码变更）。更新 reviewed_scope；verdict 不变。
