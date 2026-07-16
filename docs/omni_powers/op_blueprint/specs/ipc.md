<!-- omni_powers: blueprint/specs/ipc -->

# IPC 边界

主进程 ↔ 渲染进程通信契约。channel 真相源 `src/shared/types/ipc.ts`；安全边界见 `architecture.md` §3。

## 通道分组（`IPC_CHANNELS`）

| 组        | channel                                                                                                                                                                                                        | 用途                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| connector | `connector:list` / `getState` / `refresh` / `refreshAll` / `snapshot`                                                                                                                                          | 列连接器、取状态、刷新                    |
| config    | `config:get` / `save` / `saveSecrets` / `duplicate` / `export` / `import` / `changed`                                                                                                                          | 配置读写、密钥保存、导入导出              |
| event     | `event:stateChange` / `event:themeChange`                                                                                                                                                                      | 主→渲染推送                               |
| theme     | `theme:set`                                                                                                                                                                                                    | 渲染→主设主题                             |
| log       | `log:renderer` / `log:export`                                                                                                                                                                                  | 渲染日志转发、日志导出                    |
| popup     | `popup:reportContentHeight`                                                                                                                                                                                    | 渲染上报测得内容高度（窗口自适应）        |
| settings  | `settings:open` / `navigate` / `minimize` / `maximize` / `close`                                                                                                                                               | 设置窗控制                                |
| mainPanel | `mainPanel:hide` / `getMode`                                                                                                                                                                                   | 主面板 shell 动作                         |
| tray      | `tray:openPanel` / `refreshAll` / `togglePause` / `toggleAutostart` / `openSettings` / `checkUpdate` / `survey` / `sponsor` / `quit` / `restart` / `hide` / `reportMenuSize` / `pauseState` / `autostartState` | 托盘菜单动作                              |
| auth      | `auth:cookieLogin`                                                                                                                                                                                             | 通用 cookie 登录                          |
| grok      | `grok:loginStart` / `loginPoll` / `loginStatus` / `logout` / `refresh`                                                                                                                                         | Grok OAuth device-code 与 token 生命周期  |
| session   | `session:login` / `refresh`                                                                                                                                                                                    | 受控网页登录（见 `connector-session.md`） |
| test      | `test:tray-click`                                                                                                                                                                                              | **E2E only**，程序触发托盘点击            |

## 渲染 API（`UsageboardApi`，preload 暴露）

`window.usageboard` 命名空间：`connector` / `config` / `event` / `popup` / `main_panel` / `theme` / `settings` / `tray` / `auth` / `session` / `grok` / `logs` / `log`。`plugin` 段为 deprecated 别名（历史名遗留）。

Grok API 按 route 收窄：settings 暴露 `login_start` / `login_poll` / `login_status` / `logout` / `refresh`；popup 与 tray 仅暴露 `login_status`。共享类型用 `GrokSettingsApi | GrokReadonlyApi` 表达能力差异，settings-only 调用前须做 capability guard。

## 安全

- `SECURE_WEB_PREFS`：`contextIsolation:true` / `nodeIntegration:false` / `sandbox:true` / `webSecurity:true` / `allowRunningInsecureContent:false`（见 `window-management.md`）。
- IPC sender allowlist 强制（commit `5279a8b`），不依赖 `NODE_ENV`。
- `config:get` 返回 `{ config, hasSecrets }`，config 经 `redact_config_raw` 脱敏；日常不经 IPC 下发明文。
- `config:getSecrets` / `config:saveSecrets`：设置窗按 instance 读写 vault 明文（见 `secret-vault.md`）。popup/tray 的 `getSecrets`/`saveSecrets` 为 no-op stub。
- size-validation（`src/main/ipc/size-validation.ts`）守 popup 尺寸 IPC。

## 数据形状

- `ConnectorSnapshotDTO`：`idle | loading{updatedAt?,items?,badge?,chart?} | ready{items,updatedAt,badge?,chart?} | failed{error,updatedAt?,items?,badge?,chart?}`。
- `ConnectorInfo`：`instanceId` / `sourceInstanceId` / `stateId` / `name` / `displayName` / `enabled` / `source` / `supportedProviders` / `activeProviders` / `metadata` / `snapshot`。
- `IpcResult<T> = { ok:true, data:T } | { ok:false, error:IpcError }`。
- `SettingsOpenContext`：`{ instanceId?, provider?, accountId? }` —— 打开设置窗时的定位上下文（主面板已无账号「编辑」菜单；仍可用于其它跳转）。
