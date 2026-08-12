# Task review t335（reviewer_focus: 通用）

- task：`t335_cli_help`
- spec：`docs/tasks/t335_cli_help/spec.md`
- diff_anchor：`152ade521e99d8918f64eed5f52a66934a1c6600`
- target：`git diff 152ade521e99d8918f64eed5f52a66934a1c6600`
- round：1
- reviewed_at：2026-08-13 02:10 UTC+8

## Findings

### t335_gen_f001 - 顶层 --help 拦截位于 RELEASE_BIN 检查之后，无 release 产物时 help 不可用

- 严重度：minor
- 锚点：AC-001（`omni_panel --help` 打印全局用法，exit 0，不启动服务）在无 release 产物环境下不成立
- 位置：`scripts/omni_panel.mjs:52-66`（help 拦截块），前置门禁 `scripts/omni_panel.mjs:38-45`
- 问题：help 拦截块（52-66）位于 RELEASE_BIN 存在性检查（38-45）之后。仓库内未执行 `pnpm make:linux` 时，`omni_panel --help` / `-h` 走 38-45 报「release 产物缺失」并 exit 1，不打印用法——与 AC-001 字面行为（exit 0 + 打印）相悖。本 worktree 即此场景（无 `artifacts/`），无法实机复验 AC-001。此为既有「方案 C：只服务 release 产物」不变量的延续（任何全局命令均依赖 release bin），非本 task 引入回归，属环境边界；但因 help 块是 t335 新增，如实上报。
- 建议：非阻塞。若希望 `--help` 在未打包时仍可用，将 help 拦截块前移到 RELEASE_BIN 检查之前（help 内容为静态字符串，不依赖产物）；否则在 spec/task.md 注明该约束，或接受现状。

### t335_gen_f002 - index.ts whenReady help 分支（打印 + exit 0）无自动化测试

- 严重度：minor
- 锚点：AC-002 完整可观察行为（打印子命令清单 + exit 0，不启动服务）的实机输出无自动测试；spec 测试策略仅声明 parse 级单测 + shell 级 launcher 验证
- 位置：`src/main/index.ts:175-190`
- 问题：`--cli help` 的打印与 `app.exit(0)` 实现在 Electron whenReady 内，无单测覆盖（Electron main 进程不易单测）。现有 `tests/unit/main/cli/args.test.ts` 只断言 `parse_cli_args` 返回 `{ type: "help" }`，未触达 index.ts 的打印内容/exit/不启动服务语义。本环境无 release 产物，无法经 launcher 实机复验该分支 → AC-002 实机输出侧为 trust_prior。分支极薄（打印静态文本 + exit + return，位于 `getDataRoot()`/config 加载等任何服务初始化之前），静态核验语义正确（先于 export/控制分支、先于全部服务初始化），风险低。
- 建议：非阻塞。可追加一条冒烟断言「`--cli help` 时 stdout 含 serve/quit/export 且退出码 0、不写 cli.json 不监听端口」，由 implementer 按处置表决定。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 两处 help 文案（`scripts/omni_panel.mjs` 顶层用法 + `src/main/index.ts` 子命令清单）为相互独立的静态字符串，后续新增子命令（如改 `CONTROL_COMMANDS`）需同步两处，存在 drift 风险——维护性观察，非缺陷，不进 finding 表。
    - 顶层 `--help` 需 release 产物已就绪（方案 C 既有不变量），见 f001。
- 总体判断：AC-001~004 均已实现且不变量守住；tsc 0、全量 2992 passed 复跑通过；仅 2 条 minor，无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验方式

