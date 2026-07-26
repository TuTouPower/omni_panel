# Task spec

## 背景

Grok 添加账号的设备码登录界面（`src/renderer/components/GrokLoginSection.tsx:92` 与 `src/renderer/components/forms/OAuthDeviceForm.tsx:102`）当前展示存在两个问题：

1. 「请访问」链接的**显示文本**是 `verification_uri`（短地址，不含设备码），只有 `href` 用了 `verification_uri_complete ?? verification_uri`。用户看到的地址不全，手动复制会得到不带码的地址。
2. 链接下方单独显示「输入代码：`<user_code>`」。若完整地址已带设备码参数，这行冗余。
3. 主进程全局没有 `setWindowOpenHandler`（全 `src/main` grep 无匹配），`<a target="_blank">` 在 Electron 里不会走系统默认浏览器，点击体验不确定（可能开 Electron 窗口或被拒）。

## 范围

- 「请访问」链接文本与 href 都使用完整授权地址（带设备码参数）：优先 `verification_uri_complete`；服务端未返回时由前端/主进程用 `verification_uri` + `user_code` 按 Grok 实际参数名拼接（实现时先抓真实响应确认参数名，如 `?user_code=`）。
- 完整地址可用时，移除「输入代码」行；完整地址不可用（拿不到 user_code 的异常情况）保留该行作兜底。
- 点击链接在**系统默认浏览器**打开：为相关窗口（设置/主面板窗口，`src/main/window/window-manager.ts`）加 `setWindowOpenHandler`，http(s) 链接一律 `shell.openExternal` 并 `deny` 新窗口。
- Kimi 复用同一 `OAuthDeviceForm`，同成分享受上述修复；若 Kimi 服务端不返回 `verification_uri_complete`，同样走拼接兜底（参数名以 Kimi 实际为准，实现时确认）。

## 非范围

- 不改设备码轮询、token 保存逻辑。
- 不改 `src/main/index.ts:418` session 登录窗口的行为（那是独立 BrowserWindow 流程）。

## 验收标准

- [ ] Grok 登录界面展示的「请访问」地址完整可见且带设备码参数；无「输入代码」行（完整地址可得时）。
- [ ] 点击该地址在系统默认浏览器打开完整授权页，应用内不弹新 Electron 窗口。
- [ ] 服务端不返回 `verification_uri_complete` 时拼接兜底生效，地址仍完整。
- [ ] Kimi 登录界面同成分修复（同一表单组件）。
- [ ] 新增/更新组件测试覆盖上述展示与兜底分支；黑盒 `pnpm test` 通过。

## 依赖与约束

- 前置：无。
- 约束：`setWindowOpenHandler` 只允许 http(s) 外链走 `openExternal`，其余一律 `deny`，防任意 scheme 注入。
