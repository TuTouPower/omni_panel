# Task review t279（reviewer_focus: 通用）

- task：`t279_web_realtime_parity`
- spec：`docs/tasks/t279_web_realtime_parity/spec.md`
- diff_anchor：`08b4f86e28e1b77d99c3fe371e657f3ef3956586`
- target：`git diff 08b4f86e28e1b77d99c3fe371e657f3ef3956586`
- round：1
- reviewed_at：2026-08-10 16:24 UTC+8

## Round 1 (2026-08-10 16:24 UTC+8)

验证基线：`npx vitest run tests/integration/local-api/server.test.ts tests/unit/web/usageboard-web.test.ts` → 104 passed（58 node / 46 renderer），无红灯。桌面日志路径（`log-ipc.ts` / `logging.ts` `exportCurrentLog` / `getLogFilePath`）与订阅服务（`subscription-service.ts` subscribe/unsubscribe）均未在本 diff 改动，作为对照源码核实。

### Findings

### t279_gen_f001 - SSE 断连重连后服务端订阅不恢复，实时推送永久丢失

- 严重度：important
- 锚点：AC3「SSE 断连后 web 端按既有重连/轮询兜底，不错乱不丢订阅语义」；可观察行为缺陷（断连恢复后订阅语义丢失）
- 位置：`src/main/core/local-api/server.ts:1461-1474`（SSE close cleanup 注销订阅）、`src/web/usageboard-web.ts:189-196 / 614-634`（subscribe 开连接、无重连恢复逻辑）
- 问题：浏览器 EventSource 断连后默认自动重连，但服务端在连接 close 时（cleanup）删除 `web_session_subs` 条目并调 `service.unsubscribe` 停掉 watcher（server.ts:1462-1473）；重连的新连接只重新写入 `sse_client_sub_ids`，订阅不再恢复。web 端 `web_session_subs` map 仍保留该 key，视图层再次调 `subscribe` 会命中幂等短路（usageboard-web.ts:617-619 直接返回 `{subscribed:true}`），永远不会重建服务端订阅；页面不重载则 watcher 永久缺失。后果：断连恢复后新消息不再实时推送，仅靠视图层 `FALLBACK_MS=30s` 轮询 query 兜底（`src/renderer/components/workspace/workspace-view-helpers.ts:5`、`use-workspace-columns.ts:333`），消息不错乱但「订阅语义」丢失——与 AC3 验收的「不丢订阅语义」有可观察差距。另：重连竞态下旧连接 cleanup 的 `sse_client_sub_ids.delete(subscriber_id)`（server.ts:1465）还可能误删新连接的注册。
- 建议：订阅建立/恢复与 SSE 连接生命周期协调——web 端在 EventSource `open`（区分首次与重连）后幂等重发 `POST /v1/sessionHistory/subscribe`；或服务端将会话订阅与连接解耦（close 仅清理连接映射与连接侧注册，watcher 由显式 unsubscribe / 超时兜底清理），重连后订阅仍存活。最小修复面是前者。

### t279_gen_f002 - subscribe POST 失败时已创建的 EventSource 未关闭

- 严重度：minor
- 锚点：行为缺陷（异常路径资源泄漏）；spec 风险节「订阅泄漏」
- 位置：`src/web/usageboard-web.ts:614-634`
- 问题：`subscribe` 先 `new EventSource(...)` 再 `POST /v1/sessionHistory/subscribe`。POST 非 2xx（如服务端 409：POST 先于 `/v1/events` 连接注册到达；或网络错误）时 `post_json` 抛错（usageboard-web.ts:74-83），promise reject，EventSource 既未 `close()` 也未写入 `web_session_subs`，`unsubscribe_loc` 无法触达；连接与 `sse_client_sub_ids` 条目（server.ts:1444-1446）残留至页面关闭。订阅未注册故无 watcher 膨胀，但属未清理路径。
- 建议：POST 失败（含 reject）时 `close()` 已创建的 EventSource，或在写入 map 后再发起 POST 以保证清理可达。

