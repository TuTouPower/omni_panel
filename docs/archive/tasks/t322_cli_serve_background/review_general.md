# Task review t322（reviewer_focus: 通用）

- task：`t322_cli_serve_background`
- spec：`docs/tasks/t322_cli_serve_background/spec.md`
- diff_anchor：`b3138a0a04b788230311c91fe068d5b2c21ec93a`
- target：`git diff b3138a0a04b788230311c91fe068d5b2c21ec93a`
- round：1
- reviewed_at：2026-08-12 19:00 UTC+8

## Findings

### t322_gen_f001 - `--user-data-dir <path>` 在 `--cli serve` 后导致 serve 启动崩溃（文档化用法不可用）

- 严重度：important
- 锚点：可观测行为缺陷——`scripts/omni_panel.mjs` 头部（L11、L15-17）文档化 `omni_panel --cli serve [--user-data-dir <dir>]`，t322 新代码 L52-57 也据此计算日志目录，但该调用实际让 app 抛 `CliUsageError` 并以非零码退出，serve 从未启动、health 不可达。
- 位置：`scripts/omni_panel.mjs:52-57`（新 data_root 推导）；根因 `src/main/cli/args.ts:102-107`；报错出口 `src/main/index.ts:120-124`
- 问题：
    1. 触发：`omni_panel --cli serve --user-data-dir .scratch/serve-bg --port <n>`。launcher 把原样 `args`（含 `--user-data-dir <path>`）透传给 app。
    2. `parse_cli_args` 对 `serve` 子命令解析：`--user-data-dir` 命中 `tok.startsWith("--")` 分支被跳过（`args.ts:102-104`），但其 value token `<path>` 不以 `--` 开头、又非 `--config`/`--port`，落入 `args.ts:105-107` 抛 `CliUsageError("意外位置参数: <path>")`。
    3. `index.ts:120-124` catch 后 `process.stderr.write("OmniPanel: 意外位置参数: ...")` + `process.exit(1)`，serve 进程直接退出。
    4. 实锤证据：`.scratch/serve-bg/logs/serve-2026-08-12T10-51-48-901Z.log` 内容为 `OmniPanel: 意外位置参数: .scratch/serve-bg`——implementer 自己的黑盒 run 即复现此崩溃。
    5. 根因是 app 侧 `args.ts` 只注释声明「`--user-data-dir` 等 Chromium switch 不影响解析」但未实现跳过 value token（`args.ts:13` 注释与行为不符），属 t322 之前已存在；t322 的 data_root 推导使 launcher 对 `--user-data-dir` 产生硬依赖，文档化用法全链路崩溃。唯一可用形态是 `--user-data-dir <path>` 放 `--cli` 之前（`slice(idx+1)` 排除该段），与 launcher 文档语法不一致。
- 建议：最小修复为 `args.ts` 未知 `--` 开关分支额外跳过其 value token（`i += 2`，判断 value 不以 `--` 开头）；或 launcher 端剥离 `--user-data-dir` 支持并从 serve 文档语法移除。因 spec 非范围声明「不改应用侧」，也可立 follow-up task 处理（见结论）。

### t322_gen_f002 - detached stdio 用 pipe 而非文件 fd：launcher 退出后子进程 stdout/stderr 不再落日志，且潜在 EPIPE 风险

- 严重度：minor
- 锚点：AC-002（后台 stdout/stderr 落 `~/.config/OmniPanel/logs/`、不依赖终端存活）——默认路径实测满足，但实现方式只在 launcher 存活期间成立。
- 位置：`scripts/omni_panel.mjs:69-83`
- 问题：子进程 spawn 用 `stdio: ["ignore","pipe","pipe"]`，日志由 launcher 侧 `out` 流转发。launcher 在打印 URL 后 `process.exit(0)`，子进程 stdout/stderr 的 pipe 读端随即关闭：此后 serve 任何 stdout/stderr 输出既不落 `serve-*.log`，且写向 broken pipe 可能触发 EPIPE/SIGPIPE 异常（Node 下未处理 error 可崩子进程）。当前 serve 启动后不再写 stdout/stderr（日志全走 app-\*.log），故黑盒未观测到失效，AC-002 满足；但依赖「启动后无声」这一隐式前提，脆弱。
- 建议：更健壮的 daemon 模式把日志 fd 直接交给子进程——`const fd = openSync(log_path, "a"); spawn(..., { detached: true, stdio: ["ignore", fd, fd] })`，launcher 打印 URL 后 `child.unref()` 退出，捕获可持续到进程结束且无 EPIPE。

