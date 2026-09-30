---
tid: "t536"
slug: "flowercloud_login_exit_lifecycle"
title: "花云未登录场景下应用存活保障与退出入口定位"
status: "done"
branch: "t536_flowercloud_login_exit_lifecycle"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "289f1a8c39b70b663b56cb9b8dbfabce33c7bf89"
depends_on: ""
conflicts_with: ""
note: "来源: p269（应用退出部分）"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 门禁基线：worktree `pnpm install --prefer-offline` + `pnpm rebuild electron` + `gen-build-info`；基线 `pnpm test` 绿（4234 passed）。实施后 `pnpm check` 7 段全绿（typecheck/lint/format/deadcode/arch/schema/test，4248 passed），`pnpm build` 绿。
- AC-001：新增 `src/main/core/quit_source.ts` 漏斗（`QUIT_SOURCES` 12 处，与 spec 扫描表一一对应）；12 个出口全部改走 `request_app_quit` / `request_app_exit`（index.ts 8 处、application-menu.ts 1 处、cli_init.ts 1 处 + index 中 control/tray/will-quit/startup 组）。`before-quit` 关停行补 `exit_source`（首请求方，漏斗外 `untracked`）与同 `trace_id`；`request_app_exit` 先 `flushLogTransports()` 再 `app.exit()`（否则异步 file transport 来不及落盘）。eslint 加 `no-restricted-properties` 门禁（`src/**` 禁裸 `app.quit`/`app.exit`，漏斗文件豁免），已用探针文件验证规则会红。
- AC-001 落盘兜底（code review Round 1 f001 修复）：transport 不可用的出口——日志初始化前（cli.help/export/control、单实例锁、初始化前启动失败）与 will-quit 清理 transport 后的 flush 重入——`persist_log_line` 用 `getCurrentLogFilePath`（core/logging 导出，与写路径同一命名约定）同步 `appendFileSync` 到同一活动日志文件；`logger.has_log_transports()` 判空。兜底失败仅 stderr 告警不阻塞退出。Round 2 追加：logLevel 过滤 info 也走兜底（`is_log_level_enabled`）；兜底路径改 `getDataRoot()`；一致性扫描扩拦裸调用。Round 3 追加：关停行走 `log_application_shutdown`（module=main，同样兜底）；architecture 别名形态口径改为 review 核对兜住。
- AC-002/003：行为面由 t535 收敛后本就隔离，本 task 补回归固定——`session-manager.test.ts` 新增三例（阻塞页预算耗尽 + 其它实例刷新继续、手动关窗/取消 + 该实例后续刷新可用、登录超时），断言登记释放 + 退出 API 零调用（electron `app.quit/exit` spy + `get_quit_requests()` 双通道）。
- AC-004：把 index.ts `browser-window-focus` 处理器整体抽出为 `handle_browser_window_focus`（main-panel-controller.ts，托盘收起 + 主面板判定一次到位），index 只留接线；`main_panel_controller.test.ts` 新增 6 例组合（popup 收起/floating 常驻/钉住豁免/焦点在面板/已销毁/托盘焦点），断言只 hide 不销毁、退出 API 零调用。
- 旧测试处置：删除 `tray_menu.test.ts` 的「p258: popup outside-focus auto-hide is wired...」源文本断言（理由写在该文件删除处：字符串绑定 index.ts 内联实现，委托抽取后必然失效，语义已由 p258 纯函数组 + t536 AC-004 行为组覆盖）；未就地改写任何旧断言。
- 黑盒：`pnpm test` 全绿；真实运行实测 AC-001——隔离 `serve --user-data-dir .scratch/t536_blackbox/data --port 18999 --foreground` + 瘦客户端 `quit --port 18999`，日志出现 `Exit requested: source=control-api.quit` 与 `Application shutting down` 携带同一 `trace_id=66b31f3c-...` 且进程退出。headless electron e2e：`cli_control.spec.ts` 7 passed（control-api quit/restart 真实链路经漏斗无回归）；全量 18 failed 已用 `git stash` 基线对照确认为预存失败（见 d064），非本 task 回归。
- 文档：`architecture.md` §3 退出来源可追溯 + 焦点收起约定；`testing.md` 新增「应用退出与会话生命周期（t536）」；新增需求级 spec `docs/specs/app_quit_lifecycle.md` 并登记 `specs_index.md`；新增 finding `d064`（electron e2e headless 预存失败基线）。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-30T01:26:58+08:00)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t536_code_f001|important|已修|transport 不可用的出口（初始化前早期出口 + will-quit 清理后 flush 重入）改为同步 appendFileSync 落盘同一活动日志文件，12 处出口来源行均可查；spec/architecture 口径同步|src/main/core/quit_source.ts persist_without_transport；src/main/core/logging.ts getCurrentLogFilePath；src/shared/lib/logger.ts has_log_transports|
|t536_test_f001|minor|已修|兜底落盘后 spec/blueprint 口径与 AC-001 一致，测试固化落盘行为|docs/specs/app_quit_lifecycle.md；docs/blueprint/architecture.md §3；tests/unit/main/quit_source.test.ts|
|t536_test_f002|minor|已修|补 get_shutdown_log_meta 单测（关停行 exit_source/trace 关联 + untracked）与 QUIT_SOURCES↔src 调用点一致性扫描测试|src/main/core/quit_source.ts get_shutdown_log_meta；src/main/index.ts before-quit；tests/unit/main/quit_source.test.ts|
|t536_test_f003|minor|已修|index 接线哨兵恢复：断言 index 源含委托入口 handle_browser_window_focus（组合行为仍由行为测试固定）|tests/unit/main/tray_menu.test.ts|
|t536_test_f004|minor|已修|flower-1 阻塞页预算 600→2000ms，与 flower-2 完成耗时解耦，防慢机时序误报|tests/unit/session/session-manager.test.ts|

