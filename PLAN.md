# OmniUsage — 已知限制 / 待办

## 安全：连接器脚本沙箱非真隔离

- 现状：第三方/用户连接器脚本（`connectors/` 下，含 `user_dir`）运行在 Node
  `vm.runInContext` 沙箱中（`src/main/core/connector/runtime.ts`）。
- 限制：Node `vm` 模块**不是真正的隔离环境**（官方文档明确说明），沙箱仅冻结并注入
  `ctx`，无法阻止刻意构造的逃逸（例如通过 `(0, eval)("this")` 触达主进程全局）。
- 影响：用户被诱导安装的恶意连接器脚本可能逃逸到主进程，等于完全沦陷。
- 现有缓解：连接器脚本禁止 `import`/`export`（`compile_script` 正则拦截），运行有
  超时；HTTP/文件能力经 `ConnectorContext` 受控。
- 待办（需评估，非小改）：改用 `isolated-vm`（v8 真隔离）或把连接器放进**子进程**
  运行（进程级隔离 + IPC 能力收窄）。两者都需重构运行时与 `ConnectorContext` 边界。
- 决策点：是否接受额外依赖 / 子进程开销，换取对用户连接器的强隔离。

## 安全：导入配置可重定向连接器端点（公网攻击主机）

- 现状：`endpointOverrides` 可由用户配置/导入。`apply_auth` 会按 manifest 把 secret
  注入到解析后的端点（bearer/header/query）。
- 风险：导入一份恶意配置，把某连接器端点改指到**公网攻击者主机**，用户现存的 vault
  secret 会被发过去。`assert_safe_connector_host` 只拦云元数据主机，**不拦公网主机**
  （无法区分合法外部 API 与攻击者主机）。
- 待办（需评估）：导入配置后，被改动端点的连接器要求**重新录入 secret**，避免导入
  即外泄；或在导入时对端点变更给出显式确认。

## 测试质量缺口（审计 P1，待补）

最近一轮测试审计（opus 子代理）的 P1 级缺口，均为最近修复但缺回归覆盖：

1. SSRF 元数据守卫无测试（net-client.ts assert_safe_connector_host）。补：
   endpoint_overrides 指向 169.254.169.254 / metadata.google.internal，断言
   GET/POST 抛 "Refusing connector request to metadata host"；并断言私网/回环不被拒。
2. poll.map 的 $ 路径校验无测试（manifest.ts poll_map_schema）。补：
   map:{used:"0"} 解析失败、提示 must be a JSON path；
   map:{used:"$.u",limit:"$.l",window:"month"} 通过。
3. secrets importAll 回滚无测试（secrets-store.ts）。补：预置 {a,b}，spy vault.set
   在写 b 时抛错，importAll({a:"new"}) 重抛，exportAll() 仍是原 {a,b}（不含 new）。
4. 设置窗口持久化测试是 grep 重言式（first_paint_theme.test.ts）。补：把关闭决策抽成
   纯函数 compute_close_action({quitting,isDestroyed}) 单测三态（hide/destroy/noop），
   grep 仅留冒烟。
5. ProviderCard has_stale_error 组合态无测试。补：connectorError + 有缓存数据同时存在
   → 断言 .card.stale 类 + 错误横幅文本 + 至少一个 period 标记共存；"重新登录"不出现。
6. 错误新鲜度仅断言 status，未断言值（refresh-service.test.ts）。补：成功后再断
   items[0].last_error === null / error 字段已清，锁住值级新鲜度。
7. runtime.test.ts 残留 source_instance_id 旧夹具（runtime.test.ts:50,81）。修：删掉
   脚本夹具里的 source_instance_id（应为主机盖章），并加负面测试——即使脚本声明该字段，
   result.observations[0] 也不含它。
8. CONFIG_GET 的 sender 拒绝无测试（config-ipc.ts:322）。补：仿 config:save 拒绝测试，
   {senderFrame:{url:"about:blank"}} 调 config:get 断言抛 "IPC not allowed from unknown origin"。

## 测试质量缺口（审计 P2，有余力再补）

9. probe 不应从白名单外 header 造 used：补"服务器发未列入的
   x-ratelimit-remaining-month，断言被忽略"。
10. display_label 端到端未断言：补刷新脚本带 display_label:"我的5h"，断言
    snapshot.items[0].display_label 一致；加 observation store 往返。
