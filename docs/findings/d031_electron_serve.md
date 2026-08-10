# d031 同一 Electron 二进制区分 serve 常驻与瘦客户端需跳单实例锁（2026-08-09）

- 来源：t276 SPIKE 2
- 结论：serve 与瘦客户端共享 userData 时单实例锁域一致；瘦客户端持锁会自锁（无法连接自身实例）。瘦客户端须在 `requestSingleInstanceLock` 前检测并跳过，whenReady 早期执行控制请求后 `app.exit`。
- 证据：t276 实跑——未跳锁时 refresh-all 卡死；跳锁后瘦客户端输出「refresh-all 已发送」exitCode 0（serve 持锁时仍能连）。
- 影响：CLI 控制子命令实现需在锁逻辑前判定瘦客户端形态。
- 现状：有效
