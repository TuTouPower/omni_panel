# Task spec

## 背景

CLI 帮助存在两个源头，输出不一致：launcher（`scripts/omni_panel.mjs`）的 `--help`/无参打印「OmniPanel CLI 用法」（含 `--gui`）；主进程（`src/main/index.ts` 的 `--cli help` 分支）打印「OmniPanel CLI 子命令」清单（不含 `--gui`）。`omni_panel help` 子命令转发到主进程，输出漏 `--gui`。目标：四个入口（无参 / `--help` / `help` / `--cli help`）输出**同一份**帮助，消除两处内联文本重复源。

## 契约区

### 范围

- 单一真相源帮助文本，launcher 与主进程共用。
- 四入口输出一致（含 `--gui` 用法、全部 CLI 子命令说明）。
- 删除 `src/main/index.ts` 内联帮助文本与 `scripts/omni_panel.mjs` 内联 HELP_TEXT，改为引用共享源。
- 补/改测试：共享帮助文本内容断言、四入口一致性。

### 非范围

- 不改 CLI 子命令语义（serve/quit 等行为不变）。
- 不改 `translate_launcher_args` 翻译逻辑（t399 已定）。
- 不改主进程 `--cli` 解析契约。

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

- [ ] AC-001：`omni_panel`（无参）、`omni_panel --help`、`omni_panel -h`、`omni_panel help` 四入口输出完全相同（逐字符）。
- [ ] AC-002：统一帮助包含 `--gui` 用法（`omni_panel --gui` 启动图形界面）与全部 CLI 子命令（serve/open/refresh-all/pause/resume/restart/quit/autostart/export）。
- [ ] AC-003：`omni_panel --cli help` 输出与 AC-001 四入口一致。
- [ ] AC-004：`omni_panel help` 与 `omni_panel --cli help` 不再进入主进程 `--cli help` 内联文本分支（该文本已删）。
- [ ] AC-005：release 打包产物（`pnpm make:linux`）中四入口输出同样一致（帮助文本随构建进产物）。`[deploy]`

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~004：可自动测试（共享帮助模块单测断言内容 + 四入口一致性；launcher 无产物时 help 路径可测）。
- AC-005：需打包后人工验证，`[deploy]`。

## 上下文区

- 来源：t399 遗留（help 文案四入口未统一）；用户 2026-08-16 需求。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 四入口 e2e 实测输出字节比对：launcher 层单测已覆盖文本一致性，e2e 跑真实二进制成本高；AC-001 以共享模块+单测间接证明。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 共享帮助模块纯函数/常量，单测断言：含 `--gui`、全部子命令、无内联重复。
- launcher 翻译测试：`help` 子命令 → 直接打印共享帮助（不再转发主进程），断言 mode/输出来源。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 跨进程共享方式：launcher（node 脚本 `.mjs`）与主进程（electron-vite bundle，打包 `files` 仅 `out/**`）如何共用帮助文本。两种候选：(A) 帮助源放 `scripts/cli_help.mjs`，主进程能否 import 进 bundle 未验证；(B) 帮助源放 `src/main/cli/help-text.ts`（TS，主进程原生可 import），launcher 侧需编译产物——不可行（launcher 运行时无 src）。候选 A 为 `UNVERIFIED-SPIKE`，task-work Step 1 需实验 electron-vite 外部 .mjs 打包行为。

### 风险与回退

- 风险：主进程无法 import scripts 外部 .mjs（打包排除）→ 退回：帮助源放 `src/` 共享、launcher 用构建期复制/软链方式获取，或接受 launcher 独立维护但以单测锁定一致性。
- 回退：恢复两处内联文本，放弃统一（不推荐，用户明确要统一）。

### 依赖与约束

- 依赖 t399（launcher 参数翻译已落地）。
- 主进程打包 `files` 仅 `out/**` + package.json，运行时无 scripts/、无 src/。
- launcher 是独立 node 脚本，运行时无 tsx 转译。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：CLI 帮助单一真相源位置与跨进程共享方式（长期约束）。
- `docs/guides/cli-mode.md`：帮助输出描述（若措辞变化）。