### Round 2 (2026-09-30T04:41:27+08:00)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t536_code_f002|minor|已修|logLevel 高于 info 时 `is_log_level_enabled("info")` 为假走同步兜底，来源行不被级别过滤吞掉；单测 setLogLevel("error") 下断言落盘|src/main/core/quit_source.ts record；src/shared/lib/logger.ts is_log_level_enabled；tests/unit/main/quit_source.test.ts|
|t536_code_f003|minor|已修|一致性扫描扩展拦截裸 `app.quit()`/`app.exit(`（剥注释行后仍命中即红）；architecture 门禁口径改为「eslint + 一致性扫描 + review」，不再断言 lint 单道绝对拦截|tests/unit/main/quit_source.test.ts；docs/blueprint/architecture.md §3|
|t536_code_f004|minor|已修|兜底改用 `paths.getDataRoot()`（自带 try/catch 回退），与项目路径约定一致，getPath 抛错不再直接丢行|src/main/core/quit_source.ts persist_without_transport|
|t536_test_f005|minor|已修|补 index 关停行接线哨兵（`get_shutdown_log_meta`）与 cli_control e2e 真实运行断言（Exit requested + Application shutting down 同 trace，覆盖 will-quit flush-retry 兜底落盘）；调用点 source 语义经两轮 reviewer 逐一核实，静态测试无法判定语义、不作缺口|tests/unit/main/tray_menu.test.ts；tests/e2e/electron/cli_control.spec.ts|

### Round 3 (2026-09-30T06:20:23+08:00)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t536_code_f005|minor|已修|关停行收敛为 `log_application_shutdown`（module 保持 main），transport 缺失或 logLevel 过滤时同样同步兜底；补单测（setLogLevel error 下断言落盘、exit_source/同 trace）；接线哨兵随之改为 `log_application_shutdown`|src/main/core/quit_source.ts log_application_shutdown/persist_log_line；src/main/index.ts before-quit；tests/unit/main/quit_source.test.ts；tests/unit/main/tray_menu.test.ts|
|t536_code_f006|minor|已修|architecture/spec 门禁口径改实：两道静态门禁绑定 `app.` 标识符，别名形态（`electronApp.quit()`）静态不拦、由 code review 调用点核对兜住（t536 已逐一核实 12 处出口），不再声称扫描可拦别名|docs/blueprint/architecture.md §3；docs/specs/app_quit_lifecycle.md|

无 finding 时写“Round N 零 finding”。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 7 段全绿（typecheck / lint / format:check / deadcode / arch / schema:check / test），`pnpm test` 341 文件 4259 passed / 1 skipped（4260 tests）；`pnpm build` 绿
- 黑盒：默认 `pnpm test` 主链；真实运行实测 AC-001——隔离 `serve --user-data-dir <临时> --port 18999 --foreground` + 瘦客户端 `quit --port 18999`，日志 `Exit requested: source=control-api.quit` 与 `Application shutting down` 同 `trace_id` 且进程退出；headless electron e2e `cli_control.spec.ts` 7 passed（新增真实关停链同 trace 断言，覆盖 will-quit flush-retry 与关停行兜底路径）；electron headless 全量 18 failed 经 `git stash` 基线对照确认预存（d064），非本 task 回归
- review：full 级。`review_code.md`：Round 1 FAIL（f001 important）→ Round 2 PASS（f002-f004 minor）→ Round 3 PASS（f005/f006 minor）→ Round 4 PASS 零 finding；`review_test.md`：Round 1 PASS（f001-f004 minor）→ Round 2 PASS（f005 minor）→ Round 3 PASS 零 finding。`check_review_status`：overall=PASS、review_scope=ok、round=4；全部 11 条 finding 已修，无遗留 critical/important
- AC 证据：见 `handoff.json`

### 结果摘要

- AC-001~AC-004 全部满足；12 处退出出口单一漏斗 + 双静态门禁 + 三重落盘保障（transport / 同步兜底 / flush-before-exit）；花云会话异常隔离与焦点组合行为由集成测试固定
- 遗留：无（finding 全部已修；上线后回填项 3 条见 spec「上线后回填项」，非完成条件）
- 关联：p269 应用退出部分由本 task 闭环（p269 已在创建期归档）；新增 finding d064（electron e2e headless 预存失败基线）
