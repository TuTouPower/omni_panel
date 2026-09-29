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

- `SessionManager.refresh_flowercloud_snapshot(instance_id, login_url, options?)`：用实例会话分区开一次**隐藏**窗口抓 DOM，成功才写回 vault；任一失败路径都不改 vault。返回 `{ ok, reason? }`，失败时 `reason` 是可读原因。`timeout_ms` 缺省 45s，`settle_ms` 缺省 2.5s（避开 JS 把旧数字换成当前用量之前的那一帧）。
- **不做任何前台化**：抓取窗始终 `hidden: true`，不调用 `show()` / `showInactive()` / `setOpacity()`。依据 s040（`docs/findings/d063`）：`show:false` 窗口的页面 `document.hidden` 已是 false，Cloudflare 脚本照常执行；而 `show()` + 聚焦会把托管式自动挑战（「正在验证…」）升级成必须人工点击的交互挑战（「请验证您是真人」+ 复选框）并抢焦点。
- **窗口生命周期收敛**：成功、失败、超时、被取消一视同仁——本轮结束即关窗并释放 `in_progress` / `flower_snapshots` 登记，不存在「留给用户」的失管窗口，下一轮刷新也不会叠加同分区窗口。
- 新鲜期跳过：`options.skip_if_fresh` 为真且 vault 快照仍在新鲜期内时，直接返回 `ok: true`；实现上仍会创建隐藏窗并在判定后立即关闭（窗口不可见，不产生任何前台影响）。
- 定时刷新：`RefreshServiceDeps.refresh_web_session` 在连接器执行前调用，并先把实例状态置为 `loading` 再抓取（抓取时间不计入 15s 连接器预算）。抓取返回 `ok: false` 或抛异常时，本轮以 `failed` 结束并写入可读原因（保留 `lastSuccess`），**不再调用连接器重放旧 HTML**；抓取成功但 generation 已被更新刷新取代时放弃本轮。手动刷新（`force`）不跳过新鲜期。
- 失败原因分类：`cloudflare` → 要求完成人机验证；`login` → 登录会话失效需重新登录；`blocked` → 访问被拦截（网络出口受限）；`network` → 抓取过程异常（页面加载、网络或会话读写失败，文案不主张具体原因，真实错误在日志）；`empty` / `other` → 页面未出现用量数据；`cancelled` → 抓取被取消。
- 写入保护：读分区 cookie 与落盘都是异步的，写入点会二次校验「是否已取消」，并在 `vault.set` 前复核 vault 值未被改动（CAS）；窗口被关、被交互登录抢占、或期间有更新的快照 / 新登录凭据写入时，本轮旧数据一律不覆盖。
- cookie 回写：只取分区里的 `cf_clearance` 与 `WHMCS*`，按名合并进 vault 里已有的 cookie 串（保留其它 cookie），且必须是安全 cookie 串。
- 登录流程：窗口保持打开（`LOGIN_WINDOW_KEEP_OPEN_PROVIDERS`）；捕获后不做裸 cookie 有效性探测、纯 cookie 静默刷新被跳过（`DOM_SNAPSHOT_PROVIDERS`）。
- 登录与快照互斥（同一实例同一时刻只允许一个）：
    - 登录进行中收到快照请求 → 快照跳过并返回 `{ ok: false, reason: "花云登录进行中，本轮跳过抓取" }`。
    - 快照进行中收到**前台交互登录** → 按 t505 语义抢占：关掉快照窗、快照按「已取消」结束且不写 vault，登录照常进行。
    - 用户手动关掉快照窗 = 取消本轮（`closed` → `cancelled`），不写 vault，也不误报成「页面没渲染出用量」。
- 用户处理入口：需要人机验证或重新登录时宿主不自动弹窗；用户主动走「网页登录」（`start_login`）时登录窗照常前台显示，这是唯一的前台化路径。
- 自动交互边界：不实现「自动点击验证控件」——s040 证明 Turnstile 控件位于跨域 iframe / 不可遍历 shadow DOM，主文档枚举不到可点击目标（`docs/findings/d063`）。
- 新鲜期常量在宿主（`FLOWERCLOUD_SNAPSHOT_FRESH_MS`）与 connector（`SNAPSHOT_FRESH_MS`）各一份（connector 不能 import 宿主代码），由集成测试锁死一致性。

## 4. UI 与展示契约

- 添加账号走网页登录流程；品牌图标使用官方渐变 PNG `src/renderer/assets/vendor_logos/flowercloud.png`。
- 快照过期时按 `stale` 如实标注数据新鲜度，不静默伪装成实时数据。
- 多服务账号只统计首个服务（p267）：页面出现多个服务时连接器记 `warn`，用户侧尚无独立提示。

## 5. 验证方式

|层|方式|
|---|---|
|API|`tests/integration/connector/flowercloud_connector.test.ts`：DOM 解析、stale 判定（过旧/无捕获时间）、挑战与登录失效错误、新鲜期常量一致性契约、多服务告警|
|Desktop|`tests/unit/session/session-manager.test.ts`：快照抓取与 settle、**遇阻不前台化并返回可读原因**、预算耗尽即关窗并释放登记（不叠加窗口）、并发去重、cookie 合并、跳过新鲜快照、快照不冒充登录、用户关窗取消、交互登录抢占快照；`tests/unit/session/flowercloud_dom.test.ts`：写入前取消校验与 CAS（不覆盖并发变更）；`tests/unit/scheduler/refresh-service.test.ts`：抓取先于连接器、loading 先行、force 透传、抓取失败置 failed 且不跑连接器、stale 降级与 lastSuccess 保留；`tests/integration/scheduler/refresh-service.test.ts`：抓取失败插入 stale 副本（`stale` + `last_error`）且连接器未被调用|

## 6. 相关 task

- t533：连接器与网页登录落地。
- t535：后台优先策略与采集窗口可见性（移除自动前台化与交接等待；抓取失败如实标注原因）。
- 2026-09-29：DOM 快照抓取重构（会话模块拆分、provider 策略集中、cookie 合并、reveal 交接、分发调度顺序、脱敏分组）未走 task 流程；上表行为以本次修复为准。