### t322_gen_f003 - stdout URL 检测不累积 buffer，跨 chunk 拆分会漏检 → 15s 超时误报失败且孤儿后台进程

- 严重度：minor
- 锚点：AC-001（打印地址后立即返回）——单 chunk 场景实测通过。
- 位置：`scripts/omni_panel.mjs:73-82、94-101`
- 问题：每次 `data` 事件单独做 `includes("OmniPanel CLI mode listening on")`，不累积；若该行被 pipe 拆成多 chunk，检测永不命中，15s 超时 `process.exit(1)`。此时 serve 实际已成功启动且被 detached 继续运行（超时分支只 exit 不 kill child），用户收到「超时」但后台残留一个占用端口的实例。当前该行为单行单次 `process.stdout.write`（`src/main/index.ts:691`），实测单 chunk 命中，概率低。
- 建议：累积 stdout buffer 后按行匹配，或超时分支先 `child.kill()` 再 exit。

### t322_gen_f004 - 启动期子进程提前退出时，终端只给通用错误，真实原因仅落日志

- 严重度：minor
- 锚点：行为缺陷——启动失败诊断性差（正是 f001 崩溃时的表现）。
- 位置：`scripts/omni_panel.mjs:84-93`
- 问题：子进程早退（code!=0）时 launcher 只打印 `[omni_panel] serve 进程提前退出（code=1）`，子进程 stderr 的真实内容（如 `OmniPanel: 意外位置参数: ...`）只经 `child.stderr.pipe(out)` 进日志文件，用户终端看不到根因，须自行翻日志。
- 建议：早退分支把已捕获的 stderr 尾部回显到 launcher stderr，再附日志路径。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：4 条（f001 important，f002-f004 minor）。
- 未进表的提示：
    - launcher 参数分支（后台/前台）无提交态单测；spec 可测试性声明允许 shell 级验证，implementer 的 .scratch 黑盒已覆盖，不计缺口。
    - `mkdirSync(log_dir, {recursive:true})` 无 try/catch：HOME 不可写时抛未捕获异常（仍非零退出，可接受）。
    - `--foreground` 会被透传给 app，但 `args.ts:102-104` 将未知 `--` 开关跳过，不会报错——已核实非问题。
    - docs/guides/cli-mode.md 命令名 `omni-panel`（连字符）与 launcher 文件 `omni_panel`（下划线）不一致，系既有内容，非 t322 改动，未列 finding。
- 总体判断：AC-001~005 默认路径实现正确且黑盒通过，但文档化的 `--user-data-dir <dir>` serve 用法全链路崩溃（f001，可复现实锤），属未解决 important，故 FAIL。
- 系统性 follow-up：建议新建 task「args.ts 未知 `--` 开关跳过其 value token，使 `--user-data-dir` 位于 `--cli serve` 后不再误判位置参数」；slug 建议 `cli_args_skip_unknown_switch_value`。
- AC 复验方式：
    - AC-001：`re_verified`——代码路径 `src/main/index.ts:691` 打印 URL、launcher L76-80 命中后 `process.exit(0)`；盘上 `~/.config/OmniPanel/logs/serve-2026-08-12T10-52-15-735Z.log` 含 URL 行。live curl/health 依赖 .scratch 黑盒证据。
    - AC-002：`trust_prior`——日志落盘路径与内容已查证（上条），但「终端关闭后服务不退出」依赖 implementer 黑盒（health 200、进程存活）证据，未独立重跑。
    - AC-003：`trust_prior`——foreground 阻塞/超时被杀无残留来自黑盒；代码侧已核实 else 分支保留旧前台行为、`--foreground` 不报错。
    - AC-004：`trust_prior`——quit 停止/health 000 来自黑盒；cli.json pid 机制未改动（已读代码确认）。
    - AC-005：`re_verified`——直接读 docs/guides/cli-mode.md diff，后台/前台用法已补。
    - coverage = re_verified / 总 AC 数 = 2/5（trust_prior 占比 60%）
    - 建议合并前人工抽查 trust_prior 项（AC-002/003/004）。

