# 花云（FlowerCloud）网页会话用量连接器

## 1. 范围与意图

以网页会话（`web_login`）方式接入花云客户区，读出月流量用量与配额。花云的用量只渲染在登录后的 WHMCS 客户区页面里，且纯 HTTP 重放会被 Cloudflare 质询拦截，因此采集分两段：宿主用会话窗口抓页面 DOM 并落盘，连接器只负责从 HTML 里解析指标。

## 2. 外部契约与协议

- 客户区：`https://api-flowercloud.com/clientarea.php`；用量卡片在服务详情页 `/clientarea.php?action=productdetails&id=<id>`。
- 认证：`SESSION_COOKIE`（secret 参数）。vault 载荷为 `{ cookie, html, captured_at }`，由 `src/main/core/session/flowercloud_dom.ts` 与 `connectors/flowercloud/connector.ts` 共用（连接器是独立脚本，两侧结构与新鲜期常量必须保持一致）。
- 输出指标：`flowercloud:traffic`，`window: month`，`display_style: ratio`，`source: session`。
- `stale` 语义：DOM 快照年龄超过新鲜期（5 分钟）或载荷缺少 `captured_at` 时为 `true`；有快照时不再发网络请求。
- 每个实例只输出一条 observation（`account_id = flowercloud_default`）。多服务账号的限制见 p267。

## 3. 宿主会话契约（Desktop）

- `SessionManager.refresh_flowercloud_snapshot(instance_id, login_url, options?)`：用实例会话分区开隐藏窗抓 DOM，成功才写回 vault；任一失败路径都不改 vault。`timeout_ms` 缺省 45s，`settle_ms` 缺省 2.5s（避开 JS 把旧数字换成当前用量之前的那一帧）。
- 新鲜期跳过：`options.skip_if_fresh` 为真且 vault 快照仍在新鲜期内时，不开窗，直接视为可用。
- 定时刷新：`RefreshServiceDeps.refresh_web_session` 在连接器执行前调用，且先把实例状态置为 `loading` 再抓取（抓取时间不计入 15s 连接器预算）；抓取返回后若 generation 已过期则放弃本轮。手动刷新（`force`）不跳过新鲜期，强制重抓。
- 质询/登录页：持续 8s 未自动通过时把窗口亮出来（`reveal`）；亮窗后**继续采集**（`reveal_budget_ms` 120s + `handover_wait_ms` 上限 30 分钟），期间拿到用量照常写回并关窗，窗口被关闭或被交互登录抢占即按取消结束。只有到达等待上限仍停在质询/登录页时才把窗口交给用户（`handed_over`，登记随之释放，本轮不写 vault）。
- 写入保护：读分区 cookie 与落盘都是异步的，写入点会二次校验「是否已取消」，并在 `vault.set` 前复核 vault 值未被改动（CAS）；用户关窗、交互登录抢占、或期间有更新的快照/新登录凭据写入时，本轮旧数据一律不覆盖。
- cookie 回写：只取分区里的 `cf_clearance` 与 `WHMCS*`，按名合并进 vault 里已有的 cookie 串（保留其它 cookie），且必须是安全 cookie 串。
- 登录流程：窗口保持打开（`LOGIN_WINDOW_KEEP_OPEN_PROVIDERS`）；捕获后不做裸 cookie 有效性探测、纯 cookie 静默刷新被跳过（`DOM_SNAPSHOT_PROVIDERS`）。
- 登录与快照互斥（同一实例同一时刻只允许一个）：
    - 登录进行中收到快照请求 → 快照直接跳过并返回 `false`（连接器继续用旧 HTML，`stale` 如实标注），不排队。
    - 快照进行中收到**前台交互登录** → 按 t505 语义抢占：关掉快照窗、快照按「已取消」结束且不写 vault，登录照常进行。
    - 用户手动关掉快照窗 = 取消本轮（`closed` → `cancelled`），不写 vault 并按取消记日志，不误报成「页面没渲染出用量」。
- 新鲜期常量在宿主（`FLOWERCLOUD_SNAPSHOT_FRESH_MS`）与 connector（`SNAPSHOT_FRESH_MS`）各一份（connector 不能 import 宿主代码），由集成测试锁死一致性。

## 4. UI 与展示契约

- 添加账号走网页登录流程；品牌图标使用官方渐变 PNG `src/renderer/assets/vendor_logos/flowercloud.png`。
- 快照过期时按 `stale` 如实标注数据新鲜度，不静默伪装成实时数据。
- 多服务账号只统计首个服务（p267）：页面出现多个服务时连接器记 `warn`，用户侧尚无独立提示。

## 5. 验证方式

|层|方式|
|---|---|
|API|`tests/integration/connector/flowercloud_connector.test.ts`：DOM 解析、stale 判定（过旧/无捕获时间）、挑战与登录失效错误、新鲜期常量一致性契约、多服务告警|
|Desktop|`tests/unit/session/session-manager.test.ts`：快照抓取与 settle、reveal 交接与等待期继续采集、交接窗口占用登记（不堆积窗口）、并发去重、cookie 合并、跳过新鲜快照、快照不冒充登录、用户关窗取消、交互登录抢占快照；`tests/unit/session/flowercloud_dom.test.ts`：写入前取消校验与 CAS（不覆盖并发变更）；`tests/unit/scheduler/refresh-service.test.ts`：抓取先于连接器、loading 先行、force 透传|

## 6. 相关 task

- t533：连接器与网页登录落地。
- 2026-09-29：DOM 快照抓取重构（会话模块拆分、provider 策略集中、cookie 合并、reveal 交接、分发调度顺序、脱敏分组）未走 task 流程；上表行为以本次修复为准。