### t279_gen_f003 - 集成测试「不误伤其他订阅方」未实际验证该行为，AC 标注错位

- 严重度：minor
- 锚点：测试可信度（测试名/AC 标注超出断言实际覆盖；非恒真断言危险模式）
- 位置：`tests/integration/local-api/server.test.ts:2028`（`it("POST /v1/sessionHistory/unsubscribe 注销订阅且不误伤其他订阅方 (t279 AC3)", ...)`）
- 问题：该用例仅注册单一订阅方，断言 `service.unsubscribe` 收到正确 4 参（server.test.ts:2089-2094）；未注册第二个订阅方并验证其仍收 `on_update`，「不误伤其他订阅方」未被断言触达。且该用例测的是 AC1 的 unsubscribe 语义（注销后不再收推送），标注 `(t279 AC3)`（断连兜底）错位。
- 建议：改名去掉「不误伤」声明，或补第二个 subscriber 仍收到 `on_update` 的断言；AC 标注改为 AC1。

### t279_gen_f004 - SSE close 触发注销的防泄漏路径无测试

- 严重度：minor
- 锚点：spec 风险节「订阅泄漏（watcher 膨胀）」的防护主路径；覆盖可更广
- 位置：`src/main/core/local-api/server.ts:1456-1477`（cleanup）无对应用例
- 问题：防泄漏核心机制（SSE 连接关闭 → 删除 `web_session_subs` + `service.unsubscribe`）没有测试；集成测试仅覆盖显式 `POST /v1/sessionHistory/unsubscribe` 与 subscribe 挂接。f001 所述断连场景恰走此路径，该路径行为（含重连后状态）完全未验证。
- 建议：补用例——打开带 `subscriberId` 的 `/v1/events`、subscribe、`reader.cancel()` 关闭连接，断言 `service.unsubscribe` 被调且订阅表清空。

## 结论

- 前轮 finding 复核：首轮无
- 本轮新发现：4 条（1 important / 3 minor）
- 未进表的提示：`/v1/logs/export` 与 `/v1/sessionHistory/*` 同处免鉴权层（server.ts:961-962 既有 web read endpoints intranet 决策），日志含会话文本，若部署越过本机网络需另行评估；`sse_client_sub_ids` 与 `web_session_subs` 按 subscriber_id 1:1 设计，同 id 双连接会状态错乱（并入 f001 重连场景）
- 总体判断：AC1/AC2/AC4 主路径实现与测试可信；AC3 存在未解决 important（断连重连后订阅不恢复），需修复后进入下一轮
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-10 16:50 UTC+8)

验证基线：`npx vitest run tests/integration/local-api/server.test.ts tests/unit/web/usageboard-web.test.ts` → 107 passed（59 node / 48 renderer），无红灯。Round 1 后新增用例（f002/f003/f004 对应单测与集成用例、AC3 重连重挂单测）全部通过；f004 用例实测通过（断言前 cleanup 已触发，测试尾部 stop() 释放连接约 4s）。桌面对照源码（log-ipc.ts / logging.ts / subscription-service.ts）本轮未改动，已核实接口语义。

### 前轮 finding 复核

- **f001（SSE 断连重连后订阅不恢复，important）——主路径已消除，竞态残余移交 f005**
    - 主路径修复依据（diff）：web 端 `WebSessionSubEntry.registered` 标记 + `open` 事件重挂（`src/web/usageboard-web.ts:644-661`）——初次 open 跳过、`registered` 置 true，断连重连后 open 以同 `subscriber_id` 重发 `POST /v1/sessionHistory/subscribe`。
    - 单测「SSE 重连 open 时用同 subscriber_id 重挂订阅 (t279 AC3)」（`tests/unit/web/usageboard-web.test.ts`）覆盖：初次 open 后 subscribe POST 次数保持 1，第二次 open 触发第 2 次 POST 且 body 含同 `subscriber_id`，测试运行通过。
    - 服务端幂等支撑：`subscription-service.ts:433-441` 同 (loc, subscriber_id) 重复 subscribe 只换 `on_update`、不重启 watcher，重挂不产生双推送。
    - 但 Round 1 指出的「重连竞态下旧连接 cleanup 误删新连接注册」未处理：服务端 `handle_sse` cleanup（`server.ts:1462-1474`）无条件 `web_session_subs.delete` + `sse_client_sub_ids.delete`，无 res 身份校验 → 拆为新 finding f005。

