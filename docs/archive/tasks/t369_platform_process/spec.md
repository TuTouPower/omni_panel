# Task spec

## 背景

平台/进程管理缺陷：(1) `package-and-run.ts` Linux 分支用 `pkill -f OmniPanel`，与产物名 `omni_panel`（小写）大小写不匹配，无法杀掉旧实例，single-instance lock 致新实例立即退出；(2) Linux 分支执行 Windows 命令串 `>nul`，在仓库根目录创建 `nul` 垃圾文件；(3) Linux 平台「关于」页显示 "Windows · x64"（`about_section.tsx` 用 `=== "darwin" ? "macOS" : "Windows"`）；(4) web shim 硬编码 `platform: "win32"`。

## 契约区

### 范围

- Linux 分支 `pkill/pgrep` 改用 `-i omni_panel` 或显式列小写名，与 exe 名同源。
- 按 platform 分别构造命令串（Linux 去 `>nul`，用 `sleep 1`/`pkill`）。
- about_section 按三平台映射（linux → "Linux"），arch 用 `process.arch` 或省略。
- web shim 用 `navigator.userAgent`/`navigator.platform` 推导映射到同一平台枚举。

### 非范围

- 不改打包流程本身。

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

- [ ] AC-001：Linux 下 `pnpm package:run` 能杀掉已运行的 omni_panel 实例（大小写匹配）。
- [ ] AC-002：Linux 运行 package-and-run 不再在根目录生成 `nul` 文件。
- [ ] AC-003：Linux「关于」页显示 "Linux" 而非 "Windows · x64"。
- [ ] AC-004：web 面板 platform 推导与真实宿主平台一致。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-003/004 可自动测试（组件/platform 映射单测）；AC-001/002 为脚本行为，[deploy] 人工验证（Linux 环境跑 package-and-run）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`package-and-run.ts:13`/`:51`/`:146`、`about_section.tsx:47`、`usageboard-web.ts:224`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- pkill/pgrep 真实进程行为不在单测覆盖，[deploy] 验证。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- about_section 单测断言三平台映射；web platform 推导单测断言 UA→枚举。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：pkill -i 可能误杀同名无关进程。
- 回退：显式列小写 `omni_panel` 名（与产物名同源），不用 -i 模糊匹配。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
