# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

OmniPanel token-stats 已统计 Claude Code / OpenCode / Kimi Code（win+wsl）的 token 消耗。用户还使用 Grok CLI（仅在 WSL，Windows 无 grok 数据），希望把 Grok 的 token 消耗纳入统计。Grok CLI 的会话数据在 WSL 的 `~/.grok/sessions` 下，`updates.jsonl` 的 `turn_completed` 事件带逐轮完整 token 用量，可走现有 token-stats 采集管线入库。

参考项目 cc-switch 已实现等价采集（`src-tauri/src/services/session_usage_grokbuild.rs`），其事件口径注释（2026-07-23 实测 + CLI 二进制逆向双重确证）可作本 task 依据，见上下文区「参考与数据来源」。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 新增 token-stats 数据源 `grok`：`tokenStatsSourceSchema` 与 records `agent` 枚举扩展。
- 新增 grok reader：扫描 WSL `~/.grok/sessions` 下各会话 `updates.jsonl`，解析 `turn_completed` 事件，产出与现有 claude/opencode/kimi 同构的 sessions/daily/records upsert。
- collector 接线新 source（仅 `wsl` env，受 `wsl_enabled` 门控），增量扫描状态进入现有 scan-state 持久化。
- 数据入库：token-stats 三表（sessions/daily/records）出现 `source=grok` 的行。

### 非范围

- 前端面板展示与 source/agent 筛选（见依赖 task t198）。
- Grok 额度/余额连接器（已有 `connectors/grok`，billing 百分比，与本 task 无关）。
- Windows 环境 grok 采集（Win 无 grok CLI 数据；仅 WSL）。
- 代理接管态双算守卫（cc-switch 因代理接管需守卫；OmniPanel token-stats 采集无此场景）。
- `costUsdTicks` 成本入账（token-stats 现有模型只记 token 分量，不记成本）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：token-stats store 可正常写入与查询 `source=grok` 的 sessions/daily/records 行，无约束或类型错误。
- [ ] AC2：给定一组 `updates.jsonl` fixture（结构取自真实 WSL 数据，见上下文区「参考与数据来源」样本），collector 收集后三表出现对应 grok 行；`turn_completed` 事件的 input/output/cache_read token 分量正确映射，reasoning 计入 output 不单独记账。
- [ ] AC3：增量采集不重复计数：重复 collect 时已处理过的 `turn_completed` 事件不重复入库，新增事件正常追加。
- [ ] AC4：grok 增量扫描状态随现有 scan-state 保存/恢复；进程重启后从上次位置续扫，不整量重扫。
- [ ] AC5：grok 目录或 `updates.jsonl` 缺失/不可读时，该 source 静默跳过并 warn 日志，不阻断其它 source 采集。
- [ ] AC6：grok 采集产生的 records 行 `agent` 值为新扩展的 grok 值，与 `source=grok` 一致。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1：可自动测试（store 集成测试写读 grok 行）。
- AC2：可自动测试（reader/collector 单测 + 集成用临时目录 fixture）。
- AC3：可自动测试（同一 fixture 两次 collect 断言幂等）。
- AC4：可自动测试（scan-state 序列化 round-trip + 续扫）。
- AC5：可自动测试（缺失路径容错用例）。
- AC6：可自动测试（records 行断言 agent 值）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 参考与数据来源

- **参考项目**：cc-switch（github.com/farion1231/cc-switch）`src-tauri/src/services/session_usage_grokbuild.rs`——Grok CLI 会话用量追踪，事件口径注释经 2026-07-23 单进程双 prompt 实测 + CLI 二进制逆向双重确证。
- **数据位置**（WSL 内 `~/.grok/`，Windows 侧 UNC 可读，Electron 原生路径）：
  `\\wsl.localhost\{wsl_distro}\home\{wsl_user}\.grok\sessions\{enc_cwd}\{session_id}\updates.jsonl`
    - `{enc_cwd}` 是 URL-encoded 的 cwd（实测如 `%2Fhome%2Ftestuser%2Fgithub_repo`）。
    - 每个会话一个 `updates.jsonl`，session_id 形如 `019f60f4-0984-7430-8e6e-15d579c7d369`。
    - 实测本机 `~/.grok/` 下无 `archived_sessions` 目录（会话是否归档随 CLI 版本/使用方式，执行期核实）。
