# Task spec

## 背景

`omni_panel` 全局 CLI 无帮助命令：`omni_panel --help` 未拦截（透传给 Electron 无输出），`omni_panel --cli help` 报「未知的 --cli 子命令: help」。用户无法在终端查看用法。需补标准 CLI 帮助：顶层 `--help`/`-h` 打印全局用法，`--cli help` 打印子命令清单。

## 契约区

### 范围

- `scripts/omni_panel.mjs` launcher：拦截顶层 `--help` / `-h`，打印全局用法（serve 后台/前台、`--user-data-dir`、控制命令、`--cli quit` 停止），exit 0。
- `src/main/cli/args.ts`：`--cli help` 作为合法子命令，返回帮助语义（打印子命令清单 + 各子命令参数），exit 0。
- 未知子命令仍报错（`--cli foo` → 未知子命令错误，不改）。

### 非范围

- 不做逐子命令 `--cli <cmd> --help` 的详细参数帮助（当前帮助覆盖用法行即可，除非实现自然支持）。
- 不改 serve/控制命令行为。

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

- [ ] AC-001：`omni_panel --help` 与 `omni_panel -h` 打印全局用法（含 serve 后台/前台、`--user-data-dir`、`--cli quit` 停止、控制命令），exit 0，不启动服务。
- [ ] AC-002：`omni_panel --cli help` 打印 CLI 子命令清单（serve / open / refresh-all / pause / resume / restart / quit / autostart / export），exit 0。
- [ ] AC-003：未知子命令（如 `--cli foo`）仍报「未知的 --cli 子命令」错误，exit 非 0（行为不回归）。
- [ ] AC-004：`--help`/`--cli help` 不影响正常 serve/控制命令（无帮助参数时行为不变）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001：launcher 顶层 help 拦截，可 shell 级验证（`node scripts/omni_panel.mjs --help` 输出 + exit 0）。
- AC-002/003：args.ts `parse_cli_args` 单测（`--cli help` 返回 help 语义、未知子命令抛错）。
- AC-004：既有 args/session-ipc 测试回归。

## 上下文区

- 来源：用户反馈（2026-08-13：`--cli help` 报未知子命令，`--help` 无输出）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `tests/unit/main/cli/args.test.ts`：补 `--cli help` 解析、未知子命令保留。
- shell 级验证顶层 `--help`（launcher 拦截）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：`--help` 拦截与 Electron 参数冲突（launcher 只在无 `--cli` 且含 `--help` 时拦截，其余透传）。
- 回退：撤销 launcher/args 改动。

### 依赖与约束

- t322（serve 后台化，launcher `--foreground`/`--user-data-dir`）已合入 main。

### Finalization 时更新的 blueprint

- 无
