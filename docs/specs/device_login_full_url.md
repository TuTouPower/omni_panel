# device_login_full_url

## 背景

Grok/Kimi 添加账号时的 OAuth 设备码登录界面，「请访问」链接的显示文本与 href 不一致：显示文本是短地址 `verification_uri`，只有 href 用了完整地址。用户复制/看到的地址不含设备码；且链接下方仍单独显示「输入代码」行，冗余。同时主进程未注册 `setWindowOpenHandler`，`<a target="_blank">` 在 Electron 内不会稳定走系统默认浏览器。

## 范围

- 设备码登录界面的「请访问」链接文本与 href 统一为完整授权地址：优先 `verification_uri_complete`；服务端未返回时用 `verification_uri` 拼接 `user_code`。
- 完整地址可用时移除「输入代码」行；`user_code` 缺失/为空等异常情况下保留该行作兜底。
- 为主面板/设置窗口注册 `setWindowOpenHandler`：仅 http(s) 外部链接调用 `shell.openExternal` 并 `deny` 新窗口；其余 scheme 一律 `deny`。
- Grok 与 Kimi 共用 `OAuthDeviceForm`，同成分修复。

## 非范围

- 不改设备码轮询、token 保存逻辑。
- 不改 `src/main/index.ts` 中 session 登录独立窗口的行为。

## 验收标准

- [x] Grok 登录界面展示的「请访问」地址完整可见且带设备码参数；无「输入代码」行（完整地址可得时）。
- [x] 点击该地址在系统默认浏览器打开完整授权页，应用内不弹新 Electron 窗口。
- [x] 服务端不返回 `verification_uri_complete` 时拼接兜底生效，地址仍完整。
- [x] Kimi 登录界面同成分修复（同一表单组件）。
- [x] 新增/更新组件测试覆盖上述展示与兜底分支；黑盒 `pnpm test` 通过。

## 依赖与约束

- 依赖 `vendor_forms_oauth_weblogin` 提供的 `OAuthDeviceForm` / `GrokLoginSection`。
- 约束：`setWindowOpenHandler` 只允许 http(s) 外链走 `openExternal`，其余一律 `deny`。

## 实现摘要（t156 固化）

- 新增 `src/renderer/lib/device-login-url.ts`：`build_device_login_url` 优先返回 `verification_uri_complete`，否则按 `?user_code=` 拼接。
- `OAuthDeviceForm.tsx` 与 `GrokLoginSection.tsx` 的链接文本与 href 均改用 `build_device_login_url(device_code)`；`device_code.user_code` 非空时隐藏「输入代码」行，为空时保留兜底。
- `src/main/window/window-manager.ts` 的 `createWindowFor` 中为每扇窗口注册 `setWindowOpenHandler`，仅 http/https 调用 `shell.openExternal`。
- 新增/更新测试：
    - `tests/unit/renderer/components/forms/oauth_device_form.test.tsx`
    - `tests/unit/renderer/components/grok-login-section.test.tsx`
    - `tests/unit/main/window_manager.test.ts`
