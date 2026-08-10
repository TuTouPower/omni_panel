# d011 只读 SQLite 连接可并发读 WAL 库；utilityProcess 提供查询执行端崩溃隔离（2026-08-03）

- 来源：s009、t193
- 结论：better-sqlite3 `{ readonly: true }` 连接可打开写并发中的 WAL 库：读已提交数据、写提交后新只读连接立即可见、写事务未提交时读旧快照不阻塞、close/reopen 无锁残留、`readonly:true` 拒绝写入。Electron utilityProcess 是独立 OS 进程，native 崩溃/异常退出不影响主进程，且 `parentPort`/`postMessage` 打包路径有 collector 先例；worker_threads 同进程线程 native 崩溃会带崩整个 Electron。
- 证据：s009 `code/wal_readonly_concurrency.ts` 真实 WAL 临时库五条断言全部通过；t193 query worker 打包内（asarUnpack + electron ABI better-sqlite3）打开 readonly 连接完成 dashboard 查询（packaged smoke AC6）。
- 影响：重读类子任务（dashboard 聚合、报表导出）可迁入 utilityProcess readonly worker，主进程事件循环不被同步聚合阻塞；跨进程只读方案无需额外锁协调。utilityProcess 子进程比 worker_threads 多一层进程开销，适合低频重读、不适合高频小任务。
- 现状：有效
