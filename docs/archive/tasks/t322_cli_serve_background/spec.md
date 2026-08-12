# Task spec

## 背景

`omni_panel --cli serve` 目前前台运行：输出 `OmniPanel CLI mode listening on http://localhost:18263/` 后进程阻塞终端，用户需另开终端或 Ctrl+C。期望：默认后台运行（输出 URL 后命令立即返回，服务在后台继续），除非用户显式加参数前台运行。

## 契约区

### 范围

- `scripts/omni_panel.mjs` launcher：`--cli serve` 默认后台运行——spawn release 进程 detached，stdout/stderr 重定向到 `~/.config/OmniPanel/logs/`（复用现有日志目录），打印服务已后台启动 + URL + pid 后 launcher 退出。
- 新增前台参数（如 `--foreground`）：带该参数时保持当前前台行为（输出 URL 后阻塞，Ctrl+C 停止）。
- 后台运行的实例仍可经现有 `omni_panel --cli quit --port <n>` 停止（cli.json pid 机制不变）。

### 非范围

- 不改应用侧（main/index.ts / cli.json / serve 实现本身）。
- 不改 Windows/macOS launcher 路径（本 task 只动 Linux 产物路径分支）。
- 不做开机自启 / systemd service。

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

- [ ] AC-001：`omni_panel --cli serve --port <n>` 命令在打印服务地址（含 URL/端口）后**立即返回**（不阻塞终端），服务在后台继续运行；`curl /v1/health` 可访问。
- [ ] AC-002：后台运行时 stdout/stderr 写入 `~/.config/OmniPanel/logs/` 下（应用日志或 serve 启动日志），不依赖原终端存活；终端关闭后服务不退出。
- [ ] AC-003：`omni_panel --cli serve --foreground --port <n>`（或等价参数名）保持前台行为——输出 URL 后阻塞，Ctrl+C 停止。
- [ ] AC-004：后台实例可经 `omni_panel --cli quit --port <n>` 停止，health 随后不可达。
- [ ] AC-005：文档（docs/guides/cli-mode.md）更新后台/前台用法说明。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：shell 级验证——起后台 serve 断言命令返回且 health ok、`--foreground` 阻塞行为、quit 停止。需 release 产物存在（`pnpm make:linux` 或既有 artifacts）。

## 上下文区

- 来源：用户直接需求（2026-08-12：`omni_panel --cli serve` 应后台运行，除非显式前台参数）
- 现状：launcher `spawn(RELEASE_BIN, args, { stdio: "inherit" })` 前台阻塞；cli.json 已写 pid（quit 控制可复用）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 脚本级验证（.scratch/ 或手动）：起后台 serve → 断言命令返回、health 可达、进程 detached；`--foreground` → 断言阻塞；quit → 断言停止。文档同步。
- launcher 是纯 Node 脚本（.mjs），可加单测断言参数解析分支（后台/前台）——以最小改动为准。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：detached 后台进程的 stdio 重定向路径权限/存在性；重复起多个 serve 实例的端口冲突（已有 quit/port 机制兜底）。
- 回退：launcher 改动可回退；`--foreground` 保留旧行为路径。

### 依赖与约束

- 依赖 release 产物（artifacts/linux-unpacked/omni_panel）验证。
- 沿用现有 cli.json/quit 控制，不新增状态文件。

### Finalization 时更新的 blueprint

- 无