- **事件形态**（实测样本，`updates.jsonl` 内 `turn_completed` 事件）：
    ```
    {"timestamp":...,"method":"_x.ai/session/update","params":{"update":{"sessionUpdate":"turn_completed",
     "prompt_id":"...","stop_reason":"end_turn",
     "usage":{"inputTokens":259870,"outputTokens":7867,"totalTokens":267737,"cachedReadTokens":215936,
     "reasoningTokens":5806,"modelCalls":9,"apiDurationMs":116201,"costUsdTicks":1998508000,
     "modelUsage":{"grok-4.5-build":{"inputTokens":259870,"outputTokens":7867,"totalTokens":267737,
     "cachedReadTokens":215936,"reasoningTokens":5806,"modelCalls":9,"apiDurationMs":116201,
     "costUsdTicks":1998508000}},"numTurns":9}}}}
    ```
- **事件口径**（cc-switch 确证，本 task 沿用）：
    - `turn_completed` 的 usage 是【该 user prompt 一轮的独立总量】：轮内跨 inference loop 累加（`modelCalls`/`numTurns` = 本轮 loop 数），下一轮从零起算。不是进程或会话累计。**勿用相邻事件差分**——那是把每轮总量误当累计快照，会把第二轮记成两轮之差造成巨量漏记。
    - `reasoningTokens` ⊂ `outputTokens`（`totalTokens` = input + output），不计费；output 直接映射即可，reasoning 不单独记账。
    - `costUsdTicks`（1 tick = 1e-10 USD）是 CLI 自报本轮成本；本 task 不入账成本，仅作上下文。若后续要记成本，自报优先（cc-switch 语义）。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 真实 WSL grok 端到端（CI 无 WSL grok 环境；解析逻辑用 fixture 覆盖）：不测。
- 代理接管态双算守卫：OmniPanel token-stats 无接管场景：不测。
- 多会话目录深度遍历的路径格式细节随真实目录差异：fixture 按实测结构覆盖单层与嵌套。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- reader 解析函数单测：updates.jsonl fixture（结构同「参考与数据来源」样本），断言 sessions/daily/records 映射、增量游标、幂等。
- collector 集成测试：临时目录布局模拟 `~/.grok/sessions/{enc_cwd}/{session_id}/updates.jsonl`，走现有 scan-state 机制，断言入库与续扫。
- 参考现有 kimi-reader / claude-reader 的测试组织方式。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- `updates.jsonl` 事件字段随 Grok CLI 版本变化（新版本可能增删字段或改事件名）：`UNVERIFIED-SPIKE`，执行期 Step 1 用真实 WSL 数据核对当前字段集。
- 本机是否存在 `archived_sessions` 及 `~/.grok` 下其它会话存放位置：`UNVERIFIED-SPIKE`，执行期核实目录清单与扫描范围。
- `turn_completed` 的 `totalTokens == input + output` 是否恒成立：`UNVERIFIED-SPIKE`，用真实样本核对（cc-switch 已确证，独立复核一次）。
- Windows 侧 Electron 进程经 `\\wsl.localhost\...` UNC 读 `~/.grok` 的实际可用性：`UNVERIFIED-SPIKE`，执行期用现有 token-stats WSL 读取链路验证同路径可达性。

### 风险与回退

- 风险：Grok CLI 更新导致 `updates.jsonl` 结构变化，解析失败。回退：单文件错误隔离（warn + 跳过该文件，不阻断其它 source）；结构变更经 Step 1 实验后再适配。
- 风险：误把 `turn_completed` 当累计快照做相邻差分，造成第二轮起巨量漏记。回退：逐事件按面值入账（cc-switch 教训），增量靠事件行去重游标而非差分。
- 回退：grok source 的 scan-state 置空重扫即恢复。

### 依赖与约束

- 数据仅 WSL：受现有 `wsl_enabled` / `wsl_distro` / `wsl_user` 配置门控，采集路径与现有 claude/opencode/kimi WSL source 一致（UNC `\\wsl.localhost\...`）。
- store 表 source/env 列为 TEXT 无 CHECK 约束，加新 source 无需 DB 迁移（执行期复核 INIT_SQL 确认）。
- 参考 cc-switch `session_usage_grokbuild.rs` 的事件口径（上下文区）；`grok` 的 records `agent` 值沿用 kebab-case 约定。
- t198（面板展示）依赖本 task 的 source/agent 枚举值。

### Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：新增 token-stats `grok` source 记录（数据位置、事件口径、agent 值约定）。
- `docs/blueprint/architecture.md`：token-stats 采集管线 source 列表若为权威枚举处，同步补充。
