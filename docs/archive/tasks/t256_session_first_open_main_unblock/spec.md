# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

用户反馈会话面板/会话库首次打开仍卡。调查结论：首屏摘要与定位的文件 I/O 全部同步发生在主进程事件循环——`SESSION_HISTORY_SUMMARIES` handler 的 resolve 循环同步执行（`session-history-ipc.ts:319-335`），摘要「并发 5」包裹的是同步任务（`subscription-service.ts:675-688`），实际串行阻塞主进程；主进程一堵，所有窗口的所有 IPC（包括本应很快的 SQL 查询）全部排队。叠加启动期 collector 回填在主进程同步执行大批量 SQLite 写入（`manager.ts:106-110`，且每批 `upsert_sessions` 都 DELETE + 全量重建 buckets），与首屏查询竞争同一事件循环与 WAL 文件。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 会话摘要与文件定位的文件 I/O 不再同步阻塞主进程事件循环（异步化或移出主进程），执行期间其他 IPC 能即时响应。
- collector 启动期大批量 SQLite 写入不再与首屏查询互相长时间阻塞（让出事件循环或避开首屏热路径），写入结果与现状一致。
- 上述调整保持摘要、定位、统计数据的用户可见结果与现状一致。

### 非范围

- 不改变单会话消息列表的提取缓存与分页机制。
- 不改变 collector 的扫描范围、采集频率与数据内容（buckets 重建语义不变，仅调整执行时机/方式）。
- 不做渲染进程侧的首屏渲染优化。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：首屏摘要批量加载期间，主进程不被同步文件 I/O 长时间占满（测试中可断言：摘要/定位路径无同步 fs 调用，或加载期间并发其他 IPC 能及时返回）。
- [ ] AC2：collector 启动回填期间，面板查询请求能在可接受时间内返回，不因大批量写入整体卡死。
- [ ] AC3：摘要内容、会话定位结果、token 统计数字与现状一致，无功能回归。
- [ ] AC4：现有测试与 e2e 全部通过。
- [ ] [deploy] AC5：真实环境中首次打开会话面板/会话库不再出现整体卡顿的主观确认（agent 无法自证真实 WSL UNC 环境下的体感）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1：以「该路径无同步 fs 调用」的静态/单测断言 + 集成测试中并发 IPC 响应断言代替事件循环延迟测量。
- AC2：集成测试模拟回填批次写入期间发起查询，断言查询在阈值内返回。
- AC5：需真实环境人工确认，agent 无法自证。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 真实事件循环延迟数值（毫秒级 lag）：测试环境无可比基线；以同步调用消除与并发响应断言代替。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 异步化后的摘要/定位路径用 tmp fixture + 并发请求断言结果一致性与响应性。
- collector 写入让路：模拟多批回填，断言查询在批次交错中返回且最终数据一致。
- 既有会话历史与 token-stats 测试全量回归。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 摘要/定位链路改异步后 watcher、提取缓存（mtime+size 失效）与订阅游标的并发交互是否安全：已由 spike s021 读 `subscription-service.ts` 核实。`extract_cache` 是模块内 Map，读写均同步原子（Node 单线程无 await 间隙被中断）；watcher 回调同步更新缓存。任务内 `await setImmediate` 只发生在缓存读后写回前，缓存一致性不受影响。异步化安全。
- better-sqlite3 同步写入在 Electron 主进程的让路方式（分批 setImmediate / 移 utilityProcess）对现有事务语义的兼容性：已由 spike s021 实验核实。分批 setImmediate（每批独立 tx + 全量重建 buckets）保持事务语义且让出事件循环：2000 行同步全量 3340ms 长阻塞 vs 200/批 × 10 批 18ms。采用分批 setImmediate 让路。

### 风险与回退

- 风险：异步化引入竞态（同一会话并发定位/提取、缓存失效时机错误）；collector 写入延后导致启动初期统计数据短时滞后。
- 回退：单 commit revert；collector 写入语义不变，无数据兼容问题。

### 依赖与约束

- 依赖 t254、t255（定位与摘要读取量收敛后再调整执行位置，避免把昂贵操作搬进 worker 放大复杂度）；按 t254 → t255 → t256 顺序串行执行。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：会话首屏链路的主进程非阻塞约定（若 blueprint 已有会话历史章节则在其中补充）。
