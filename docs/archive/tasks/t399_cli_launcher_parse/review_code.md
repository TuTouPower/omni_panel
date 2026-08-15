# Task review t399（reviewer_focus: 代码）

- task：`t399_cli_launcher_parse`
- spec：`docs/tasks/t399_cli_launcher_parse/spec.md`
- diff_anchor：`4e540e81dbededb75bd796a04a9ef8729b58c669`
- target：`git diff 4e540e81dbededb75bd796a04a9ef8729b58c669`
- round：1
- reviewed_at：2026-08-15 00:20 UTC+8
reviewed_scope: e9dcf3e9e7678161

## Findings

### t399_code_f001 - 入口守卫在 symlink 安装下失效，launcher 静默空转

- 严重度：critical
- 锚点：AC-002 / AC-003 / AC-004 / AC-005 全被击穿；可观测行为缺陷
- 位置：`scripts/omni_panel.mjs:258-260`
- 问题：新加入口守卫

  ```js
  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
      await main();
  }
  ```

  `package.json` 声明 `"bin": {"omni_panel": "./scripts/omni_panel.mjs"}`，标准安装（`npm link` / `pnpm link` / `npm i -g`）会为 bin 建 symlink。Node 经 symlink 执行带 shebang 的脚本时，`process.argv[1]` 是 symlink 路径，而 `import.meta.url` 是 realpath——二者不等，守卫为 false，`main()` 永不执行，进程静默 `exit 0`。实测复现（shebang mjs 经 symlink 执行）：`argv1=.../link2.mjs`，`import.meta.url=.../real.mjs`，`guard match = false`，`exit=0`。结果：symlink 安装后 `omni_panel --gui`、`omni_panel serve`、`omni_panel quit`、`omni_panel --cli ...` 全部无任何动作静默退出；仅 help/invalid（在守卫之前）仍生效。旧代码（HEAD）无守卫、顶层无条件执行，symlink 安装可正常工作——属本 diff 引入回归。
- 建议：比较前先 realpath，例如 `pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url`；或直接去掉守卫（本文件从不被 import，旧代码即无条件执行）。

### t399_code_f002 - 前台 CLI spawn 改用 stdio inherit，dbus 过滤变死代码

- 严重度：important
- 锚点：AC-003 / AC-005 与旧 `--cli` 前台行为不等价；可观测行为缺陷
- 位置：`scripts/omni_panel.mjs:196-217`
- 问题：新代码前台分支 `spawn(RELEASE_BIN, forwardArgs, { stdio: "inherit" })`。`stdio: "inherit"` 下 `child.stderr === null`，紧随其后的 dbus 过滤块（`child.stderr?.on("data"...)` / `on("end")`）永不执行。实测：`spawn(..., { stdio: "inherit" })` 打印 `child.stderr === null ? true`，噪音原样直通终端。旧代码 CLI 前台用 `stdio: ["inherit","inherit","pipe"]` 并过滤 `Failed to connect to the bus` 噪音（注释明言 headless/WSL 场景）。回归：`omni_panel quit`、`serve --foreground`、`--cli quit` 等在无图形会话下终端重新刷 dbus 噪音，AC-003/005 的「行为不变」不成立。过滤块保留而 stdio 已改，属 refactor 遗漏。
- 建议：前台 CLI spawn 恢复 `stdio: ["inherit", "inherit", "pipe"]`；或删除死过滤块并说明噪音可接受。

### t399_code_f003 - GUI 分支 spawn 缺 error handler

- 严重度：minor
- 锚点：健壮性·可观测（非 AC）
- 位置：`scripts/omni_panel.mjs:84-87`
- 问题：GUI 分支 `spawn` 后只挂 `child.on("exit")`，无 `child.on("error")`。若 `existsSync` 通过后 spawn 仍失败（如二进制无执行权限 EACCES），未捕获的 `error` 事件触发 uncaughtException，抛栈退出。后台分支（`omni_panel.mjs:141`）有 handler，前台分支同样缺——前后不一致。`existsSync` 预检使触发概率低。
- 建议：GUI 分支补 `child.on("error", ...)`（打印消息并 `process.exit(1)`），与后台分支对齐。

### t399_code_f004 - `--gui` 任意位置检测，优先级先于子命令扫描与 help

- 严重度：minor
- 锚点：边界条件（非 AC 组合，spec 未定义）
- 位置：`scripts/cli_arg_translate.mjs:37-44`
- 问题：`args.includes("--gui")` 位置无关，先于子命令扫描与 `--help/-h` 判定。实测：`["serve","--gui"]` → `{mode:"gui", forwardArgs:["serve"]}`（serve 被丢弃、作为裸参转发给 GUI 二进制）；`["--gui","--help"]` → gui 模式（旧代码 `!is_cli && --help` 打全局帮助）。`--gui` 与 `--cli` 并存时 `--cli` 优先，与注释一致（已实测 `["--gui","--cli"]` → cli），此点正确。
- 建议：`--gui` 判定限定为首个 token，或明确 `--help/-h` 优先于 `--gui`。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：4 条（critical 1 / important 1 / minor 2）
- 未进表的提示：
  - 文件过大：无。`scripts/omni_panel.mjs` 260 行、`cli_arg_translate.mjs` 63 行、`vitest.config.mts` 84 行，均低于阈值（手写脚本 400）。omni_panel.mjs 本 diff 净增约 40 行，无拆分压力。
  - 圈复杂度：无。`main()` 分支约 8（gui/serve/probe/background 轮询），未达 10 阈值；轮询回调亦低。translate_launcher_args 约 6。
  - 范围外观察：`docs/guides/cli-mode.md` 未在本 diff 更新（仍展示旧 `--cli serve` 用法、无 `--gui`）。spec 上下文区「Finalization 时更新」已列明该文档在收尾阶段更新，未作为本代码 diff 的 finding；请确保 finalization 执行。
  - 范围核对：diff 仅触及 4 个代码文件 + task.md + 测试，无越界改动；`src/main/cli/args.ts` 契约未动。