- AC-001（顶层 `--help`/`-h` 打印全局用法 exit 0 不启动服务）：`trust_prior`。本 worktree 无 `artifacts/` release 产物，help 块位于 RELEASE_BIN 检查之后，无法实机执行；仅静态核验拦截逻辑（`!is_cli && args.includes("--help")||"-h"`，位于 spawn 之前，拦截后 `process.exit(0)`），依赖实施侧已声称的 launcher 实机验证。
- AC-002（`--cli help` 打印子命令清单 exit 0）：`re_verified`（解析侧）+ `trust_prior`（实机输出侧）。复跑 `npx vitest run tests/unit/main/cli/args.test.ts` 29 passed，含 `--cli help` 解析断言；`src/main/index.ts:175-190` 静态核验：help 分支为 whenReady 内首个分支，`app.exit(0)` 先于任何服务初始化。实机打印内容/退出码依赖实施侧 shell 验证。
- AC-003（未知子命令仍报错）：`re_verified`。复跑 args.test.ts，`--cli deploy` 抛 `/未知的 --cli 子命令/` 断言保留并通过；`args.ts` help 分支仅命中 `sub === "help"`，未改未知子命令路径。
- AC-004（不影响 serve/控制）：`re_verified`。全量 `npx vitest run` 2992 passed（9 skipped）复跑通过；launcher 拦截仅在无 `--cli` 时生效（`--cli serve/控制` 透传）；`args.ts` 仅新增 help 分支，serve/export/控制解析路径未动；`index.ts` 控制分支新增 `!== "help"` 排除（运行时冗余、类型收窄必需——`run_control_command` 参数类型 `ControlCommand` 不含 `"help"`，无此排除 tsc 必报错），serve 启动路径未动。

coverage = 3 / 4

reviewed_scope: 8fde14d5166be27b

verdict: PASS

## Round 2 (2026-08-13 02:15 UTC+8)

- round：2
- reviewed_at：2026-08-13 02:15 UTC+8

### 前轮 finding 复核

- t335_gen_f001（minor）：**已消除**。help 拦截块前置至 `scripts/omni_panel.mjs:42-55`，位于 RELEASE_BIN 检查（57-64）之前；`is_cli` 顺移至 38 行，拦截条件仍为 `!is_cli && (--help || -h)`。实机复验（本 worktree 无 `artifacts/`）：`node scripts/omni_panel.mjs --help` 正常打印全局用法并 exit 0；`-h` 同。side effect 排查：
    - `--cli help` / `--cli serve --help` / `--cli quit --help` 均未被 help 块拦截（`is_cli=true`），落到既有 RELEASE_BIN 检查（方案 C 不变量，与 Round 1 一致，无回归）。
    - `--user-data-dir -h` 类病态输入会命中 help 块——属错误用法，打印帮助为合理响应，非缺陷。
    - 有产物时行为与 Round 1 相同（静态文本 + exit 0，先于 spawn），无回归。
- t335_gen_f002（minor）：**接受合理**。`src/main/index.ts:175-190` help 分支为 whenReady 内首分支，`process.stdout.write` 静态文本 + `app.exit(0)` + return，先于 export/控制分支、`getDataRoot()`/config 加载与全部服务初始化；`args.ts:88-91` 解析侧已有单测覆盖（args.test 29 passed，含新增 `--cli help` 断言）。分支极薄、语义静态可核验，trust_prior 处置成立，无补充测试必要。`index.ts:203` 控制分支新增 `!== "help"` 排除为 tsc 类型收窄必需（`run_control_command` 参数类型 `ControlCommand` 不含 `"help"`），非冗余逻辑。

### 本轮新发现：0 条

### 未进表的提示

- `--cli help` 在 launcher 层仍依赖 release 产物（方案 C 既有不变量，Round 1 f001 已注明）；launcher 顶层 help 为纯静态、无需产物，故本轮修复仅覆盖无 `--cli` 的顶层 `--help`/`-h`。`--cli help` 需启动 app 打印子命令清单，依赖产物属设计使然，非缺陷，不进 finding 表。

### 总体判断

f001 修复实证有效（无产物 `--help`/`-h` exit 0），无副作用；f002 接受合理。tsc 0、args.test 29 passed。无未解决 critical/important，无新 finding。

### AC 复验方式（Round 2 delta）

- AC-001（顶层 `--help`/`-h` exit 0 不启动服务）：`re_verified`（本轮升级）。无 `artifacts/` 实机 `node scripts/omni_panel.mjs --help` / `-h` 均打印全局用法并 exit 0；`--cli` 场景不被拦截。
- AC-002（`--cli help` 打印子命令清单 exit 0）：`re_verified`（解析侧）+ `trust_prior`（实机输出侧，同 Round 1 未变）。
- AC-003（未知子命令报错）：`re_verified`（args.test 含 `--cli deploy` 抛 `/未知的 --cli 子命令/` 断言，29 passed）。
- AC-004（不影响 serve/控制）：`re_verified`（本轮新增证据：`--cli serve --help`/`--cli quit --help` 未被 launcher 拦截，落既有 RELEASE_BIN 检查路径）。

coverage = 3 / 4

reviewed_scope: c62165987cb5517a

verdict: PASS
