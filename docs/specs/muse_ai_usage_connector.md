# Muse AI 网页用量连接器与会话保持

## 1. 范围与意图

将 Muse AI（Meta 智能体平台）用量与额度接入 OmniPanel，采用 Web 会话登录（`session` / `web_login`）模式，支持网页登录捕获 Cookie、后台常驻保活与凭据失效时自动隐藏窗口重登。

## 2. 外部契约与协议

- **登录地址**：`https://muse.ai/`
- **捕获 Cookie**：`hatch_sess`、`hatch_gw`、`hatch_vml`、`datr`
- **用量接口**：以 POST 调用 Next.js Server Action（`fetchSubscriptionAction`），携带会话 Cookie 解析 RSC（React Server Components）流式响应体。
- **输出指标**：
    - `muse:weekly`：周期限额（百分比、重置时间戳）
    - `muse:extra`：从不过期额外词元额度

## 3. 动态发现与缓存策略（t530）

- **动态发现算法**：首屏提取脚本分包清单，经 `ctx.pool.map`（并发上限 4）边下载边扫描。首个命中 `fetchSubscriptionAction` 的分包立即中止其余下载（命中即停）；若未直接命中，通过设置组件语义链接提取目标异步分包并扫描。
- **发现结果缓存（`ctx.discovery`）**：签名由 `deployment_id` 与脚本清单哈希复合生成。同签名刷新直接复用已缓存 Action ID，分包 GET 请求降为 0（仅保留 1 次首页验证）。
- **废除基准静默回退**：彻底移除历史硬编码 baseline Action / Deployment ID，发现失败且无显式手动参数覆盖时抛出 `DISCOVERY_EMPTY`，杜绝旧 ID 掩盖版本漂移。
- **显式手动逃生模式**：支持通过 `ACTION_ID` 与 `DEPLOYMENT_ID` 参数手动显式覆盖。

## 4. 错误与重登契约

- `SESSION_EXPIRED`：Cookie 缺失、过期或无效（服务端返回 `Authentication required`、401/403 或重定向），连接器抛出包含 `SESSION_EXPIRED` 的错误，由 `is_auth_error` 识别触发自动重登。
- `ACTION_STALE`：服务端以 404 或 `Invalid Server Action` 拒绝 Action 请求时，主动使 `ctx.discovery` 缓存失效，抛出 `ACTION_STALE` 错误并于下轮自动触发重新发现。
- `DISCOVERY_EMPTY`：动态分包扫描未找到 Action ID 且无手动覆盖参数时的显式失败。
- `BUDGET_EXHAUSTED`：整体执行或网络等待触及执行预算软截止时的协作退出信号。
