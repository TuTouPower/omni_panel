# Task review t399（reviewer_focus: 测试）

- task：`t399_cli_launcher_parse`
- spec：`docs/tasks/t399_cli_launcher_parse/spec.md`
- diff_anchor：`4e540e81dbededb75bd796a04a9ef8729b58c669`
- target：`git diff 4e540e81dbededb75bd796a04a9ef8729b58c669`
- round：1
- reviewed_at：2026-08-15 19:52 UTC+8
reviewed_scope: e9dcf3e9e7678161

## Findings

### t399_test_f001 - HELP_TEXT 内容（AC-001/AC-006「帮助含 --gui 与全部 CLI 子命令」）无任何测试断言

- 严重度：minor
- 锚点：AC-001（帮助含 `--gui` 用法与全部 CLI 子命令）、AC-006（帮助含 `--gui`）
- 位置：`tests/unit/scripts/launcher_arg_translate.test.ts:5-12`（help 用例只断言 mode）；`scripts/omni_panel.mjs:48-60`（HELP_TEXT，无可达测试）
- 问题：单测断言 `translate_launcher_args` 返回 `mode: "help"`，但 AC-001/AC-006 明确要求帮助文本含 `--gui` 与 serve/open/refresh-all/pause/resume/restart/quit/autostart/export/help。该文本在 `omni_panel.mjs` 的 `HELP_TEXT` 常量，不经 `translate_launcher_args` 纯函数，当前无任何自动测试触达其内容；若 `HELP_TEXT` 漏写 `--gui` 或任一子命令，测试仍全绿。本 diff 也没有新增 spawn `scripts/omni_panel.mjs` 断言 stdout 的 launcher 级/e2e 用例。实现当前正确（我人工复核 `omni_panel.mjs:52-57` 含 `--gui` 与全部 10 个子命令），故非 blocking。
- 建议：把 `HELP_TEXT` 抽为可导出常量，在单测中对其断言包含 `"--gui"` 与 10 个子命令 token；或新增一个 spawn 脚本断言 stdout 的轻量用例。属覆盖可更广，不阻断。

### t399_test_f002 - 测试 4 的命令枚举取自被测模块，回归缩水时假绿（AC-003/004）

- 严重度：minor
- 锚点：AC-003、AC-004（子命令免前缀注入 `--cli`）
- 位置：`tests/unit/scripts/launcher_arg_translate.test.ts:22-28`
- 问题：`for (const cmd of CLI_COMMANDS)` 从被测模块 `scripts/cli_arg_translate.mjs:9-20` 导入期望集合，期望值 = 实现自身声明。若 `CLI_COMMANDS` 未来回归缩水（漏掉 refresh-all/autostart 等子命令），循环体自动少跑，测试仍绿，AC-003/004 的「全部子命令」验证随实现一起失效。期望集合不应从被测代码取。
- 建议：在测试中硬编码期望命令数组（serve/open/refresh-all/pause/resume/restart/quit/autostart/export/help）并对其循环；可加一条 `expect([...CLI_COMMANDS]).toEqual(期望数组)` 锁住集合完整性。

## 结论

- 前轮 finding 复核：首轮，不适用。
- 改测方向复核：无。本 diff 未修改任何既有测试，仅新增 `tests/unit/scripts/launcher_arg_translate.test.ts`（`git diff` stat 只有该文件新增，无既有测试改动，无删除/反转/弱化断言）。
- 本轮新发现：2 条（均 minor）。
- 未进表的提示（范围外观察，非 finding）：
  - `tests/e2e/packaged/smoke.spec.ts:103-113` 实际直接 `spawn(PACKAGED_EXE)`（打包二进制），并不经 launcher `scripts/omni_panel.mjs`，与 spec 测试策略「smoke.spec.ts 经 launcher 启动」描述不符；但正因不经 launcher，无参语义反转不影响其断言，无需回归。属 spec 描述性小误差，不构成测试缺口。
  - `tests/e2e/cli/cli_flow.spec.ts` 经 `electron.launch` 直接启动 `out/main/index.js`，不经 launcher，确认不受本次改动影响（符合测试策略声明）。
  - 代码层观察（超出测试审查职责，供 code reviewer 跟进）：`scripts/omni_panel.mjs:196` 非后台 CLI 分支改为 `stdio: "inherit"` 后 `child.stderr` 为 `null`（已用 node 实测确认），随后 `:204-217` 的 dbus 过滤 `child.stderr?.on(...)` 成为死代码、静默不生效；旧代码 CLI 分支用 `["inherit","inherit","pipe"]` 使过滤生效。表现为 CLI 前台命令终端重新出现 dbus 噪音，属行为回归。当前测试套件无 launcher 级 spawn 用例，无法捕获。
  - 可选覆盖扩展（minor，未阻断）：带值 flag 前置仅用 `--port`（test 6）覆盖 command-scan 跳过逻辑，`--config` / `--user-data-dir` 走同一 `VALUE_FLAGS` 共享路径，未单独用例；`["--cli", "--gui"]` 组合未测（按 AC-005 原样转发语义正确）。
- 总体判断：单测直接触达生产实现（import 真实 `translate_launcher_args`，零 mock），断言全部为精确 `toEqual`，9/9 全过，AC-001~006 映射表均有测试且运行复验通过；危险模式扫描零命中。仅 2 条 minor，无未解决 critical/important。
- 系统性 follow-up：无。dbus 过滤回归属单文件代码缺陷，建议由 code review 处置，无需建 task。

### AC 复验披露