- **f002（subscribe POST 失败 EventSource 未 close，minor）——已消除**
    - 依据（diff）：subscribe 的 POST reject 路径删除 `web_session_subs` 条目、`sub_entry.events.close()`、上抛（`src/web/usageboard-web.ts:666-676`）。
    - 单测「subscribe POST 失败时关闭连接并清理订阅条目 (t279 f002)」：mock fetch reject 断言 `closed=true`，失败后重新 subscribe 能开新连接（旧条目已清理），测试运行通过。

- **f003（注销测试未触达多订阅方语义，minor）——已消除**
    - 依据（diff）：集成用例改为「POST /v1/sessionHistory/unsubscribe 只注销目标订阅方，不误伤同 loc 其他订阅方 (t279 AC1)」（`tests/integration/local-api/server.test.ts`）——注册 `web-sub-a` / `web-sub-b` 两个独立 SSE 连接各自订阅同一 loc，注销 B 后断言 `service.unsubscribe` 仅调用 1 次且参数为 B（若实现误伤 A 会调用两次，断言失败）。
    - 服务端语义核实：`handle_web_session_history_unsubscribe`（server.ts:517-541）只删目标 `subscriber_id` 条目；`subscription-service.ts:518-529` 按 subscriber_id 隔离注销、map 空才停 watcher。
    - AC 标注已改为 AC1（不再错位）。备注：该用例未触发 `on_update` 断言 A 仍收推送，但「不误伤」核心由注销调用次数与参数捕获，足够。

- **f004（SSE close 防泄漏无测试，minor）——已消除**
    - 依据（diff）：集成用例「SSE 连接关闭时自动注销其持有的会话订阅，防 watcher 泄漏 (t279 f004)」——subscribe 成功后 `reader.cancel()` 关闭连接，断言 `service.unsubscribe` 以正确 4 参被调用，测试运行通过（走 `server.ts:1456-1477` cleanup 路径）。

### Findings

### t279_gen_f005 - SSE cleanup 无连接身份校验，重连竞态下订阅仍可能永久丢失（AC3 残余）

- 严重度：important
- 锚点：AC3「SSE 断连后 web 端按既有重连/轮询兜底，不错乱不丢订阅语义」；可观测行为缺陷（断连重连时序交错 → 订阅语义丢失）
- 位置：`src/main/core/local-api/server.ts:1444-1446`（新连接 `sse_client_sub_ids.set`）、`1456-1477`（cleanup 无条件 delete + unsubscribe）
- 问题：Round 1 f001 已指出该竞态，本轮修复只覆盖 web 端重挂，服务端 cleanup 仍未校验 res 身份。断连重连的两种交错时序都会丢失订阅且无法自愈（`registered` 已置 true，重连 open 只触发一次，页面不重载不再重挂）：
    1. 新连接先注册、旧连接 cleanup 后执行：cleanup 的 `sse_client_sub_ids.delete(subscriber_id)`（1465）删掉新连接注册 → 重挂 POST 到 `handle_web_session_history_subscribe` 时 `sse_clients_by_sub.get` 为 undefined → 409 → web 端 catch 忽略（usageboard-web.ts:655-657），订阅永久丢失；
    2. 重挂 POST 先于旧 cleanup：`sse_clients_by_sub.get` 取到已 close 的旧 res → 订阅挂在旧连接上，随后旧 cleanup 删除条目并 `service.unsubscribe`（1463-1473），订阅同样丢失。
       两种时序后新连接不再有订阅，仅靠 renderer 轮询兜底（`FALLBACK_MS` 30s / 5s query 轮询），消息不错乱但「订阅语义」丢失——与 AC3 有可观察差距。