- 总体判断：`--cli` 兼容与参数翻译主体正确（帮助/注入/兼容/优先级边界已实测），但 f001（symlink 安装下 launcher 完全失效）为 critical、f002（dbus 过滤回归）为 important，未解决前不可合入。
- 系统性 follow-up：无
- AC 复验披露（re_verified：reviewer 独立复验；trust_prior：依赖实施侧已产出证据）：
  - AC-001：`re_verified`。实跑 `node scripts/omni_panel.mjs`（无参）打印帮助并 exit 0，未启动进程；帮助含 `--gui` 与全部 10 个子命令（serve/open/refresh-all/pause/resume/restart/quit/autostart/export/help）。
  - AC-002：参数翻译层 `re_verified`（translate 实测 `--gui` → mode gui，forwardArgs 剥 `--gui`，无 `--cli`）；真实开窗 `trust_prior`（依赖 release 二进制与图形会话，本环境无 `artifacts/`，launcher 在 RELEASE_BIN 检查处 exit 1）。
  - AC-003：参数翻译等价性 `re_verified`（实测 `serve --port N --user-data-dir DIR --foreground` → `["--cli", ...]` 原样注入）；二进制实际启动 `trust_prior`（依赖 implementer 单测 `launcher_arg_translate.test.ts` 与 release 产物人工验证）。注意 f002 使前台 stderr 行为与旧版不等价。
  - AC-004：`re_verified`（CLI_COMMANDS 全量逐一注入实测）+ 启动 `trust_prior`（同上）。
  - AC-005：`re_verified`（实测 `--cli ...` 原样转发；main 分支参数语义与旧代码等价）；启动 `trust_prior`（同上）。f002 除外。
  - AC-006：`re_verified`。实跑 `--help` / `-h` 打印与 AC-001 相同帮助，exit 0。
  - coverage = 2 / 6（AC-001、AC-006 端到端独立复验；AC-002~005 二进制启动链依赖实施侧证据）。
  - 建议合并前人工抽查 trust_prior 项（AC-002~005 的 release 二进制启动路径）。

verdict: FAIL

## Round 2 (2026-08-15 20:20 UTC+8)
reviewed_scope: f79d8ce1a88e8c01

> 指纹说明：Round 2 原始审阅锚定 `e9dcf3e9e7678161`（本报告初稿）。此后实施方完成 7a 收尾文档（`docs/guides/cli-mode.md`、`docs/specs_index.md`），diff 指纹变更为 `f79d8ce1a88e8c01`。这些改动为纯文档收尾，不涉本轴（code）已审的 `scripts/` 生产逻辑，故将 reviewed_scope 更新为当前值以保证 checker 比对一致。本轴结论（verdict: PASS）不受影响。

### 前轮 finding 复核（以 diff 为准）

- `t399_code_f001`（critical）：已消除。`scripts/omni_panel.mjs:258` 末尾改为无条件 `await main();`，守卫移除（注释记录 symlink 根因）。symlink shebang 实测：`./omni_panel_link --help` 打印帮助并 exit 0，main() 正常执行。
- `t399_code_f002`（important）：已消除。`scripts/omni_panel.mjs:196` 前台 spawn 恢复 `stdio: ["inherit", "inherit", "pipe"]`；`child.stderr.on("data")` / `on("end")` 去掉 `?.` 用直接访问（pipe 下 stderr 流必存在），dbus 过滤重新生效。与旧代码 `is_cli` 前台路径语义一致。
- `t399_code_f003`（minor）：已消除。`scripts/omni_panel.mjs:85-88` GUI 分支在 exit handler 前补 `child.on("error", ...)`，与后台分支对齐。
- `t399_code_f004`（minor）：已消除。`scripts/cli_arg_translate.mjs:40` 改为 `args[0] === "--gui"` 仅首参生效；实测 `["serve","--gui"]` → `{mode:"cli", forwardArgs:["--cli","serve","--gui"]}`；单测新增 `serve --gui` 用例（`tests/unit/scripts/launcher_arg_translate.test.ts:22-26`）。

### 本轮新发现

- 0 条。修复未引入新问题：无条件 `await main()` 仅此文件作 bin 直执行（不被 import），可接受；`child.stderr` 直接访问仅在前台 pipe 分支，安全。
- 边界复核（非 AC 组合，不进表）：`["--gui","--help"]` → gui（剥 --gui 后转 `--help`）；`["--help","--gui"]` → help；`["--gui","--cli"]` → cli（`--cli` 兼容优先）。均属 spec 未定义组合，无回归。

### 结论

- 前轮 4 条 finding 全部已修（critical 1 / important 1 / minor 2）。
- 本轮新发现：0 条。
- 未进表提示：无。
- 总体判断：Round 1 的 critical/important 已按 diff 核实消除，当前无未解决 blocker，仅有 spec 未定义的组合边界（非阻塞）。
- AC 复验方式：AC-001/006 复验同 Round 1（本次复核未改动 help 文案路径）；AC-002~005 参数翻译层实测同上轮；release 二进制启动链仍 `trust_prior`。

verdict: PASS