reviewed_scope: dbd935c5c52c2ca3

verdict: FAIL

## Round 2 (2026-08-12 19:45 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准，不采信处置表自称）

- **t322_gen_f001（important）— 已修。** 证据：
    - `src/main/cli/args.ts:104-110` serve 分支新增 `--user-data-dir` 精确解析，消费 value token（`i += 2`），缺参抛 `CliUsageError("--user-data-dir 需要一个目录路径参数")`；不再落入「意外位置参数」。
    - `src/main/index.ts:136-141` serve 时 `app.setPath("userData", userDataDir)`，位于 `getDataRoot()`（whenReady 内 `index.ts:194`）与单实例锁（`index.ts:149`）之前，时序正确（已读 `src/main/core/paths.ts:11-13` 确认 getDataRoot 即 `app.getPath("userData")`）。
    - `tests/unit/main/cli/args.test.ts:62-72` 新增 2 case（解析 userDataDir + 缺参抛错），`npx vitest run tests/unit/main/cli/args.test.ts` 28/28 通过。
    - launcher `scripts/omni_panel.mjs:53-57` data_root 推导与 app 对齐（空格形式，见下方 f005 边界）。
    - 端到端黑盒（implementer .scratch，make:linux 产物）宣称 `--cli serve --user-data-dir /tmp/x` 后台启动成功；该条属 trust_prior（见 AC 复验）。
- **t322_gen_f002（minor）— 已修。** 证据：`scripts/omni_panel.mjs:71-74` 后台分支 `stdio: ["ignore", log_fd, log_fd]` 直接交日志 fd，无 pipe/EPIPE；launcher 退出后子进程持 dup 的 fd 继续落 `serve-*.log`。
- **t322_gen_f003（minor）— 已修。** 证据：`scripts/omni_panel.mjs:89-113` 弃 stdout chunk 检测，改轮询 `<dataRoot>/cli.json`，且 `info.pid === child.pid`（`cli-json.ts` 写入 `process.pid`，spawn 直接起 release 主进程，二者相等）防旧实例残留误读。chunk 拆分问题消除。残余：超时分支仍不 kill child（f003 建议的替代项之一未采纳），慢启动/路径不匹配时留孤儿——见 f005。
- **t322_gen_f004（minor）— 已修。** 证据：`scripts/omni_panel.mjs:80-87` exit code!=0 时打印 `[omni_panel] serve 进程提前退出（code=…）` + 日志路径，用户可见诊断入口。未回显 stderr 尾部（建议的另一半），但对 minor 可接受，已满足定位诉求。
- **顺手修两项**均合理：interval 不 `unref`（`omni_panel.mjs:91`）保持事件循环活跃至 cli.json 出现/超时，child 仅成功路径 `unref`（L101）——修复了原 `child.unref()`+`setInterval().unref()` 导致的轮询提前退出；`package.json:53` 补 `homepage`（electron-builder Linux 打包必需），未破坏其它字段。

### 本轮新发现

### t322_gen_f005 - 后台轮询对 `--user-data-dir=<path>`（= 形式）不识别：15s 超时 + 孤儿 serve 实例

