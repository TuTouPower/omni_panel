# Task spec

## 背景

Muse AI（Meta 智能体平台，`https://muse.ai/`）基于 Next.js App Router 单页应用架构。其网页初始 HTML 仅包含界面外壳，不直出用量数据，服务端亦无开放 REST 用量 API。浏览器端通过 Next.js Server Action 机制（`POST https://muse.ai/`，必须携带 `next-action: <40位哈希ID>` 请求头）获取包含周期限额与额外额度的 RSC（React Server Components）流式数据。

用户反馈在已完成网页登录状态下无法获取用量，且连接器频繁失败。排查确认存在两项致命架构问题：

1. **会话假失效误报死循环**：`connectors/muse/connector.ts` 对首页响应体使用 `/Forbidden/i.test(res.body)`。Next.js App Router 首页返回的页面源码中，路由元数据天然包含 `"notFound":"$undefined","forbidden":"$undefined"`，导致 HTTP 200 的正常已登录页面被误判为 403 Forbidden，主动抛出 `Muse 会话已失效 (HTTP 200)`，触发后台重登并把正常会话打入失效状态。
2. **Server Action ID 静态写死导致版本发布即 404**：Meta 线上采用高频 CI/CD 部署（日均多次重新编译发版）。Next.js 每次构建都会对 Server Action 函数闭包重新哈希。历史代码试图在 HTML 中正则查找 `actionId`，但 Action ID 仅在打包后的客户端 JS chunk（`createServerReference`）中存在；导致提取落空并回退到写死的常量 `BASELINE_ACTION_ID`，服务端打回 `404 Server action not found`。

必须彻底移除硬编码 ID 与 HTML 误判正则，建立可靠的运行时动态嗅探机制与健壮的会话状态判定。

## 契约区

### 范围

- `connectors/muse/connector.ts`：
    - 移除对 HTML 响应体的 `/Forbidden/i` 正则匹配，会话失效严格以 HTTP 401/403 状态码或重定向至 `auth.muse.ai` 为判定基准。
    - 实现运行时自动动态嗅探机制：从首页获取当前 `deployment_id`，若发生版本更新，定位 Turbopack 异步清单 chunk 并提取订阅模块中的最新 `fetchSubscriptionAction` ID。
    - 支持 `ctx.params` 中的 `ACTION_ID` 和 `DEPLOYMENT_ID` 参数覆盖，保留基准常量作为兜底。
    - 成功获取 RSC 数据后，按既有模型解析 `muse:weekly`（周期限额）与 `muse:extra`（额外额度）。
- `connectors/muse/manifest.json`：
    - parameters 增加 `ACTION_ID` 与 `DEPLOYMENT_ID` 可选配置项（`exposeToScript: true`），暴露给有高级自定义需求的用户。
- `tests/integration/connector/muse_connector.test.ts`：
    - 增加真实 Next.js RSC 路由树包含 `"forbidden":"$undefined"` 时不触发会话失效的断言。
    - 增加动态嗅探 chunk 提取 Action ID 的全流程测试。
    - 增加参数覆盖 Action ID 与 Deployment ID 的测试。

### 非范围

- 不改变 Muse Web 会话登录与 Cookie 捕获机制（保持 `hatch_sess` 会话凭据）。
- 不重写主进程 `session-manager` 调度与重登逻辑。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：当服务端返回正常的 200 OK HTML 页面且包含 `"forbidden":"$undefined"` 等 Next.js 路由元数据时，连接器成功通过鉴权检查，不得抛出会话失效错误。
- [ ] AC-002：当线上 deployment ID 发生变更时，连接器自动从 Turbopack 打包清单 chunk 中动态嗅探并解析出当前生效的 `fetchSubscriptionAction` ID，无需人工干预或修改代码。
- [ ] AC-003：连接器携带有效会话 Cookie 与解析得到的动态 Action ID 及 Deployment ID 发起 POST 请求，成功提取 `weekly` 限额与 `extra` 额度指标，生成合法的 `ScriptObservation`。
- [ ] AC-004：当调用方在参数中显式提供 `ACTION_ID` 或 `DEPLOYMENT_ID` 时，连接器优先使用该覆盖值发起请求。
- [ ] AC-005：全量自动化测试（单元、集成与质量门禁 `pnpm check`）通过，无回归破坏。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：用户反馈与线上实测排查（2026-09-26；发现 `/Forbidden/i` 正则误判及 Meta 5 小时内重新部署触发 Action ID 变更）

### 有意不测

- 外部 Meta 服务器持续停机或发生不可恢复网络中断的端到端网络场景：由 net-client 超时与调度器退避机制守护，不作为连接器内部单测重点。

### 测试策略

- 单元/集成测试（`muse_connector.test.ts`）：
    - 注入带 `"forbidden":"$undefined"` 的真实 Next.js HTML，验证鉴权通过。
    - 模拟多 chunk 动态引用场景，断言连接器可逐级追踪 Turbopack 清单并解析 `createServerReference` 提取正确的哈希。
    - 验证参数覆盖（`ACTION_ID` / `DEPLOYMENT_ID`）生效。
    - 验证正常 RSC 响应流的指标解析。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无。

### 风险与回退

- 风险：Meta 未来若重构前端打包器彻底放弃 Turbopack 清单格式，可能导致动态嗅探降级回退到基准 ID；通过失败告警和参数手动覆盖兜底。
- 回退：`git revert` 回退至前序稳定 commit。

### 依赖与约束

- 依赖：现存 `host-io.ts` 与 `net-client.ts` 提供的 `get_raw` 与 `post_raw` 方法。
- 约束：凭据保密性，会话 Cookie 严禁落入测试 fixture 或日志输出。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：记录 Muse 连接器由写死 Action ID 演进为 Next.js Turbopack 动态嗅探的架构决策。
