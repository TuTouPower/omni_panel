# Task spec

## 背景

生产环境下配置了 Codex 账号（如 `codex-user@example.com`）后，应用刷新该连接器时在 2ms 内直接报 `failed: connector returned no observations`。排查证实根因是 `src/main/core/connector/net-client.ts` 中的本地路径白名单比对函数 `is_within_allowed` 未展开以 `~` 开头的白名单路径（如 `manifest.local.paths: ["~/.codex/auth.json", "~/.codex/sessions", ...]`），导致 Node.js `path.resolve` 将其解析为当前工作目录下的相对路径，从而拒绝访问合法的 `~/.codex/auth.json` 并抛出 `Local file path is not allowed`；且连接器内部空 catch 吞掉了异常未打日志，掩盖了路径沙箱拒绝。同类位点还包括 `manifest.local.paths` 使用 `~` 的 Claude、Antigravity 连接器，以及 `files.list` 未先 `resolve` 再比对路径的不对称缺陷。

## 契约区

### 范围

- `src/main/core/connector/net-client.ts`：
    - `expand_home` 补齐 `~\\`（Windows 反斜杠前缀）与裸 `~` 支持，保持仅展开当前用户家目录（不展开 `~otheruser`）；
    - 抽取并统一规范化管道 `canonical_path(p) = normalize(resolve(expand_home(p)))`，`is_within_allowed(path, allowed)` 对待检路径与白名单各 root 项双边统一使用规范化管道进行比对；
    - `files.list` 的 `dir_pattern` 先经 `resolve(expand_home(dir_pattern))` 规范化后再执行白名单检查，且传递给底层扫描的必须是同一规范化绝对路径，与 `files.read` 保持对称；
    - 保留并确认 `files.read` 现有 `lstat` + `realpath` 针对 symlink 的二次校验，在规范化展开后继续有效防御符号链接逃逸。
- `connectors/codex/connector.ts` 与 `connectors/claude/connector.ts`：
    - 针对白名单拒绝、文件未找到或其它 IO 失败（codex `collect_quota:108-113`、`collect_sessions:249-251,260-262`，claude `main:45-55`），捕获后必须调用 `ctx.log.warn` 记录包含目标路径与 `String(err)` 的警告日志；
    - 对纯语法/数据解析异常（如 `JSON.parse`）可降级为 `ctx.log.debug`；
    - 日志中严禁输出被读取文件的敏感正文或明文 Token。
- 补全测试：
    - `tests/integration/connector/net-client.test.ts` 增加覆盖 `~/`、`~\\`（平台条件化）、裸 `~` 及相对路径的单测与集成测试用例，断言能成功展开并读取；超出白名单或 `..` 越权以及指向白名单外的 symlink 均严格拒绝；
    - 测试必须通过 mock `os.homedir`（如 `vi.spyOn(os, "homedir")`）在独立隔离目录中进行，禁止直接访问或修改开发者真实的 `~` 目录；
    - 测试断言连接器在文件 IO 失败时调用了 `ctx.log.warn` 并携带错误与路径信息。

### 非范围

- 不展开 `~username/` 等 POSIX 其他用户家目录（此类路径统一按相对路径处理并被沙箱拒绝）。
- 不修改 Codex 远程配额 API 的请求逻辑与数据结构。
- 不修改 Claude / Antigravity 连接器的业务解析逻辑。
- 不放宽安全沙箱白名单机制（依然严格只允许访问 manifest 明确声明的路径）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：当 `manifest.local.paths` 包含以 `~` 裸值、`~/` 或 `~\\` 开头的路径时，`ctx.files.read` 与 `ctx.files.list` 能正确将其展开为当前用户的绝对家目录路径进行白名单比对，不再因波浪号未展开而抛出 `Local file path is not allowed` / `Local directory is not allowed`。
- [ ] AC-002：`ctx.files.list` 在进行白名单检查时先对展开后的目录路径做绝对路径解析（`resolve`），且传入扫描目录与白名单校验的路径为同一规范化绝对路径，与 `ctx.files.read` 保持严格一致。
- [ ] AC-003：在 Codex（`collect_quota`、`collect_sessions`）与 Claude 连接器中，当 `ctx.files.read` 或 `ctx.files.list` 抛错（白名单拒绝或 IO 异常）时，必须统一调用 `ctx.log.warn` 输出包含目标文件路径与错误摘要（`String(err)`）的警告日志，且严禁记录文件正文内容。
- [ ] AC-004：自动化测试中覆盖以 `~/` 开头的本地路径白名单展开校验，断言白名单内正常读取、白名单外、`..` 越权路径及跳出白名单的 symlink 严格拒绝；单测全程 mock `os.homedir` 不触碰开发者真实主目录；断言连接器在沙箱拒绝时的 `ctx.log.warn` 触发。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：p251（2026-09-18 核实：`net-client.ts` 的 `is_within_allowed` 未调用 `expand_home`，`.scratch/repro_full.ts` 复现白名单拦截，`.scratch/repro_fix.ts` 验证展开后 codex 用量采集成功；经 OpenCode Muse-Spark-1.3 独立审阅建议收紧 AC-001/003 与规范化对称性）。

### 有意不测

- 真实连接远端 chatgpt.com API 的网络请求：已有 mock 测试覆盖数据解析，真实网络测试走已有契约测试规范，不引入外部网络不稳定因素。
- Linux 大小写敏感文件系统下的边缘别名混淆：按现有路径归一化统一处理。

### 测试策略

- 在 `tests/integration/connector/net-client.test.ts` 中新增以 `~` 为前缀配置 manifest 的单测与集成测，通过 `vi.spyOn(os, "homedir")` 指向安全临时目录验证展开与访问控制矩阵。
- 对 Codex / Claude 的文件读取失败路径注入 fake context，断言 `ctx.log.warn` 被调用且入参包含路径与错误、且不含文件正文。
- 保持现有所有 `net-client.test.ts`、Codex / Claude / Antigravity 连接器测试全绿。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若 `expand_home` 传入非标准路径或空字符串时的边界情况；已有 `expand_home` 实现具备边界判断，改动范围集中。
- 回退：回滚 `net-client.ts` 与连接器错误日志改动。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
