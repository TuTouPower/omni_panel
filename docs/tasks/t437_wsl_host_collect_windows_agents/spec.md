# Task spec

## 背景

会话 env 现为 `local` / `wsl`。`local` 表示「跟 OmniPanel 进程走」：Windows 上跑 = Windows 数据，WSL 上跑 = 只有 Linux home——与用户心智「win / wsl 两地盘」冲突，并导致 WSL 网页版搜不到 Windows Kimi（p204）。t308 曾把历史 `win` 迁成 `local`；本 task **逆转命名哲学**：废除 `local`，统一为地理/平台标签 `win` / `wsl` / `linux` / `mac`，迁移存量，删除仅服务 `local` 的死代码与过时注释。

## 契约区

### 范围

- `TokenStatsEnv`（及一切 IPC/schema/UI/dashboard platform 枚举消费方）改为 **`win` | `wsl` | `linux` | `mac`**；删除 `local`。
- 采集写入规则（按 **agent 数据所在平台**，不是「进程在哪」的模糊 local）：
    - Windows 用户目录下的 agent 数据 → `env=win`
    - 经 UNC 读到的 WSL home 数据 → `env=wsl`（现网 Windows 宿主行为保持）
    - 原生 Linux home（非 WSL 探测到的 Windows 侧）→ `env=linux`
    - macOS home → `env=mac`
- SQLite 存量迁移：把历史 `env='local'` / 残留 `env='win'`（若有）按可判定规则改写到新枚举；不可判定时的默认策略写进决策并单测覆盖。`user_version` 递增；逆转/删除 t308「win→local」迁移语义中与本命名冲突的死分支。
- collector 源 key/注释：`*_local` 等命名改为与平台一致（如 `kimi_win` / `kimi_linux` / …），删除只为兼容 `local` 而存在的死路径。
- UI：平台筛选从 `all|local|wsl` 改为含 `win|wsl|linux|mac`（展示文案中文可读）；会话卡片 env 展示同步。
- 全仓 TypeScript 中 `TokenStatsEnv` / session-history `Env` 的 `local` 字面量清零（连接器 observation 的 `source: "local"` 若属另一概念则不动，须在 AC/非范围区分）。

### 非范围

- **不**在本 task 实现「WSL 宿主自动发现并采集 Windows 目录」（→ t438）。本 task 只把枚举与存量、写入规则改对；WSL 上暂时仍可能只有 `linux`（POSIX home），要等到 t438 才出现 `win` 行来自 `/mnt/c/...`。
- 不改消息信封归一（t436）。
- 不改连接器账号 `source: "local"`（若存在）——那是 connector 数据源标签，不是 token-stats env。

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

- [ ] AC-001：`tokenStatsEnvSchema`（及导出类型）只允许 `win`/`wsl`/`linux`/`mac`；解析 `local` 失败或迁移层拒绝再写入 `local`。
- [ ] AC-002：打开含 `env='local'` 历史行的旧库时，迁移后这些行变为 `win`/`wsl`/`linux`/`mac` 之一，且 `query_sessions` 不再返回 `env=local`；行数与 token 合计不因迁移减少。
- [ ] AC-003：在模拟 host=windows 的采集中，写入 Windows home 下 kimi/claude/opencode/grok 会话的 `env` 均为 `win`；模拟 host=linux（非 WSL-windows 侧）写入 POSIX home 会话的 `env` 为 `linux`；模拟 host=macos 为 `mac`；现有 UNC wsl 源仍写 `env=wsl`。
- [ ] AC-004：dashboard / 会话库平台筛选不再出现 `local` 选项；出现 `win`/`wsl`/`linux`/`mac`（或产品等价中文标签），选 `win` 只列出 `env=win` 会话。
- [ ] AC-005：生产与测试代码中，面向 `TokenStatsEnv` / session-history 会话 env 的 `"local"` 字面量清零（允许测试里构造「迁移前旧库」的输入字符串，但不允许新写入路径产出 local）。
- [ ] AC-006：删除或改写 t308「win→local」迁移注释/死分支，使文档与代码不再声称「Windows 原生源叫 local」。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（schema 单测、store 迁移临时库、collector/paths 注入 host、UI 筛选单测、rg/knip 或定向单测断言无新写入 local）。

## 上下文区

- 来源：p204；用户裁定废除 `local`，统一 `win`/`wsl`，纯 Linux/mac 标 `linux`/`mac`（2026-08-23）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 全仓 markdown 历史文档里出现的旧词 `local` env：不强制改 archive；当前 blueprint/specs 在 finalization 更新。
- knip 对测试夹具字符串的误报：以「新写入路径」为准。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- store：临时 sqlite 写入 `env=local`（及旧 `win` 若需）→ open 迁移 → 断言新 env 与聚合。
- collector/paths：注入 host=windows/linux/macos，断言写出的 upsert.env。
- UI：platform 枚举与 filter 单测。
- 既有大量 `env: "local"` 测试改为对应平台值，禁止把断言改成「接受 local」。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 存量 `env=local` 行如何判定迁到 win vs linux vs mac（目录形态、path 前缀、缺失元数据默认）：`UNVERIFIED-SPIKE`，Step 1 抽样本机 `observations.sqlite` 定规则并写入 decisions。

### 风险与回退

- 风险：迁移误判导致会话串 env；外部脚本/网页若写死 `local` 会短暂不兼容。
- 回退：保留备份库；或 migration 可逆脚本（实施期提供）。

### 依赖与约束

- 破坏性升级：不留 `local` 兼容读写（除一次性迁移）。
- 为 t438 提供稳定的 `env=win` 语义。
- 无前置 task。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md` / `decisions.md` / `architecture.md`：env 四值表；废止「local=进程所在 OS」。
- `docs/specs/ai-cli-token-stats-*.md`、会话库 UI spec：平台筛选文案。
- `docs/specs_index.md`：挂 t437。