- 建议：cleanup 校验连接身份——`sse_client_sub_ids.get(subscriber_id) === res` 才 delete；`web_session_subs.get(subscriber_id)?.client === res` 才注销条目并调 `service.unsubscribe`。同时 `handle_web_session_history_subscribe` 可拒绝把订阅挂到已 close 的 res（`res.destroyed` 检查）。

### t279_gen_f006 - /v1/logs/export 以 stat 时刻的 Content-Length 声明活跃日志段长度，导出瞬间文件增长会长度不符

- 严重度：minor
- 锚点：行为缺陷（导出时日志持续写入 → 响应长度声明与实体不符）
- 位置：`src/main/core/local-api/server.ts:925-941`（`fs.stat` 得 size → writeHead 带 Content-Length → `createReadStream.pipe`）
- 问题：导出的是「当前活跃日志段」（app 运行中持续追加写入）。`fs.stat` 取 size 声明 `Content-Length`，stat 与 pipe 读完之间文件增长时，响应体实际字节数 > 声明值，浏览器下载按 Content-Length 截断或判定长度不符报错，导出内容可能缺尾部日志行。桌面 `exportCurrentLog` 用 `copyFile` 快照语义（logging.ts:63-68）无此声明长度问题。正常路径（导出瞬间无写入）内容正确，测试覆盖的也是静态文件场景。
- 建议：去掉 `Content-Length` 头（chunked 流式，读到 EOF 自然结束），或先整体读入内存再以实际字节数响应。

## 结论（Round 2）

- 前轮 finding 复核：f001 主路径已消除（web 端 registered 重挂 + 单测 AC3 覆盖 + 服务端幂等 subscribe），竞态残余拆为 f005 仍存在；f002 / f003 / f004 均已消除（以 diff 与测试运行为准，详见上文逐条依据）
- 本轮新发现：2 条（1 important / 1 minor）
- 未进表的提示：f004 用例实测约 4s（测试尾部 stop() 等待连接释放），server.test.ts 全程 ~5.2s，可接受；`/v1/logs/export` 与 `/v1/sessionHistory/*` 同处免鉴权层（server.ts:1001-1004 位于 check_auth 前，与既有 web read endpoints intranet 决策一致），日志含会话文本，若部署越过本机网络需另行评估（Round 1 已提示，决策未变）；f003 用例未触发 on_update 断言 A 订阅方仍收推送，现有断言已覆盖「不误伤」核心
- 总体判断：AC1/AC2/AC4 主路径实现与测试可信；AC3 主路径（断连重连重挂）已修复，但服务端 cleanup 身份校验竞态（f005，important）未消除
- 系统性 follow-up：无

verdict: FAIL

## Round 3 (2026-08-10 18:40 UTC+8)

验证基线：`npx vitest run tests/integration/local-api/server.test.ts tests/unit/web/usageboard-web.test.ts tests/unit/local-api/server.test.ts` → 117 passed（9 unit local-api / 48 renderer web / 60 integration node），无红灯。Round 2 后新增实现（f005 纯函数 `sse_cleanup_should_unsubscribe` + cleanup 身份校验、f006 chunked 导出）与测试（f005 单测 3 例、f005 集成时序用例、f006 集成 3 例）全部通过；f004 用例 4015ms、f005 集成时序用例 4259ms（cleanup 等待窗口），server.test.ts 全程 ~9.5s，可接受。桌面对照源码（logging.ts `exportCurrentLog` / `getLogFilePath`、log-ipc.ts `handleLogExport`、subscription-service.ts）本 diff 未改动，已核实接口语义与导出路径对齐。

### 前轮 finding 复核

