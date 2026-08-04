# Spike report

## 问题

t193 需要确定两项前置方案：

1. 独立查询执行上下文选型：Electron utilityProcess vs worker_threads，须满足「查询执行端异常退出不崩主进程、打包兼容、权限边界」。
2. WAL 数据库只读连接在写并发、关闭、锁释放上的一致行为（query worker 只读访问主进程正在写的库）。

## 成功判据

- 执行端方案能实现进程级崩溃隔离（AC3/AC5）且打包路径已在本项目可行。
- 只读连接打开 WAL 库读已提交数据、写提交后可见、写事务进行中不阻塞、关闭无锁残留、拒绝写入。

## 尝试

实验代码见 `code/wal_readonly_concurrency.ts`（better-sqlite3 + 真实 WAL 临时库，验证只读并发五条断言）。

执行端选型对比（推理 + 项目既有证据）：

| 维度               | worker_threads                                     | utilityProcess                                                                                               |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 隔离               | 同进程线程；native 崩溃（段错误）带崩整个 Electron | 独立 OS 进程；崩溃/异常退出不影响主进程                                                                      |
| 打包               | 无需额外产物（同模块）                             | collector 已用 `utilityProcess.fork` + `resolve_collector_path` 处理 asar unpacked（manager.ts），路径已验证 |
| better-sqlite3 ABI | 主进程模块，ABI 同                                 | 运行于 Electron → electron ABI，与主进程 store 相同（ensure_sqlite_abi electron 模式）                       |
| IPC                | 同进程 message 通道                                | postMessage/on('message')，需自建 request_id 关联                                                            |
| 权限边界           | 应用层                                             | 应用层（utilityProcess 与主进程同用户权限，非 OS 沙箱）                                                      |

## 证据

`code/wal_readonly_concurrency.ts` 输出（真实 WAL 库）：

```
readonly open reads committed: c=1
after write commit, new readonly connection sees: c=2
during uncommitted write txn, readonly sees committed count: c=2
readonly close/reopen x3: ok, no lock residue
readonly connection rejects write: true
```

- 只读连接可打开 WAL 库并读已提交数据；写连接提交新批次后新只读连接立即可见。
- 写事务未提交时只读连接读旧快照（WAL 快照隔离），不阻塞、不报锁。
- 只读连接关闭后立即重开无锁残留（Windows 异步释放句柄下验证通过）。
- `readonly: true` 连接写入被 SQLite 拒绝（权限边界生效）。

utilityProcess 打包兼容性：manager.ts 已 fork collector（`resolve_collector_path` 在 packaged 下把 `app.asar` 替换为 `app.asar.unpacked` 真实文件），证明 utilityProcess + 原生依赖资源路径方案在本项目可行；better-sqlite3 在 utilityProcess（Electron 运行时）加载 electron ABI 产物与主进程 store 一致，无额外 ABI 分支。

## 结论

1. **执行端选 utilityProcess**。它是唯一能保证「查询端异常退出不崩主进程」（AC3）且支持受控重启（AC5）的选项；worker_threads 线程 native 崩溃会带崩整个 Electron 进程，不满足 AC3。打包路径由 collector 先例背书。
2. **只读访问 WAL 库并发行为全部符合预期**：读提交数据、快照隔离、无锁残留、拒写。query worker 以 `readonly: true` 打开同一 `usage.db` 与主进程写连接并发安全。
3. **权限边界为应用层保证**：utilityProcess 与主进程同用户权限，非 OS 级沙箱。AC7「只读统计库、不读 secret」靠主进程只传 `db_path` + 查询参数实现，不向 worker 传递 vault/connector secret 或配置明文。此限制如实记录，不宣称 OS 沙箱。

## 是否采纳

- 决定：是
- 理由：utilityProcess 满足 AC3/AC5 崩溃隔离与受控恢复，打包路径有 collector 先例；WAL 只读并发实测安全；权限边界以代码纪律落地。
- 后续 task：t193
