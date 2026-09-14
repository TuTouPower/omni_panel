# Web 面板（浏览器访问）

> 范围：让用户在局域网浏览器里查看并操作用量面板、设置面板、代理面板。桌面 app 启动时开启本地 HTTP server。

## 1. 定位

- 桌面 app（Electron）启动时拉起 `local-api` HTTP server，默认绑 `0.0.0.0:18263`（被占则回退系统随机端口）。
- 同一份 React UI 编译为浏览器可加载的 SPA（`pnpm build:web` → `out/web/`），由 local-api 静态托管。
- 浏览器里的 `window.usageboard` 由 `src/web/usageboard-web.ts` 提供，fetch local-api REST 端点。
- 托盘菜单「网页访问」项用系统浏览器打开 `http://localhost:<port>/`，走 `tray:openWeb` 通道（`src/shared/types/ipc.ts` `TRAY_OPEN_WEB`）。

## 2. 安全决策（已确认）

- **局域网使用，不考虑安全**：server 绑 `0.0.0.0`，web 路由免 Bearer 认证。
- **secrets 明文返回**：`GET /v1/secrets` 返回 API key/cookie 明文。局域网任意设备可读。
- **ingest 保留 token**：`POST /v1/ingest` 仍需 Bearer（不破坏现有采集客户端）。
- **native 操作隐藏**：Electron-only 控件（隐藏到托盘、窗口 min/max/close、重启、开机自启、托盘菜单）在 web 隐藏或 no-op。判定依据 `src/renderer/lib/is-web.ts`（`<html data-web>` 由 `install_web_usageboard` 设置）。

### 2.1 风险接受说明（review_20260723_opus C1 评估，2026-07-23）

review C1 指出当前暴露面超「只读 panel」初衷：同 LAN 任意主机除读明文密钥外，可 `POST /v1/config` 篡改配置、`POST /v1/secrets` 注入密钥、`POST /v1/connectors/*/refresh` 触发刷新（敏感写端点均落 `check_auth` 前，见 `src/main/core/local-api/server.ts` 路由顺序）。

经评估 4 方案（A 保持现状 / B 端点分级 / C 绑定收紧 / D 全收紧），**决策 A 保持现状**：遵循本节原决策，不收紧。接受风险前提为部署环境（家庭/办公 LAN 可信）。若后续部署到不可信网络，需重评改 B/C/D。

### 2.2 风险接受补充（Grok 全仓评审，2026-08-11）

Grok 评审重申 §2 暴露面，并点名 t054 之后新增的免认证端点（未入 2.1 决策记录）：

- `POST /v1/control/{refresh-all,pause,resume,restart,quit}`（t276 控制平面）——LAN 任意主机可触发刷新/暂停/重启/退出应用。
- OAuth / cookie / session 登录端点（t278/t282，`/v1/auth/*`、`/v1/session/login`）——LAN 主机可驱动登录流程、诱导用户交互。

**决策：维持 A 不变**（2026-08-11 用户确认）。上述新增面与 §2/§2.1 同一风险接受前提（可信 LAN）；restart/quit 属控制面风险，一并接受。若部署环境变化或需要不可信网络访问，重评 §2.1 方案 B/C/D 时须覆盖本节新增端点。

## 3. 端点

|方法|路径|说明|认证|
|---|---|---|---|
|GET|所有非 `/v1/` 的 GET|web SPA 静态资源（未命中文件走 index.html）|无|
|GET|`/v1/health`|存活检查|无|
|GET|`/v1/records` `/v1/sessions` `/v1/buckets` `/v1/status`|代理面板数据（query: agent/env/start/end）|无|
|GET|`/v1/trend`|用量趋势序列（query: provider/accountId/metricId/days?=7）|无|
|GET|`/v1/connectors`|连接器列表|无|
|POST|`/v1/connectors`|触发全部连接器刷新|无|
|GET|`/v1/connectors/:id/state`|单连接器状态|无|
|POST|`/v1/connectors/:id/refresh`|触发单连接器刷新|无|
|GET/POST|`/v1/config`|设置面板配置读/写|无|
|GET/POST|`/v1/secrets`|密钥明文读/写（query/field: instanceId）|无|
|POST|`/v1/ingest`|observation 注入|Bearer|

## 4. 构建

- `pnpm build:web`：`vite build --config vite.web.config.ts`，产物 `out/web/`，复用 renderer `App`，入口 `src/web/main-web.tsx` 先 `install_web_usageboard()`。
- main 在 app ready 时按 `out/web`（dev）/ `resources/web`（packaged）注入 `web_root`；不存在则不托管静态资源。

## 5. 数据新鲜度

- connector/用量面板与会话推送（t414）：`usageboard-web` **每页只开 1 条** `EventSource('/v1/events?connectionId=…')`，同时承载 runtimeStore 状态（默认 `message`）、命名事件 `config` / `theme`、以及已订阅会话的 `messagesUpdated`。`onStateChange` 转发给 `use_plugins`，与桌面端 IPC `EVENT_STATE_CHANGE` 同源。会话 `sessionHistory.subscribe` 不再每会话新建 EventSource；在共享连接 `open`/重连后 POST 登记，`unsubscribe` 只卸该会话、不关共享流。连接关闭自动 unsub 该页全部会话订阅；EventSource 浏览器原生断线重连。避免 Chrome HTTP/1.1 同 origin 6 长连接上限饿死同源 fetch（p187）。
- tokenStats/代理面板：无 IPC/SSE 推送，`tokenStats.onUpdated` 由 `usageboard-web` 内部 10s 轮询触发。

## 6. 面板间导航

- 代理面板顶栏「用量面板」「设置」按钮：web 模式 hash 导航（`#usage`/`#setting`），Electron 模式调 `tray.open_panel`/`settings.open` 开窗口。
- 用量面板 web 模式顶栏有「代理面板」入口（Electron 从托盘进）。

## 7. 别名（目录/模型归并）

`config.dirAliases` / `config.modelAliases` 让多个目录/模型归为同一标签：

- `{ alias, dirs[] }`：目录归并（柱状图 project 横轴 + 项目维度 series）
- `{ alias, models[] }`：模型归并（柱状图 model 维度 series）

设置面板「其他」section 的 `AliasEditor` 增删改；`prepareBarData` 通过 `build_resolver` 应用。TokenStatsView 启动时 `config.get()` 拉取并透传给 BarChart。

归并策略（t428）：同一 key 出现在多个 alias 组时按**后声明覆盖**（最后声明的组为准），前端 prefs 归一与后端筛选展开共用该语义。

## 8. 未做 / 后续

- connector/session 写端点（账号增删、登录、刷新触发）：T7。
- SettingsView 窗口控制按钮的 `is_web` 精细化隐藏（当前 native 按钮在 web 点击为 no-op，不崩）。
- HTTPS / 跨网段访问 / 认证增强：按当前「局域网不考虑安全」决策不做。
- review_20260723_opus C1 评估（t054）：4 方案对比后决策 A 保持现状，风险接受说明见 §2.1。