- **f001（SSE 断连重连后订阅不恢复，important）——已消除**
    - 依据（diff 与测试）：web 端 `registered` 标记 + `open` 重挂保持（`src/web/usageboard-web.ts` subscribe 内）——初次 open 跳过、断连重连后 open 以同 `subscriber_id` 重发 POST；单测「SSE 重连 open 时用同 subscriber_id 重挂订阅 (t279 AC3)」通过（断言初次 open 后 POST 次数保持 1、第二次 open 触发第 2 次 POST 且 body 含同 `subscriber_id`）。服务端幂等支撑（subscription-service.ts 同 (loc, subscriber_id) 重复 subscribe 只换 `on_update`）未改动。Round 2 移交的竞态残余由 f005 承接并已消除（见下），f001 无剩余项。

- **f002（subscribe POST 失败 EventSource 未 close，minor）——已消除**
    - 依据（diff 与测试）：POST reject 路径删除 `web_session_subs` 条目、`sub_entry.events.close()`、上抛（`src/web/usageboard-web.ts` subscribe 的 `.then(..., (error) => {...})`）；单测「subscribe POST 失败时关闭连接并清理订阅条目 (t279 f002)」通过（mock fetch reject 断言 `closed=true`，失败后重新 subscribe 开新连接）。409 场景的残余（初始订阅失败后无自愈）作为本轮新 finding f007 单列，不属 f002 未消除。

- **f003（注销测试未触达多订阅方语义，minor）——已消除**
    - 依据（diff 与测试）：集成用例「POST /v1/sessionHistory/unsubscribe 只注销目标订阅方，不误伤同 loc 其他订阅方 (t279 AC1)」——注册 `web-sub-a` / `web-sub-b` 两个独立 SSE 连接各自订阅同 loc，注销 B 后断言 `service.unsubscribe` 仅调用 1 次且参数为 `web-sub-b`（若实现误伤 A 会调用两次，断言失败）；AC 标注已为 AC1。测试通过。

- **f004（SSE close 防泄漏无测试，minor）——已消除**
    - 依据（diff 与测试）：集成用例「SSE 连接关闭时自动注销其持有的会话订阅，防 watcher 泄漏 (t279 f004)」——subscribe 成功后 `reader.cancel()` 关闭连接，断言 `service.unsubscribe` 以正确 4 参被调用（实测 4015ms，含 close 传播窗口）；走 `server.ts:1489-1511` cleanup 路径。

- **f005（SSE cleanup 无连接身份校验，important）——已消除**
    - 依据（diff 与测试）：
        1. 纯函数 `sse_cleanup_should_unsubscribe`（`src/main/core/local-api/server.ts:133-151`，导出）：`sse_clients_by_sub.get(subscriber_id) !== closing_res` 或 `sub.client !== closing_res` 任一不成立即返回 false（跳过注销）；cleanup 挂接（server.ts:1489-1499）校验不通过直接 `return`，不删表、不调 `service.unsubscribe`。
        2. 单测 3 例（`tests/unit/local-api/server.test.ts`）覆盖正反两面：映射仍指向 closing → true（继续注销）；新连接已重新注册（旧 close 迟到）→ false（跳过）；subscriber_id 未注册 → false（跳过）。通过。
        3. 集成时序用例「SSE 断连 cleanup 注销旧订阅，新连接重挂后独立活跃 (t279 f005)」：旧连接 close → 注销（unsubscribe 计数 1）→ 新连接同 id 重挂 → 保持活跃（无额外注销）→ 新连接 close 才再次注销（计数 2）。实测 4259ms 通过。
        4. 竞态复核（读周边上下文）：`handle_web_session_history_subscribe` 中 `sse_clients_by_sub.get` → `subs.set` → `service.subscribe` 为 `read_json_body` await 之后的同步连续段，旧 cleanup 无法插入 get 与 set 之间；两种交错均安全——POST 先执行则订阅挂新 res、cleanup 时映射已指向新 res 而跳过；cleanup 先执行则映射已被新连接注册覆盖（handle_sse 同步 `set`）而跳过、随后重挂 POST 成功。Round 2 建议的 `res.destroyed` 检查为可选项：web 端重挂 POST 由新连接 `open` 触发，`sse_client_sub_ids` 恒已指向新 res，无需。f005 无剩余项。

