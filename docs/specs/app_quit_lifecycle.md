# 应用退出来源与会话生命周期隔离

验证方式：Desktop（真实 Electron 退出链路 + 主进程集成测试）。

## 退出来源可追溯（t536）

- 应用内全部显式退出入口（`app.quit()` / `app.exit()`，创建时 12 处）经 `src/main/core/quit_source.ts` 漏斗先写日志（`source` / `action` / `exit_code` / `trace_id`）再触发退出；同一进程退出序列共享一个 `trace_id`，`QUIT_SOURCES` 目录即入口清单（权威位置 `docs/blueprint/architecture.md` §3）。
- `before-quit` 的 `Application shutting down` 行（`log_application_shutdown`，module 保持 `main`）携带 `exit_source`（退出请求方 = 漏斗首请求；漏斗外触发标 `untracked`）与同一 `trace_id`，据此回答「谁请求了退出」；该行同样受 transport/级别兜底保护。
- `request_app_exit` 在 `app.exit()` 前 `flushLogTransports()`，保证来源记录与既有日志先落盘。transport 不可用或 info 被 logLevel 过滤时（日志初始化前的早期出口、will-quit 清理后的 flush 重入、`log_application_shutdown` 关停行）`persist_log_line` 同步追加到同一活动日志文件（`getCurrentLogFilePath` 命名约定与写路径一致），全部 12 处出口的来源行与关停行都可落盘；兜底失败只告警不阻塞退出。
- `src/` 内直接调用 `app.quit()` / `app.exit()` 被 eslint `no-restricted-properties` + 调用点一致性扫描双门禁拦截（别名形态由 code review 核对兜住）；新增退出出口必须登记 `QUIT_SOURCES` 并同步清单。

## 花云会话异常隔离（t536，承接 p269 应用退出部分）

- 未登录阻塞页等待预算耗尽、手动关闭/取消验证或登录窗、登录超时三种场景只结束对应花云实例：窗口关闭、`in_progress` 登记释放、退出 API 零调用；其它实例的快照刷新继续执行。
- 花云会话窗口获焦时主面板状态组合固定：popup 可见未钉住 → 收起（`hide`，不 close/destroy）；floating 常驻不收；pinToTop 钉住豁免；焦点在面板自身不收。全程不触发应用退出、窗口销毁不失控。
- 端到端进程存活、托盘可用、主面板重新唤起属人工观察项（见 t536 spec「上线后回填项」），不由本 spec 的自动化用例断言。

## 上线后回填（不属于本 spec 完成条件）

真实退出请求来源定位、花云未登录与退出的因果、进程存活端到端观察——路径见 t536 task spec（`docs/archive/tasks/` 或 `docs/tasks/` 下 `t536_flowercloud_login_exit_lifecycle/spec.md`）「上线后回填项」。
