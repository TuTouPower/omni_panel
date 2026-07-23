# Task spec

## 背景

review_20260723_opus：I14（`src/main/ipc/config-ipc.ts:432`）`CONFIG_GET_SECRETS` 只调 `assert_valid_sender`，未校验 sender 所在 route；preload route 分权是唯一防线。被 XSS 的非设置窗（或 contextIsolation 被绕过）可直接拉所有明文密钥。I15（`src/main/ipc/helpers.ts:24`）`url.startsWith("file://")` 任意路径放行，未限到打包 index.html 路径。与 C1（t054 决策 A 保持现状）叠加形成密钥访问链路的纵深防御缺失；t054 虽决策 LAN 开放，但 IPC route 分权是另一层（renderer 进程内隔离），应独立收紧。

## 范围

- CONFIG_GET_SECRETS：主进程解析 `event.senderFrame.url` hash 或维护 webContents→route 映射，非 setting route 直接拒绝。
- file:// 校验：pathname 须以 `index.html` 结尾（增量防御，拒非 renderer 入口的 file:// HTML）；完整 `rendererIndexPath` 白名单需 helpers 注入 path（架构改），标遗留另立 spike。
- helpers `url.startsWith(dev_url)` 前缀匹配改 origin 比对（minor，顺带）。

## 非范围

- 不改 local-api 端点 auth（t054 决策 A 保持 LAN 开放，本 task 仅 IPC renderer→main 分权）。
- 不改 preload 暴露面。

## 验收标准

- [ ] 非 setting route 调 CONFIG_GET_SECRETS 被拒。
- [ ] 非 index.html 的 file:// 调 IPC 被拒（endsWith 增量防御）；完整 rendererIndexPath 白名单遗留。
- [ ] dev_url 前缀匹配改为 origin 比对（防 `localhost:5173evil.com`）。
- [ ] 单测覆盖三路径；设置窗正常拉密钥回填不破坏。

## 依赖与约束

- 与 t054（C1）正交：t054 决策 LAN 开放（外部主机→local-api），本 task 收紧 renderer 进程内 IPC 越权（XSS 后横向）。两者不冲突。