- **f006（/v1/logs/export Content-Length 声明与活跃日志段增长不符，minor）——已消除**
    - 依据（diff 与测试）：`handle_logs_export`（server.ts:934-962）文件存在路径 `writeHead` 不再带 `Content-Length`（chunked 流式，`createReadStream.pipe(res)` 读到 EOF 自然结束，代码注释注明 f006）；文件缺失路径 `Content-Length: 0` + 空 body（合法组合）。集成用例「GET /v1/logs/export 流式返回当前活跃日志段并带下载头」「日志文件缺失时返回 200 空下载」「未配置 user_data_path 时返回 503」全部通过。路径语义与桌面对齐：`get_logs_dir(user_data_path)` + `app-${date}.log`（`toISOString().slice(0,10)`）与 `exportCurrentLog`（logging.ts:21-24, 63-68）完全一致，下载名 `omni-panel-log-${date}.log` 与 `handleLogExport` defaultPath 一致。

### Findings

### t279_gen_f007 - 初始订阅 POST 早于 SSE 连接注册时返回 409，清理后无自愈，该会话实时推送缺失（AC1 极窄窗口）

- 严重度：minor
- 锚点：行为缺陷（AC1 极端时序下订阅失败）；非 blocking（本地回环概率极低、renderer 轮询兜底、无泄漏无错乱）
- 位置：`src/web/usageboard-web.ts` subscribe（初始 POST 失败分支，f002 修复路径：删条目 + `events.close()` + throw）、`src/renderer/components/workspace/use-workspace-columns.ts:151-155`（catch 忽略不重试）
- 问题：初始订阅先 `new EventSource(...)`（发 GET）再 `post_json("/v1/sessionHistory/subscribe")`（发 POST）。本地回环下 GET 先发且 `handle_sse` 同步注册，通常无碍；但 POST 请求若先于 GET 被服务端处理（独立 TCP 连接、accept 顺序不定），服务端 `sse_clients_by_sub.get` 返回 undefined → 409（集成用例已固定该语义）。f002 修复路径此时删除条目、`events.close()`、上抛；renderer `catch` 忽略且 EventSource 已 close，不再有后续 `open` 重挂机会（`registered` 逻辑只在 open 时触发重挂）——该会话实时推送永久缺失，仅靠 renderer `FALLBACK_MS` 轮询 query 兜底。与 f002 的差异：f002 消除的是「失败残留泄漏」，本项是「失败后订阅不可恢复」。不破坏数据、不错乱、可经页面重载恢复，故 minor。
- 建议：初始订阅 POST 移入 `open` 事件统一发送（open 触发时 `registered` 为 false 也 POST 一次），消除 POST/GET 到达顺序依赖；或 409 失败时保留 EventSource 与条目、等待下一次 `open` 重挂。renderer 侧无需改动（保持 catch 忽略即可）。

## 结论（Round 3）

- 前轮 finding 复核：f001 / f002 / f003 / f004 / f005 / f006 全部已消除，依据见上文逐条（以 `git diff` 与测试运行 117 passed 为准；f005 竞态消除经纯函数单测 + 集成时序用例 + 事件循环交错分析三重核实）
- 本轮新发现：1 条（1 minor，f007）
- 未进表的提示：`/v1/logs/export` 与 `/v1/events`、`/v1/sessionHistory/*` 同处免鉴权层（server.ts:1020-1028 位于 `check_auth` 前），日志含会话文本，若部署越过本机网络需另行评估（Round 1/2 已提示，决策未变）；f006 修复无回归断言——集成用例未断言响应无 `content-length` 头，chunked 回归时测试仍会通过，可补一条断言（覆盖可更广，未单列）；f004/f005 集成用例各约 4s（cleanup 等待），可接受
- 总体判断：AC1/AC2/AC3/AC4 主路径实现与测试可信；6 条前轮 finding 全部消除，本轮仅 1 条 minor（f007，极窄窗口且轮询兜底），无未解决 critical / important
- 系统性 follow-up：无

