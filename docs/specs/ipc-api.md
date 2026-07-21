# ipc-api

> 验证方式：API。拆自 ipc（t037）。

主进程 ↔ 渲染进程通信契约（API 可验证部分）。channel 真相源 `src/shared/types/ipc.ts`；安全边界见 `architecture.md` §3。这些 channel 在 web SPA（out/web）经 LocalAPI 端点等价暴露，可程序化 / web 验证。

## 通道分组（`IPC_CHANNELS`）

| 组         | channel                                                                                              | 用途                                       |
| ---------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| connector  | `connector:list` / `getState` / `refresh` / `refreshAll` / `snapshot`                                | 列连接器、取状态、刷新                     |
| config     | `config:get` / `save` / `saveSecrets` / `getSecrets` / `duplicate` / `export` / `import` / `changed` | 配置读写、密钥读写、导入导出               |
| event      | `event:stateChange` / `event:themeChange`                                                            | 主→渲染推送（web 可订阅）                  |
| log        | `log:renderer` / `log:export`                                                                        | 渲染日志转发、日志导出                     |
| tokenStats | `tokenStats:buckets` / `sessions` / `records` / `status` / `updated` / `open`                        | token 用量统计查询与面板入口（t026+）      |
| trend      | `trend:get`                                                                                          | 账号展开区 sparkline 走势（t006，近 N 天） |

## 数据形状

- `ConnectorSnapshotDTO`：`idle | loading{updatedAt?,items?,badge?,chart?} | ready{items,updatedAt,badge?,chart?} | failed{error,updatedAt?,items?,badge?,chart?}`。
- `ConnectorInfo`：`instanceId` / `sourceInstanceId` / `stateId` / `name` / `displayName` / `enabled` / `source` / `supportedProviders` / `activeProviders` / `metadata` / `snapshot`。
- `IpcResult<T> = { ok:true, data:T } | { ok:false, error:IpcError }`。
- `SettingsOpenContext`：`{ instanceId?, provider?, accountId? }` —— 打开设置窗时的定位上下文（用量面板已无账号「编辑」菜单；仍可用于其它跳转）。