- 严重度：minor
- 锚点：行为缺陷——`--user-data-dir` 以 `=` 连接形式放在 `--cli serve` 之后时，launcher 的 data_root 推导与实际服务目录不一致，后台启动误报失败且残留孤儿进程。
- 位置：`scripts/omni_panel.mjs:53`（`args.indexOf("--user-data-dir")` 精确匹配）；交互点 `src/main/cli/args.ts:111-113`（`=` 形式走未知 `--` 开关跳过，不设 userDataDir）
- 问题：复现 `omni_panel --cli serve --user-data-dir=/tmp/data`。
    1. launcher `indexOf("--user-data-dir")` 对 `--user-data-dir=/tmp/data` 返回 -1（实测 node 验证：space 形式 index 2，`=` 形式 -1），data_root 回落默认 `~/.config/OmniPanel`，轮询其 `cli.json`。
    2. app 侧 `parse_cli_args`：`--user-data-dir=/tmp/data` 非精确匹配，落入未知 `--` 开关分支被跳过（`args.ts:111-113`），`userDataDir` 未设置；但 Electron 原生接受该 Chromium switch，`userData` 实为 `/tmp/data`（f001 已证实 Electron 原生处理 `--user-data-dir`），`write_cli_json` 落在 `/tmp/data/cli.json`。
    3. launcher 轮询默认目录 15s 无命中（pid 校验对默认目录残留也通不过）→ 超时分支 `process.exit(1)`，且**不 kill child**——serve 已在 `/tmp/data` 后台运行，成孤儿；默认 dataRoot 下 `quit` 也无法定位该实例（quit 读默认 `cli.json`），用户只能手动 kill。
    - 该 `=` 形式被 args.ts 测试视为合法 Electron switch（`tests/unit/main/cli/args.test.ts:56-60`），Round 1 前经 stdout 检测可用，属后台轮询改造引入的回归。
- 建议：launcher 端 data_root 推导兼容 `=` 前缀（`--user-data-dir=`）或直接复用 `parse_cli_args` 解析出的 `userDataDir`；并让超时分支先 `child.kill()` 再 exit，消除孤儿残留。

## 结论

- 前轮 finding 复核：f001-f004 均按代码核实已修（f003 残余孤儿处理并入 f005）。
- 本轮新发现：1 条（f005 minor）。
- 未进表的提示：
    - `args.ts:12-13` 注释「Chromium switch 不影响本解析」在 serve 分支现对 `--user-data-dir` 失效（已实现为受支持参数），措辞略过时；非行为问题，未列 finding。
    - 后台分支下子进程因单实例锁以 code 0 退出时，launcher 静默 exit 0、无任何提示（用户二次 `serve` 同 dataRoot 时无反馈）。Round 1 已有同构行为，非本轮回归，未列 finding。
- 总体判断：Round 1 的 important blocker（f001）已消除并附单测；本轮 1 条 minor（f005）非阻断。无未解决 critical / important，PASS。
- 系统性 follow-up：无（f005 已在本报告处置，不另立 task）。
- AC 复验方式：
    - AC-001：`re_verified`——代码路径 `omni_panel.mjs:91-103`（轮询 cli.json 命中后打印 URL 并 exit 0）；live `curl /v1/health` 依赖 implementer 黑盒证据。
    - AC-002：`re_verified`——`omni_panel.mjs:71-74` detached + 日志 fd 直连，进程存活不依赖 launcher；「终端关闭后不退出」依赖黑盒证据（trust_prior 部分）。
    - AC-003：`re_verified`——`omni_panel.mjs:117-141` 前台分支保留 inherit 阻塞、Ctrl+C 终止；实际交互依赖黑盒。
    - AC-004：`trust_prior`——cli.json pid 机制未改动（`cli-json.ts` + `index.ts:696-709` 已读），quit 停止依赖黑盒。
    - AC-005：`re_verified`——直接读 `docs/guides/cli-mode.md:53-64` diff，后台/前台用法与日志路径已补。
    - coverage = re_verified / 总 AC 数 = 3/5（trust_prior 占比 40%）

reviewed_scope: 3b0edbdc8646dfab

verdict: PASS

## Round 3 (2026-08-12 19:49 UTC+8)

### 前轮 finding 复核（以 diff 与代码为准，不采信处置表自称）

