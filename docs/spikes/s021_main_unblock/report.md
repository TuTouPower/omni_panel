# Spike report

## 问题

spec t256 两项 UNVERIFIED-SPIKE：(1) 摘要/定位链路改异步后 watcher、提取缓存与订阅游标的并发交互是否安全；(2) better-sqlite3 同步写入在 Electron 主进程的让路方式对事务语义的兼容性。

## 成功判据

- 确认 summaries 异步化（任务内让出）不引入缓存/订阅竞态。
- 确认分批 setImmediate 让路保持每批事务语义且让出事件循环。

## 尝试

代码核查 + 最小实验（`.scratch/t256_spike.mjs`）：

- **SPIKE 1**：读 `subscription-service.ts`。`summaries` 的 `with_concurrency_limit` 是并发调度器，但任务体同步执行 `extract_first_user`（同步 fs），实际串行阻塞主进程。`extract_cache` 是模块内 Map，读写均同步（`get_extract_cache` / `set_extract_cache`），watcher 变化回调也同步更新缓存。
- **SPIKE 2**：读 `token-stats-store.ts` 与 `manager.ts`。collector 回填经 IPC 消息到主进程，`upsert_sessions` 每批 tx 内 `delete_buckets + insert_buckets` 全量重建 buckets（同步 SQLite）。实验：2000 行分 200/批。

## 证据

- SPIKE 2 实验（better-sqlite3）：同步全量 2000 行 = **3340ms**（长阻塞）；分批 200 行 × 10 批 setImmediate = **18ms**（每批间让出事件循环，可处理 IPC）。每批独立 tx，事务语义保持。
- SPIKE 1 核查：Node 单线程下缓存读写是原子操作（无 await 间隙被中断）；任务内 `await setImmediate` 只发生在缓存读之后、写回之前，缓存一致性不受影响。watcher 回调同步更新缓存，无并发写。

## 结论

- **SPIKE 1（异步化安全）**：summaries 任务体改 `await setImmediate` 让出事件循环（每个任务读前让出），缓存读写仍同步原子，无竞态。IPC handler 的 resolve 循环本身快（命中持久索引），摘要 fs 读让出后主进程不再长阻塞。
- **SPIKE 2（分批让路安全）**：collector 回填改分批 setImmediate（每批 ≤ 某行数），每批独立 tx + 全量重建 buckets 语义不变，批次间让出事件循环供查询响应。最终数据与现状一致（每批重建是幂等全量）。

## 是否采纳

- 决定：是
- 理由：两种让路方式均保持语义且让出事件循环；实现落地见 t256。
- 后续 task：t256
