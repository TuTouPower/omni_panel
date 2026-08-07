# 会话首屏主进程非阻塞

## 背景

会话面板/会话库首次打开仍卡：首屏摘要与定位的文件 I/O 全部同步阻塞主进程事件循环——`SESSION_HISTORY_SUMMARIES` handler 的 resolve 循环同步执行，摘要「并发 5」包裹的是同步任务（实际串行阻塞）；主进程一堵，所有窗口所有 IPC 排队。叠加启动期 collector 回填在主进程同步大批量 SQLite 写入（每批 DELETE + 全量重建 buckets），与首屏查询竞争同一事件循环与 WAL 文件。

## 范围

- 会话摘要与文件定位的文件 I/O 不再同步阻塞主进程事件循环（异步化或移出主进程），执行期间其他 IPC 能即时响应。
- collector 启动期大批量 SQLite 写入不再与首屏查询互相长时间阻塞（让出事件循环），写入结果与现状一致。
- 上述调整保持摘要、定位、统计数据的用户可见结果与现状一致。

## 非范围

- 不改变单会话消息列表的提取缓存与分页机制。
- 不改变 collector 的扫描范围、采集频率与数据内容（buckets 重建语义不变，仅调整执行时机/方式）。
- 不做渲染进程侧的首屏渲染优化。

## 验收标准

- [x] AC1：首屏摘要批量加载期间，主进程不被同步文件 I/O 长时间占满。
- [x] AC2：collector 启动回填期间，面板查询请求能在可接受时间内返回，不因大批量写入整体卡死。
- [x] AC3：摘要内容、会话定位结果、token 统计数字与现状一致，无功能回归。
- [x] AC4：现有测试与 e2e 全部通过。
- [x] [deploy] AC5：真实环境中首次打开会话面板/会话库不再出现整体卡顿的主观确认（agent 无法自证）。

## 实现要点

- `subscription-service.ts` `summaries`：每个任务读前 `await setImmediate` 让出事件循环。缓存读写仍同步原子（Node 单线程无竞态，spike s021 核实）。
- `manager.ts` `apply_batches`：collector update 按批 ≤2000 条处理，批次间 `setImmediate` 让出；循环边界取 sessions/daily/records 三数组最大长度（防 records 多于 sessions 时丢数据），每数组独立 slice；全部完成后触发 `on_update`。每批独立 tx + 全量重建 buckets 语义保持（幂等全量，最终数据与现状一致）。
- 让路方式选分批 setImmediate（spike s021 实验：2000 行同步 3340ms vs 分批 18ms）。

## 测试覆盖

- `tests/unit/main/core/token-stats/manager.test.ts`：分批让路（5000 条 → 3 批，flush 验证每批间隔 + on_update 延迟到全部完成）；records>sessions 不丢数据（5000 records → 3 批全写）；既有 stores session deltas 改 async flush 等待。
- `tests/unit/main/core/session-history/subscription-service.test.ts`：summaries 异步让出（spy extract_first_user，await Promise.resolve() 后仍 counter=0 证明宏任务让出）。
- `pnpm test` 全量 + `pnpm test:e2e:electron` + `pnpm test:packaged`。
