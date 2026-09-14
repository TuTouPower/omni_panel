# Web 配置操作与实时同步

## 1. 范围

Web SPA 通过 LocalAPI 完成配置实例管理、配置导入导出和配置/主题实时同步。导出含明文密钥只由用户主动选择触发，密钥不写入服务端持久化配置或日志。

## 2. 配置实例操作

LocalAPI 暴露以下免认证端点，行为与桌面版配置 IPC 对齐：

|方法|路径|请求体|成功结果|
|---|---|---|---|
|`POST`|`/v1/config/duplicate`|`{ "instanceId": string }`|`{ "instanceId": string }`|
|`POST`|`/v1/config/createInstance`|`{ "manifestId": string }`|`{ "instanceId": string }`|
|`GET`|`/v1/config`|无|当前 `AppConfiguration`|
|`POST`|`/v1/config`|`AppConfiguration`|保存成功|

`duplicate` 和 `createInstance` 保存配置后返回新实例 ID；Web 设置页重新读取配置后展示新实例。

## 3. 配置导出与导入

### 3.1 导出

`GET /v1/config/export?includeSecrets=false` 返回与 `--config` 导入兼容的原生 `AppConfiguration`，所有受信任 connector 的 secret 参数均已剥离。`includeSecrets=true` 返回相同形状的配置，并把 vault 中对应 secret 注入导出数据。

Web bridge 将响应下载为 `omni-panel-config-YYYY-MM-DD.json`。设置页默认不勾选含密钥选项；勾选时显示明文密钥风险提示。CLI 瘦客户端支持 `--cli export` 与 `--cli export --include-secrets`，输出与对应 LocalAPI 导出结果一致。

### 3.2 导入

`POST /v1/config/import` 接受原生 `AppConfiguration`，也接受 `formatVersion: 1` 的桌面导出包装格式。合法导入写入配置；包含 secret 的导入将 secret 转存 vault，规范 `config.json` 仍只保留非 secret 参数。

Web 导入在保存配置或密钥前拒绝未知 connector 路径和非空 `endpointOverrides`。坏 JSON、schema 不符、JSON `null` 以及不支持的包装版本返回 4xx 可读错误，且不破坏已有配置。取消文件选择器不发起请求并正常结束导入操作。

## 4. 配置与主题事件

所有 Web 实时事件使用 `GET /v1/events` SSE：

- 默认 `message` 事件携带 connector 状态变更 `{ instanceId, state }`。
- 命名 `config` 事件携带完整的非 secret `AppConfiguration`。
- 命名 `theme` 事件携带布尔值 `isDark`。

主进程配置保存和 native theme 变更会发布对应事件；Web bridge 为每个事件类型维护订阅者并转发到 renderer。Web 页面自身保存配置时先完成 HTTP 持久化，再通知当前页面订阅者；其他页面通过 SSE 收到同一变更，无需刷新。主题初始读取与实时事件按事件代次协调，旧的初始 GET 不能覆盖已收到的新事件。

## 5. 密钥边界

- 明文 secret 只允许出现在用户主动导出文件或用户主动提供的导入文件中。
- 不含密钥的导出和配置 SSE 不包含 secret 参数。
- 服务端日志、规范 `config.json`、vault 以外的持久化副本和默认 CLI 输出均不得包含明文 secret。
- 未在受信任 connector definitions 中的 executable path 在导入时拒绝，启动或导入后的健康清理也会移除不在 allowlist 中的插件。
