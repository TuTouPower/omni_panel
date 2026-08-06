# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

会话历史面板卡顿的根因之一在主进程查询路径：`subscription-service.ts` 的 `query()` 每次调用都 `extract_full` 全量读取并解析整个源文件（claude_code JSONL 可达几十 MB；opencode 为整个 SQLite 库），再在内存切片返回一页。该成本被四个调用方成倍放大：工作台 5s 兜底轮询（每个 ready 面板每 5s 一次全量 query）、向上翻页（每页一次）、会话库摘要懒加载（每卡片一次）、内容搜索（每次输入对全部候选会话串行各一次）。打开会话时 `subscribe()` 的初始 `extract_full` 与紧随的 query 又把同一文件解析两遍。此外 IPC 层每次 query 都重新执行 `resolve_session_file`：递归扫描目录收集全部 `.jsonl`（深度 4），慢路径逐文件读头 8KB；WSL 路径走 `\\wsl.localhost\` 9P 共享，目录遍历更慢。

同时，工作台的 5s 兜底轮询本身与订阅 watcher（2s mtime 轮询增量提取 + 推送）重复：兜底结果经 `merge_tail` 去重后通常零变化，8 个槽位全开时每 5s 触发 8 次全量文件解析，属纯浪费的 IPC 与主进程负载。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 订阅服务增加全量提取结果缓存：以源文件失效信号（mtime/大小变化）刷新；`query`、`subscribe` 初始提取命中缓存时不重复读盘解析。
- 会话文件定位结果缓存：(source, env, session_id) → file_path/extractor_kind 映射，重复 resolve 不重复目录扫描；源文件消失后缓存失效，按现状语义返回 not found。
- 缓存对调用方透明：分页游标语义、增量推送语义、not found 语义均不变。
- 工作台兜底刷新机制降级：全量 query 频率显著降低（间隔常量化并拉长），保留其作为订阅推送失效时的拉齐手段；订阅推送路径不变。

### 非范围

- 不改提取器的增量提取逻辑与 watcher 监听策略。
- 不改 `merge_tail` 去重逻辑与消息上屏语义。
- 不改渲染层其他代码与 IPC 通道结构。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [x] 源文件未变化时，同一会话连续多次 query（含分页与 limit 切片）只触发一次全量文件读取解析；第二次起由缓存供数，返回内容与不缓存时一致。
- [x] subscribe 后的首次 query 复用订阅建立时的提取结果，同一文件不被解析第二遍。
- [x] 源文件追加/变更后，下一次 query 返回包含新内容的结果（缓存按失效信号刷新）。
- [x] 同一定位的重复 resolve 不重复目录扫描；源文件删除后再 resolve/query 按现状语义返回 `SESSION_NOT_FOUND`。
- [x] 现有 session-history 相关测试套件保持通过：分页游标（追加型绝对下标）、增量推送、多订阅方路由行为不变。
- [x] 面板打开后，固定观测窗口（60s）内每个面板的兜底全量 query 次数 ≤ 2（原 5s 周期为 12 次）。
- [x] 活跃会话源文件追加后，新消息经订阅推送在秒级上屏，不依赖兜底周期。
- [x] 兜底仍周期性执行：注入一条订阅未推送的消息（模拟推送丢失），在兜底周期到达后被拉齐上屏。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：缓存相关 AC 用插桩（包装 `extract_full` / 目录扫描计数）与临时 fixture 断言；轮询相关 AC 用 fake timers + mock `window.usageboard.sessionHistory` 统计调用次数并模拟推送/拉齐。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 真实 WSL 9P 共享下的目录扫描耗时差异：环境相关，单元层以路径注入模拟，不测真实耗时。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 缓存：单元测试以临时目录 fixture JSONL / SQLite 文件 + 可控 mtime 构造命中/失效场景；插桩计数器断言 `extract_full` 与目录扫描次数；opencode 用临时 db fixture。
- 轮询：`WorkspaceView` 单测 fake timers 推进时间，统计 mock query 调用次数；模拟 `onMessagesUpdated` 推送断言上屏不经兜底；不推送仅兜底拉齐断言末条 AC。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：缓存失效信号漏判（mtime 与大小均不变但内容变化，极罕见）导致短暂返回陈旧消息；订阅 watcher 的增量推送会在下次变化时拉齐。
- 风险：缓存驻留放大主进程内存占用（每会话一份全量消息数组）；缓存以订阅/查询定位集合为界，面板关闭退订即释放。
- 风险：兜底间隔拉长后，推送丢失场景的上屏延迟从 5s 级变长；兜底保留周期执行，延迟有界。
- 回退：移除缓存层恢复每次全量提取与每次 resolve 扫描；恢复原 5s 间隔常量。

### 依赖与约束

- 无前置 task 依赖。
- 约束：提取器保持只读；缓存 key 含 source/env/session_id，不得跨会话定位串数据。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：会话历史查询路径的提取缓存与定位缓存条目。
