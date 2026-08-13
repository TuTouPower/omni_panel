# Task review t355（reviewer_focus: 通用）

- task：`t355_local_api_robustness`
- spec：`docs/tasks/t355_local_api_robustness/spec.md`
- diff_anchor：`1145034f1f5594655f3ec7c6ee27eb991db49846`
- target：`git diff 1145034f1f5594655f3ec7c6ee27eb991db49846`
- round：1
- reviewed_at：2026-08-14 01:00 UTC+8

## Findings

无 blocking / important / minor finding。

逐项核查过程记录（候选问题均验证后排除）：

1. **AC-001 resume 时机与流式数据混淆**（`src/main/core/local-api/server.ts:195-201`）：超限时 `too_large=true` 置位后 `req.pause(); req.resume();` 同一 tick 执行，等效「继续读但丢弃」——data handler 因 `too_large` 直接 return，剩余 body 被 Node 消费丢弃，keep-alive 连接复用。Node HTTP parser 按 content-length 定界，剩余数据不会误入下一请求。测试（`server.test.ts:192-242`）用单 socket keepAlive agent 先 413 再第二请求 200，5s race 兜底防挂死，触达可观察行为，能区分「resume vs 悬死」。验证通过。

2. **AC-002 并发竞态**（`server.ts:581-606`）：`previous_sub` 检查 → `ctx.subs.set` → `deps.service.subscribe` 之间无 await（`resolve_session_file` 为同步函数，`session-locator.ts:447` 返回非 Promise）。同步块原子性保证并发同 id subscribe 时后完成 `read_json_body` 者必能看到先完成者已 set，正确 unsubscribe 旧 loc，不存在双读 null 的泄漏窗口。unsubscribe 参数顺序（source/env/session_id/subscriber_id）与既有路径 `server.ts:628`、SSE cleanup `server.ts:1681` 一致；测试 `server.test.ts:2138-2195` 用真实 SSE 连接 + mock service 断言 unsubscribe 调用 1 次、参数精确、subscribe 2 次。SSE 断开 cleanup（`server.ts:1666-1688`）经 `sse_cleanup_should_unsubscribe` 校验当前映射，重复 subscribe 后断开注销的是最终 sub，无冲突。验证通过。

3. **AC-003 畸形编码**（`server.ts:693-699`）：`new URL` 对 pathname 中 `%zz` 容忍不抛，`decodeURIComponent(url.pathname)` 抛 URIError 被捕获回 400 后同步 return，不影响后续请求。测试 `/%zz` 断言 400 + error body，通过。

4. **AC-004 immutable 缓存头**（`server.ts:727-731`）：`file_path` 回退到 index.html 时走 `.html` 分支 no-cache；非 .html 分支 immutable。测试（`server.test.ts:1561-1571`）创建真实 app.js 断言缓存头精确匹配。非 .html 非哈希文件名（favicon.ico 等）被 immutable 缓存会导致更新不生效——spec 明确要求 immutable，且既有注释声明「assets use hashed filenames」（`server.ts:714-716`），该权衡属 spec 既定决策，可接受。

5. **headers-sent 防护**（`server.ts:1164-1167`）：`res.destroy()` 无 error 参数不 emit `error` 事件，无 unhandled 风险；socket 层 error 由 Node HTTP server 内部 listener 管理。JSON 响应路径 headersSent=false 时 500 正常。行为与 spec 范围第 3 条一致。

6. **AC-002 在非法新请求下的行为**：`previous_sub` 注销位于 resolve_session_file 404 / SSE 未连接 409 检查之后，新请求非法时提前 return 不注销旧订阅，符合语义。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：0 条
- 未进表的提示：
  - headers-sent 防护属 spec 范围第 3 条（非 AC），无对应直接测试；现有全局 catch 异常路径行为未被显式断言，属范围项可接受风险，与 spec 风险区声明一致。
  - `req.pause()` 后同 tick `req.resume()`，pause 实际无效（too_large 已置位），无功能影响，属风格冗余。
- 总体判断：4 条 AC 全部实现且测试触达可观察行为（4/4 通过），范围 5 条全部实现，无偏航、无 YAGNI，无未解决 blocking/important 问题。
- 系统性 follow-up：无

verdict: PASS
