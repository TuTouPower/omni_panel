# Task spec

## 背景

collector 路径构建硬编码 Windows 宿主假设：`TokenStatsEnv` 枚举只有 `win|wsl`，`win_home: homedir()` 在 Linux/WSL 返回 POSIX home 后与反斜杠字面量拼接出坏路径，wsl 源 UNC 路径在 Linux 内不可达，`wsl_user` 探测失败静默返回空。结果 Linux/macOS/WSL 宿主全源采集 0 且无可见告警（p132，8.11 实测）。本 task 将 env 重构为 `local|wsl` 两档、路径解析抽成 `(host, env, cfg) -> path|null` 纯函数，平台假设从代码消失。

## 契约区

### 范围

- `TokenStatsEnv` 枚举 `win|wsl` → `local|wsl`，全局替换引用（store/collector/ipc/reader/类型）。
- 新增平台感知路径层纯函数（`src/main/core/token-stats/paths.ts`）：`(host, env, cfg) -> string | null`，`host` 由 `process.platform` 映射为 `windows|linux|macos`；`local` 源对任意宿主返回本机 POSIX/Windows 路径，`win`/`wsl` 源仅 `host === "windows"` 生成路径，其余返回 `null`。
- collector 现有 path builders（claude/opencode/kimi/grok）改走路径层；`homedir()` 只服务 `local` 源，`win_home` 语义改为仅 Windows 宿主本机。
- DB 迁移 v7：`token_stats_records`/`token_stats_sessions`/`token_stats_daily`/`token_stats_buckets`/`token_stats_hour_rollup` 的 `env='win'` 行迁移为 `env='local'`。
- 补 POSIX 路径、三平台 host、`wsl_user` 探测失败（返回 null）用例。

### 非范围

- collector 源清单声明式（hosts 数据化）与采集不可用源级可见性 → t309。
- session-history 系统（session-locator/subscription/path-index）共用路径层 → t310。
- CLI 进程存活期采集能力（本次仅路径层纯函数化供 CLI 复用）。
- 采集状态在面板 UI 的源级展示（t309 覆盖）。

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

- [ ] AC-001：非 Windows 宿主（`host ∈ {linux, macos}`）下，`local` 源返回基于 `homedir()` 的 POSIX 路径（如 `~/.claude/projects`、`~/.local/share/opencode/opencode.db`、`~/.kimi-code/sessions`、`~/.grok/sessions`）；`wsl` 源返回 `null`。
- [ ] AC-002：Windows 宿主下，`local` 源返回基于 `win_home` 的路径，`wsl` 源返回 `\\wsl.localhost\{wsl_distro}\home\{wsl_user}\...` UNC 路径。
- [ ] AC-003：`wsl_user` 探测失败（返回空串）且宿主为 Windows 时，`wsl` 源返回 `null`，不构造缺用户名的 UNC 路径。
- [ ] AC-004：`TokenStatsEnv` 在类型与运行时 schema 上只含 `local|wsl` 两值，`win` 值不存在；collector/ipc/reader 无残留 `"win"` 字面量。
- [ ] AC-005：对含 `env='win'` 历史数据的数据库执行迁移后，`token_stats_records`/`token_stats_sessions`/`token_stats_daily`/`token_stats_buckets`/`token_stats_hour_rollup` 中 `env='win'` 行全部变为 `env='local'`，行数（按 source/env 去重后的总量）不减少。
- [ ] AC-006：迁移后按 `env='local'` 查询返回迁移前 `env='win'` 的全部数据（records/daily 聚合值一致）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试。AC-001/002/003 用注入 `host`/`homedir`/`win_home` 的路径层纯函数单测覆盖三平台；AC-004 用类型 + schema 运行时断言；AC-005/006 用临时 SQLite fixture 跑迁移后断言行数与聚合值。

## 上下文区

- 来源：p132（2026-08-11 核实：本机 `~/.claude/projects`、`~/.kimi-code/sessions`、`~/.grok/sessions` 有 8-11 用量 jsonl，DB records 最新到 2026-08-09 05:36，其后采集持续 0）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实 Electron `homedir()` 运行时取值：单测环境固定为测试进程 home，跨平台由路径层注入 `host` 模拟，真实平台行为属部署验证，不写单测。
- 真实 WSL `\\wsl.localhost` UNC 可读性：Windows 宿主 + 真 WSL 才能验证，agent 环境不可达，标 `[deploy]` 前不自动测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 路径层纯函数单测：注入 `host`（windows/linux/macos）+ `homedir`/`win_home`/`wsl_distro`/`wsl_user`，断言返回路径或 `null`；零 mock 依赖文件系统。
- 迁移测试：临时 SQLite fixture 灌 `env='win'` 行，跑 v7 迁移，断言 env 改写与行数/聚合值不变。
- collector 集成：注入 POSIX `win_home`（测试家目录）断言 local 源读到测试 jsonl，替代现有 `C:\Users\Test` mock 的 Windows-only 假设。
- 全仓 `"win"` 残留断言：grep 校验 collector/ipc/reader 无 `env === "win"` 字面量。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- `process.platform` 在 Windows 上的实际取值与 `path.join` 分隔符行为：`UNVERIFIED-SPIKE`，执行期用注入 host 单测等价覆盖，Windows 真机行为留 `[deploy]` 人工验证。

### 风险与回退

- 风险：迁移 SQL 在含大表（records 数十万行）的库上执行时间；`env` 值改写后旧代码/缓存按 `win` 查询漏数据。
- 回退：迁移为幂等 UPDATE（`WHERE env='win'`），先备份 DB 文件；`env` 查询维度随枚举同步更新，全仓引用同一迁移后一致。

### 依赖与约束

- 无前置 task；`TokenStatsEnv` 变更被 t309/t310 依赖，先于两者合入。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：§3 采集能力/§3.2 grok 仅 WSL 的 env 表述（win→local）。
- `docs/blueprint/architecture.md`：§5 source/env 枚举、token-stats 目录树路径层说明。
- `docs/blueprint/decisions.md`：新增平台感知路径决策（host×env 分离，homedir 仅服务 local）。