- **t322_gen_f005（minor）— 已修。** 本轮修复只动 `scripts/omni_panel.mjs`（文件 mtime 19:46，晚于 Round 2 的 19:45；args.ts/index.ts/args.test.ts 19:28-19:30、cli-mode.md 18:53、package.json 19:36 均为 Round 2 前内容，本轮无其它改动）。证据：
    1. **data_root 双形式解析**（`omni_panel.mjs:54-61`）：空间形式 `--user-data-dir <path>` 走 `indexOf` 分支，`=` 形式 `--user-data-dir=<path>` 走 `args.find(a => a.startsWith("--user-data-dir="))` + `slice("--user-data-dir=".length)`。node 实测（复刻该段逻辑）：`--user-data-dir=/tmp/data` → `/tmp/data`；`--user-data-dir=/tmp/a=b` → `/tmp/a=b`（slice 边界正确，prefix 长 16）；`--user-data-dir=`（空值）→ `undefined` 回落默认 dataRoot（无害）；两形式并存时空间形式优先，与 app 侧 `args.ts:102-110`（精确匹配 `--user-data-dir` 先消费 value，`=` 形式落入未知 `--` 跳过）一致，无 data_root 与实际 userData 目录分叉。
    2. **超时分支 kill 子进程**（`omni_panel.mjs:117-120`）：`child.exitCode === null && !child.killed` 守卫下 `child.kill()`，后接同步 `process.exit(1)`——SIGTERM 后 exit handler 无机会再触发，无双 closeSync、无双 exit；孤儿实例消除。f003 残余的「超时不 kill child」随之闭环。
    3. `npx vitest run tests/unit/main/cli/args.test.ts` 28/28 通过，app 侧未受本轮改动影响。
    - f005 建议两项（launcher 兼容 `=` + 超时 kill）均按代码核实已落实。

### 本轮新发现

无（0 条）。

### 结论

- 前轮 finding 复核：f005 按代码与实测已修；f001-f004 为 Round 2 已核，本轮无变化。
- 本轮新发现：0 条。
- 未进表的提示：
    - `=` 形式解析无自动化单测（无 `*.test.mjs` / launcher 测试文件），仅依赖 implementer .scratch 黑盒（`=` 形式 serve 成功、端口正确、日志落 `=` 目录、quit 停止无残留）。spec 测试策略明确允许脚本级验证（「以最小改动为准」），Round 1 已确立 launcher 无单测不计缺口，故不列 finding；合并前可人工抽查 `=` 形式黑盒。
    - `--user-data-dir` 后跟缺参/flag 值（如 `--user-data-dir --foreground`）launcher 会把 flag 当路径，但 app 侧 `args.ts:105-110` 抛 `CliUsageError` 拒绝，子进程早退走 L80-87 错误提示，方向一致、非新回归。
- 总体判断：f005 两项建议（data_root `=` 兼容 + 超时 kill）均正确落实，parse 边界与 kill 守卫无新回归，无未解决 critical / important，PASS。
- 系统性 follow-up：无。
- AC 复验方式：
    - AC-001：`re_verified`——`omni_panel.mjs:98-110` 轮询 cli.json 命中（`info.pid === child.pid`）打印 URL 后 exit 0；live curl/health 依赖黑盒证据。
    - AC-002：`re_verified`——`omni_panel.mjs:71-81` detached + 日志 fd 直连；「终端关闭后不退出」依赖黑盒。
    - AC-003：`re_verified`——`omni_panel.mjs:128-152` 前台分支保留 inherit 阻塞、Ctrl+C 终止；实际交互依赖黑盒。
    - AC-004：`trust_prior`——cli.json pid/quit 机制未改动（本轮 diff 仅 omni_panel.mjs），quit 停止依赖黑盒。
    - AC-005：`re_verified`——`docs/guides/cli-mode.md:53-64` 后台/前台用法已补（Round 1 已读，本轮未再改）。
    - coverage = re_verified / 总 AC 数 = 3/5（trust_prior 占比 40%）

reviewed_scope: 26c173b8210d9a61

verdict: PASS
