# Task spec

## 背景

全局 CLI 入口 `scripts/omni_panel.mjs` 当前用 `--cli` 作为 CLI 模式总开关：`omni_panel`（无参）启动 GUI，`omni_panel --cli serve/quit/...` 进入无窗口 CLI。用户反馈命令行体验别扭——`omni_panel` 本是 CLI 入口，却默认开 GUI；所有子命令被迫加 `--cli` 前缀。目标语义反转：**双击（桌面图标）进 GUI，命令行默认是普通 CLI**。`omni_panel --gui` 显式进 GUI；`omni_panel serve/quit/...` 免前缀直接是 CLI 子命令。保留 `--cli` 前缀兼容。

## 契约区

### 范围

- 修改 `scripts/omni_panel.mjs` 参数解析与转发：无参打印 CLI 帮助；`--gui` 剥掉后转发子进程（进 GUI）；`serve/quit/...` 等 CLI 子命令自动注入 `--cli` 转发；`--cli` 原样转发（兼容保留）。
- 更新 `--help` 文案，列出 `--gui` 与所有 CLI 子命令。
- 更新相关文档（`docs/guides/cli-mode.md` 等）与 CLI 测试。

### 非范围

- 不改 Electron 主进程 `src/main/cli/args.ts` 契约（`--cli` 仍是主进程唯一 CLI 开关）。
- 不改 `--cli serve` 自身参数（`--port` / `--config` / `--user-data-dir` / `--foreground`）语义。
- 不改 GUI 模式自身行为（`pnpm start` / 双击二进制）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：命令行 `omni_panel`（无任何参数）打印 CLI 帮助并退出（退出码 0），不启动任何进程；帮助含 `--gui` 用法与全部 CLI 子命令（serve/open/refresh-all/pause/resume/restart/quit/autostart/export/help）。
- [ ] AC-002：命令行 `omni_panel --gui` 启动 GUI（转发给 release 二进制，去掉 `--gui`），不进入 CLI 模式。
- [ ] AC-003：命令行 `omni_panel serve [--port N] [--user-data-dir DIR] [--foreground]` 等价于旧 `omni_panel --cli serve ...`（启动无窗口服务）。
- [ ] AC-004：命令行 `omni_panel open|refresh-all|pause|resume|restart|quit|autostart|export` 等价于旧 `--cli <子命令>`（瘦客户端控制）。
- [ ] AC-005：命令行 `omni_panel --cli <任意原样参数>` 行为不变（兼容保留），与旧版本一致。
- [ ] AC-006：`omni_panel --help` / `-h` 打印与 AC-001 相同的帮助（含 `--gui`）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-002：需真实 GUI 会话（Electron 窗口）验证，agent 无法在 headless 自证——通过「转发参数正确性」单测间接覆盖（launcher 剥 `--gui` 后转发给二进制的 argv 正确），真实开窗由人工 `[deploy]` 验证。
- 其余 AC：可自动测试（launcher 参数翻译为纯函数，可单测；子命令等价性可断言转发 argv）。

## 上下文区

- 来源：t275（CLI serve 引导）、t276（CLI 控制子命令）；用户 2026-08-15 需求确认「命令行无参打印 CLI 帮助」。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- GUI 真实开窗（AC-002 完整链路）：headless 环境无法开窗，仅验证转发参数正确性。
- release 产物缺失分支（RELEASE_BIN 不存在时报错退出）：已有行为，非本次变更核心。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- launcher 参数翻译抽成纯函数（输入 argv，输出转发 argv + 模式判定），单测覆盖 AC-001/002/003/004/005 映射表。
- 现有 `tests/e2e/cli/cli_flow.spec.ts` 与 `tests/e2e/packaged/smoke.spec.ts` 均直接 launch/spawn Electron 二进制、不经 launcher，不受本次 launcher 改动影响；确认不回归。
- 黑盒：软链主仓 artifacts，真实跑 launcher 的 serve/quit/help/invalid 分支与 symlink 执行。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：无参行为从「开 GUI」变「打印帮助」是行为破坏，习惯双击/无参开窗的用户需改用 `--gui`。
- 回退：删除翻译逻辑、恢复无参=GUI 旧行为；`--cli` 兼容路径始终保留，旧脚本不受影响。

### 依赖与约束

- 不改 `src/main/cli/args.ts`；`--cli` 仍是主进程唯一 CLI 开关，launcher 只做参数翻译。
- 平台：`scripts/omni_panel.mjs` 为 node 脚本，跨平台（win/darwin/linux）；产物路径分支保持。

### Finalization 时更新的 blueprint

- `docs/guides/cli-mode.md`：更新命令示例（去 `--cli` 前缀、加 `--gui`）。
- `docs/blueprint/decisions.md`：记录 CLI/GUI 入口语义决策（若属长期约束）。
