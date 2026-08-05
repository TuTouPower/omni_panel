# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

需求定稿 `docs/tasks/t211_session_history_window/requirements.md`（决策 5、6、15）。会话历史窗口要求只有被打开的会话才高频刷新，其余维持原 10 分钟轮询。本 task 在主进程建订阅 / watcher 服务与 `SESSION_HISTORY_*` IPC 通道组，为窗口（t211）与明细表入口（t212）提供后端。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 主进程会话历史订阅服务：注册订阅（source, env, session_id）→ 为该会话启动源文件监听；注销 → 停止监听并释放句柄。
- 监听策略（决策 5）：win 本地 JSONL 用 fs watch；opencode db 与 WSL 路径（kimi / grok）退化为 2s 轮询 mtime；另加 renderer 侧 5s 兜底拉取所需的查询通道。
- 变化处理：检测变化 → 调 t209 提取器做增量提取 → 向订阅方窗口推送增量消息。
- IPC 通道组（决策 15）：`SESSION_HISTORY_OPEN`（打开或聚焦历史窗口）、`SESSION_HISTORY_SUBSCRIBE`、`SESSION_HISTORY_UNSUBSCRIBE`、`SESSION_HISTORY_QUERY`（全量 / 分页拉取，含 5s 兜底）、推送事件 `SESSION_HISTORY_MESSAGES_UPDATED`。
- 历史窗口窗口配置与 singleton controller（参照 `create_agent_window_controller` 模式），route `history`。
- preload 暴露按 route 限制的会话历史 API 面。
- 查询支持分页（决策 17 后端部分）：按消息游标返回最近 N 条与更早分页。
- 最近会话查询通道：供「最近 6 条」按钮使用，返回按 ended_at 降序的会话定位（source, env, session_id, title, agent），复用现有 `getSessions` 单表查询，不做 dashboard 物化。

### 非范围

- renderer 窗口 UI、分栏、复制（t211）。
- 明细表 checkbox 列与打开按钮（t212）。
- 提取器本身（t209）。
- 不写任何会话源文件（硬约束：全程只读）；不改造 token-stats 采集进程。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 订阅后会话源文件被追加内容时，订阅方窗口在 watch 触发后收到 `SESSION_HISTORY_MESSAGES_UPDATED` 增量消息，且只含新增消息。
- [ ] WSL 路径与 opencode db 会话走 2s mtime 轮询，追加后同样推送增量。
- [ ] `SESSION_HISTORY_QUERY` 支持全量与按游标分页拉取，返回消息字段与 t209 统一模型一致。
- [ ] 注销订阅后不再推送，对应 watcher / 轮询句柄被释放（无泄漏）。
- [ ] 历史窗口关闭时全部订阅被注销。
- [ ] 全程只读：服务对会话源文件无任何写、删、移、加锁写操作。
- [ ] `SESSION_HISTORY_OPEN` 幂等：窗口未开则创建，已开则聚焦（singleton）。
- [ ] 最近会话查询通道返回按 ended_at 降序的会话列表，支持 limit（用于最近 6 条），含 source/env/session_id/title/agent。
- [ ] preload 的会话历史 API 仅对 route `history`（及需要的 agent route）暴露。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC「watcher / 轮询触发推送」「注销释放句柄」：主进程集成测试，临时目录模拟 transcript 追加。
- AC「窗口关闭注销全部订阅」「OPEN singleton」：需真实窗口环境，[deploy] 由 t213 手动验收，本 task 以服务层单测覆盖订阅表逻辑。
- AC「WSL 路径 resolve 与 wsl_user 自动探测」：UNC 路径无法在测试环境创建，自动探测生产可用性由 t213 真实 WSL 验收；本 task 覆盖显式配置分支与探测失败优雅返回 null。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- fs watch 在 WSL 9P 路径的不可靠性本身：已用轮询规避，不再测 watch 在 WSL 的行为。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 集成测试：临时目录写 JSONL fixture，启动订阅服务，追加内容，断言推送增量与游标。
- mock 边界：提取器用 t209 真实实现 + 小 fixture；不 mock IPC envelope，走真实 channel 注册。
- 断言目标：订阅表状态、增量去重、句柄释放、只读约束。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- `SESSION_HISTORY_OPEN` 跨 route 聚焦参数形态：已核实。参照 `TOKEN_STATS_OPEN`（`agent_window_controller.open_or_focus()` 无参 + handler 在 main/index.ts:939）。SESSION_HISTORY_OPEN handler 接 `(source, env, session_id)` → `history_window_controller.open_or_focus()` → 若窗口已存在，`win.webContents.send(SESSION_HISTORY_FOCUS, {source,env,session_id})` 让 renderer 定位到目标会话；首次创建则 renderer 启动时读初始定位参数。

### 风险与回退

- 风险：watcher 句柄泄漏（频繁开关窗口）。
- 回退：订阅表集中管理句柄，窗口 `closed` 统一清理；单测覆盖重复订阅 / 注销幂等。

### 依赖与约束

- 依赖 t209 提取器。
- 硬约束（需求定稿）：对会话源文件全程只读。
- token-stats 采集进程 10 分钟轮询不改动。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：会话历史订阅 / watcher 服务与 IPC 通道组条目。
