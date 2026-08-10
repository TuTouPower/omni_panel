# d030 Electron app.relaunch() 在 CLI 模式保留原 argv（2026-08-09）

- 来源：t276 SPIKE 1
- 结论：`app.relaunch()` 重启的 Electron 进程保留原 argv（含 `--cli serve --port <n> --user-data-dir=<dir>`），新进程以相同参数重启并重写 cli.json（pid 更新、端口复用）。旧进程退出后新实例 health 恢复。
- 证据：t276 实跑——restart 后 cli.json pid 从 2079198 → 2080615，端口 18803 保持，health 200；旧 pid 进程消失。
- 影响：`restart` 控制端点可安全用 `app.relaunch()+app.quit()`；但 e2e 中 relaunch 出的新进程脱离 playwright 句柄，测试无法 close，跨 run 堆积孤儿进程（p095）。
- 现状：有效