verdict: PASS

## Round 4 (2026-08-10 18:52 UTC+8)

验证基线：`npx vitest run tests/integration/local-api/server.test.ts tests/unit/web/usageboard-web.test.ts tests/unit/local-api/server.test.ts` → 117 passed（9 unit local-api / 48 renderer web / 60 integration node），无红灯，与 Round 3 基线一致。f004 用例 4016ms、f005 集成时序用例 4260ms，server.test.ts 全程 ~9.4s。本 diff（相对 anchor）本轮在 Round 3 审查基础上仅新增 f007 修复：web 端 `subscribe` 注册 POST 移入 EventSource `open` 统一发送（`src/web/usageboard-web.ts:626-672`）+ 单测「open 前不 POST」断言（`tests/unit/web/usageboard-web.test.ts:785`）；服务端、集成测试、f005 单测均未变动，作为对照核实。

### 前轮 finding 复核

- **f001（SSE 断连重连后订阅不恢复，important）——已消除，无回归**
    - 依据（diff 与测试）：open 统一注册重构未破坏重挂机制——同一 `open` listener 处理首次与重连（`usageboard-web.ts:647-667`），`registered` 标记 + 同 `subscriber_id` 幂等重发保持；单测「SSE 重连 open 时用同 subscriber_id 重挂订阅 (t279 AC3)」通过（初次 open 后 POST 次数 1、第二次 open 后次数 2 且 body 同 `subscriber_id`）。服务端幂等（subscription-service.ts 同 (loc, subscriber_id) 只换 on_update）未改动。

- **f002（subscribe POST 失败 EventSource 未 close，minor）——已消除，无回归**
    - 依据（diff 与测试）：失败清理路径保留并随 f007 修复移到 open 内——初始注册失败时以 `web_session_subs.get(key) === sub_entry` 身份校验后删除条目 + `events.close()`（服务端 SSE close 兜底注销），无泄漏；单测「初始订阅 POST 失败时关闭连接并清理订阅条目 (t279 f002)」通过（断言 `closed=true`，失败后重新 subscribe 开新连接）。POST 失败场景经 open 内 catch 处理与 f002 原语义一致。

- **f003（注销测试未触达多订阅方语义，minor）——已消除，无回归**
    - 依据（diff 与测试）：集成用例「POST /v1/sessionHistory/unsubscribe 只注销目标订阅方，不误伤同 loc 其他订阅方 (t279 AC1)」保持并通过（注销 B 后断言 `service.unsubscribe` 仅调用 1 次且参数为 `web-sub-b`）。

- **f004（SSE close 防泄漏路径无测试，minor）——已消除，无回归**
    - 依据（diff 与测试）：集成用例「SSE 连接关闭时自动注销其持有的会话订阅，防 watcher 泄漏 (t279 f004)」通过（实测 4016ms，走 `server.ts:1482-1511` cleanup 路径）。

- **f005（SSE cleanup 无连接身份校验，important）——已消除，无回归**
    - 依据（diff 与测试）：`sse_cleanup_should_unsubscribe`（server.ts:133-151）与 cleanup 挂接（server.ts:1489-1499）本轮未变动；f005 单测 3 例（映射指向 closing→true / 新连接已注册→false / 未注册→false）与集成时序用例（旧 close 注销→新连接重挂→独立活跃→新 close 再注销，实测 4260ms）均通过。f007 修复不触碰服务端清理路径，无交互回归。

- **f006（/v1/logs/export Content-Length 声明与活跃日志段增长不符，minor）——已消除，无回归**
    - 依据（diff 与测试）：`handle_logs_export` chunked 导出（server.ts:948-962 不带 Content-Length，文件缺失路径 Content-Length: 0）本轮未变动；集成用例「流式返回当前活跃日志段并带下载头」「日志文件缺失时返回 200 空下载」「未配置 user_data_path 时返回 503」全部通过。

