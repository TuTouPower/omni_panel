# p095 CLI 控制 restart e2e 泄漏 relaunch 进程（2026-08-09）

- 来源：t276 review Round 2 f005（minor）
- 现象：`tests/e2e/electron/cli_control.spec.ts` AC3 restart 测试，restart 端点 `app.relaunch()` 出的新进程无句柄回收，`finally` 只关原始句柄；跨 run 在 18811 堆积孤儿进程，EADDRINUSE 致 waitHealth 偶发失败。
- 影响：flaky 测试（非产品缺陷）；端口 18811 被孤儿进程占用。
- 根因：relaunch 脱离 playwright ElectronApplication 句柄，测试无法 close。
- 测试缺口：teardown 未回收 relaunch 新进程；无断言验证 18811 释放。
- 线索：2026-08-10 主仓实测（xvfb + E2E_HEADLESS）：restart 用例通过后，relaunch 新进程（监听 0.0.0.0:18811）连同 zygote/gpu/utility 子进程全部残留，`finally` 的 `closeServe` 只关原句柄，跨 run 占端口坐实。修复方向：AC3 teardown 读 `cli.json` 新 pid 后 `process.kill`（连带子进程组），或测试前置清理 18811 残留兜底。
- 处理：未开
