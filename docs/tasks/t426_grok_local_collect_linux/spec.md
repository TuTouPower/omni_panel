# Task spec

## 背景

会话库列表来自 token-stats 采集写入的 `token_stats_sessions`，不直接扫盘。Grok 采集源仅声明 `grok_wsl`（`hosts: ["windows"]`），且 `grok_sessions_path` 写死 `env: "wsl"`——在 Linux/mac 宿主（含 WSL2 本机跑 OmniPanel）上永不采集 `~/.grok/sessions`。磁盘当日有 updates.jsonl，库内 max(ended_at) 停在旧日，会话库 grok 列表不全。根因与证据见 p192。

## 契约区

### 范围

- 为 token-stats collector 增加 **local 宿主** 的 grok 采集源（`env: local`，`hosts: LOCAL_HOSTS`）。
- `grok_sessions_path` 按 `src.env` 解析路径（与 kimi/claude 一致），local 解析到本机 `~/.grok/sessions`。
- 保留 Windows 宿主经 UNC 读 WSL 的 `grok_wsl` 行为（不删）。
- 单测覆盖：host=linux 时 source 清单含 local grok；path 非 null；fixture 扫描结果可进入 query_sessions / 会话行字段。
- 修订 blueprint/architecture 中「grok 仅 WSL 采集」表述，改为：Windows 上经 WSL UNC；Linux/mac 上 local `~/.grok`。

### 非范围

- 不改会话库 UI 分页/筛选/搜索语义（仅让数据源在 linux 上补齐）。
- 不改 grok 消息提取器（chat_history / updates 解析逻辑）除非为挂 local 源所必需。
- 不改 Windows→WSL UNC 探测与 wsl_user 逻辑。
- 不强制用户清库/migration；旧 `env=wsl` 行可保留，新采集用 `env=local`（或与既有 store 键约定一致，实施期以 store 身份键为准并写在实施笔记）。

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

- [ ] AC-001：host=linux（或 mac）时，collector 源清单包含可调度的 local grok 源；对存在的 `~/.grok/sessions`（或测试注入等价路径）采集后，`query_sessions({ source: "grok" })` 包含磁盘上对应 session_id。
- [ ] AC-002：local 环境下 `grok_sessions_path` 解析为非 null 的本机 `…/.grok/sessions` 路径（不依赖 `\\wsl.localhost\…`）。
- [ ] AC-003：host=windows 时既有 `grok_wsl` 路径解析与源启用行为不回归（单测或等价契约断言）。
- [ ] AC-004：`docs/blueprint/architecture.md`（及 domain 若写「仅 WSL」）中 grok 采集宿主描述与实现一致。
- [ ] AC-005：相关单测通过；现有 token-stats / session 列表相关套件不红。
- [ ] AC-006：`[deploy]` 在 Linux 宿主真实 OmniPanel 上：采集一轮后会话库可见当日磁盘上存在的 grok 会话（对照 `~/.grok/sessions/**/updates.jsonl`）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001~005：可自动测试（paths 纯函数 + collector source 清单/读源 + store 或 mock 注入）。
- AC-006：需真实用户目录与运行中实例，标 `[deploy]`。

## 上下文区

- 来源：p192（2026-08-16 task-bug：磁盘当日 39 个 updates.jsonl，库 grok 当日 0，max ended_at=2026-08-08；collector 仅 grok_wsl@windows）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- Windows 真机 UNC 联调：无 Windows CI；AC-003 用路径层/源清单单测锁契约。
- 会话库 UI 像素：数据层断言足够；AC-006 人工。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- fixture：临时目录模拟 `…/.grok/sessions/<enc_cwd>/<sid>/updates.jsonl`（最小合法行）。
- 断言：source 清单含 local grok；path(local) 非 null；scan/read 产出 session_id 进入 store 或 read_source 结果。
- 回归：windows host 上 wsl grok 仍在 SOURCES 且 path 走 UNC 规则。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。根因与路径层行为已在 p192 用代码与 DB/磁盘对照核实。

### 风险与回退

- 风险：local 与 wsl 两 env 并存时 session 身份键重复/分叉；需按 store 主键 `(source,env,id)` 处理，避免双份 UI 行或互相覆盖。
- 回退：移除 grok_local 源定义，恢复仅 grok_wsl。

### 依赖与约束

- 无前置 task。会话库 UI 不阻塞本 task。
- 数据文件仍为 grok CLI 的 `updates.jsonl`（token-stats 采集口径），与 session-history 的 `chat_history.jsonl` 分工不变。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：grok 采集宿主（Windows WSL UNC + Linux/mac local）。
- 若 `domain.md` 写「仅 WSL」则同步修订。