- **f007（初始订阅 POST 早于 SSE 连接注册时返回 409，清理后无自愈，该会话实时推送缺失，minor）——已消除**
    - 依据（diff 与测试）：
        1. 注册 POST 移入 `open` 统一发送（`usageboard-web.ts:642-667`，代码注释注明 f007）：`subscribe` 函数体不再同步 POST；`open` 事件内 `post_json("/v1/sessionHistory/subscribe", {...})`，成功后置 `registered = true`。原始竞态（POST 先于 GET/连接注册到达）结构性消除——EventSource `open` 只在连接建立后触发，而服务端 `handle_sse` 在 `flushHeaders` 后**同步** `sse_client_sub_ids.set(subscriber_id, res)`（server.ts:1466-1469，无异步边界），POST 到达时 `sse_clients_by_sub.get` 必然命中（连接未断时），409 不再发生。
        2. 失败清理（含失败清理保留）：初始注册 POST reject 且 `!registered` 时，`web_session_subs.get(key) === sub_entry` 校验后 delete + `events.close()`（usageboard-web.ts:657-666）；服务端 SSE close 兜底注销，无泄漏。重连重挂失败（`registered` 为 true）不清理，等待下次 `open` 再试（EventSource 自动重连触发 open，离线恢复后可自愈）。
        3. 单测「sessionHistory.subscribe 开专属 SSE 连接，open 后 POST 订阅 (t279 AC1)」断言 open 前 `fetch_mock` 未调用、open 后 POST body 含 4 参（source/env/session_id/subscriber_id），测试运行通过——直接触达 f007 修复的可观察行为。
        4. 集成用例「POST /v1/sessionHistory/subscribe 未先经 /v1/events 注册返回 409 (t279)」仍保留，作为服务端契约语义（无连接时 POST → 409）固定，与 web 端新时序不冲突。
    - 残余窗口（如实说明，不单列）：open 触发后、注册 POST 完成前连接若断开，服务端 cleanup 已删注册，POST 到达 409 → catch 走初始失败清理 → 该会话订阅不可恢复，仅靠 renderer `FALLBACK_MS` 轮询兜底（use-workspace-columns.ts:333）。该窗口与 f007 原始「POST/GET 到达顺序」竞态不同（后者已结构性消除），但观察行为与 f007 已接受语义一致（初始注册失败 → 无自愈 → 轮询兜底保证数据可达、不错乱、无泄漏），本地回环下触发概率极低（open 与 POST 完成之间断连），不构成新 blocker，不计 FAIL。

### Findings

本轮新发现：0 条。

## 结论（Round 4）

- 前轮 finding 复核：f001 / f002 / f003 / f004 / f005 / f006 均已消除且本轮无回归（以 `git diff` 与本轮测试运行 117 passed 为准）；f007 已消除（open 统一发送注册消除 409 顺序竞态 + 失败清理无泄漏 + 单测直接断言 open 前不 POST；残余极窄断连窗口与 f007 已接受语义一致，轮询兜底）
- 本轮新发现：0 条
- 未进表的提示：f006 修复无「响应无 content-length 头」回归断言（集成用例断言 status/content-disposition/body，未断言头缺失；chunked 回归时测试仍会通过）——覆盖可更广，未单列；`/v1/logs/export` 与 `/v1/events`、`/v1/sessionHistory/*` 同处免鉴权层（server.ts:1010-1028 位于 `check_auth` 前），日志含会话文本，若部署越过本机网络需另行评估（Round 1/2/3 已提示，决策未变）；f004/f005 集成用例各约 4s（cleanup 等待窗口），可接受
- 总体判断：AC1/AC2/AC3/AC4 实现与测试可信；7 条前轮 finding 全部消除，本轮 0 新 finding，无未解决 critical / important
- 系统性 follow-up：无

verdict: PASS