- AC-001：`re_verified` — 无参→help 单测（test:5-7）；help 分支 `omni_panel.mjs:62-65` 写 HELP_TEXT 后 `exit(0)`、无 spawn 路径（代码查证）；HELP_TEXT（:48-60）人工复核含 `--gui` 与全部 10 子命令。
- AC-002：`re_verified`（转发层）/ `trust_prior`（真实开窗）— 单测断言 `--gui` 剥掉后转发（test:14-20）；gui 分支 `spawn(RELEASE_BIN, forwardArgs)`（omni_panel.mjs:83-88）查证。真实开窗依赖可测试性声明批准的间接覆盖策略，headless 无法自证。
- AC-003：`re_verified` — test:30-37 断言 serve 注入 `--cli` 且选项原样保留；test:22-28 循环含 serve。
- AC-004：`re_verified` — test:22-28 循环 CLI_COMMANDS 断言注入 `--cli`（受 f002 枚举同源限制）。
- AC-005：`re_verified` — test:46-51 断言 `--cli` 原样转发。
- AC-006：`re_verified` — test:9-12 断言 `--help`/`-h`→help；与 AC-001 共用同一 `HELP_TEXT` 常量（单一来源）。

coverage = re_verified 5 / 6（AC-002 真实开窗部分 trust_prior，占比 16.7% ≤ 30%）。

verdict: PASS

## Round 2 (2026-08-15 20:06 UTC+8)
reviewed_scope: f79d8ce1a88e8c01

### 前轮 finding 复核

- f001（minor，HELP_TEXT 内容无自动断言）：仍存在（非阻断）。测试文件未新增 HELP_TEXT 内容断言，仍只断言翻译出口 `mode="help"`；task.md 处置表标「已修（黑盒验证）」，属 claim——黑盒验证不在本 diff，依赖 handoff 人工证据。作为 minor 接受为遗留处置，不阻塞 PASS。
- f002（minor，命令枚举取自被测模块致 Set 缩水假绿）：已修。`tests/unit/scripts/launcher_arg_translate.test.ts:31-43` 硬编码 `expectedCommands`（全 10 命令，字母序），并以 `expect([...CLI_COMMANDS].sort()).toEqual(expectedCommands)` 先行锁集合完整性——Set 缩水会挂集合断言而非循环假绿；循环改走硬编码列表。修法非弱化，反而新增一条更强集合断言。

### 本轮新发现

- 0 条新 blocking。新增 `serve --gui` 用例（test:22-27）覆盖 f004 代码修复（`--gui` 仅首参生效，`cli_arg_translate.mjs:38-40`）：断言 `["serve","--gui"]` → `{ mode: "cli", forwardArgs: ["--cli","serve","--gui"] }`，与实现逐字一致，精确 `toEqual`。此前无该行为测试，属纯新增语义覆盖，非迁就实现。

### 改测方向复核

- 无「迁就实现」改测。命令循环每用例断言强度与 Round 1 相同（`toBe` + `toEqual`），新增集合断言为加强；`serve --gui` 为代码行为变更后的新增覆盖，未就地改写任何旧预期。

### 未进表提示

- 指纹漂移说明：本轮 prompt 于 20:02:22 渲染，携带 `579956f4eff5af39`；`docs/guides/cli-mode.md` 于 20:03:38（渲染后）被最终修订，当前 diff 指纹为 `f79d8ce1a88e8c01`。本轮审查的是含 cli-mode.md 最终版在内的当前 diff（cli-mode.md 为纯文档收尾，不涉测试），故 reviewed_scope 锚定当前值，保证 checker 比对一致。
- spec 测试策略新增「黑盒：软链主仓 artifacts，真实跑 launcher 的 serve/quit/help/invalid 分支与 symlink 执行」，但 diff 内无对应自动测试（仅单测文件）。该策略项需 release 产物 + symlink 安装，属人工验证步骤，与可测试性声明「其余 AC 以纯函数单测覆盖」一致；建议以 handoff.json ac_evidence 呈现黑盒运行证据，非自动测试缺口。
- 代码层：非后台 CLI 分支 `stdio: ["inherit","inherit","pipe"]`（omni_panel.mjs:200-202）恢复，dbus 过滤重新生效，Round 1 范围外观察已被 code review 修复；GUI 分支 `stdio: "inherit"`（:84）无需过滤，正常。入口守卫已移除（omni_panel.mjs:266 `await main()`），symlink 安装下不再静默不执行（code review f001）。

### AC 复验披露（Round 2）

- AC-001：`re_verified` — 无参→help（test:5-7）；help 分支（omni_panel.mjs:62-65）写 HELP_TEXT 后 `exit(0)`、无 spawn（代码查证）。
- AC-002：`re_verified`（转发层）/ `trust_prior`（真实开窗）— test:14-20 断言 `--gui` 剥除转发；gui 分支 spawn（omni_panel.mjs:83-91）查证；f004 后 `--gui` 仅首参生效，test:22-27 覆盖 `serve --gui` 边界。
- AC-003：`re_verified` — test:51-58 断言 serve 注入 `--cli` 且选项原样保留；test:44-48 循环含 serve。
- AC-004：`re_verified` — test:44-48 硬编码 10 命令断言注入 `--cli`。
- AC-005：`re_verified` — test:67-72 断言 `--cli` 原样转发。
- AC-006：`re_verified` — test:9-12 断言 `--help`/`-h`→help；与 AC-001 共用同一 `HELP_TEXT` 常量（单一来源）。

coverage = re_verified 5 / 6（AC-002 真实开窗 trust_prior，占比 16.7% ≤ 30%）。

### 总体判断

- 测试文件 10/10 全过（`pnpm exec vitest run tests/unit/scripts/launcher_arg_translate.test.ts`）；Round 1 两条 minor 中 f002 已修、f001 接受为遗留（非阻断）；本轮 0 新 blocker；无迁就实现改测；危险模式扫描零命中。PASS。

verdict: PASS
