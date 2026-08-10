# web 添加账号 cookie 登录轮询对齐与轮询去重

## 背景

web 编辑实例 cookie 登录已采用 `cookieLogin` + `cookieLoginStatus` 轮询；web 添加账号（无 `instance_id`）此前走阻塞式 `session.login`，刷新会丢捕获结果，且与编辑路径轮询逻辑重复。

## 行为

- **有 instance_id 的 web 编辑路径**：`SettingsForm` 与 `WebLoginSection` 共用 `src/renderer/lib/cookie_login_poll.ts`（`poll_cookie_login`）：触发 `auth.cookieLogin` 后 250ms 轮询 `cookieLoginStatus`，120s 超时；冲突/超时/无 cookie 文案为中文。
- **web 添加账号（无 instance_id）**：仍用阻塞式 `session.login`（匿名捕获不写 vault，结果经响应回传）。UI 展示降级指引「登录期间请勿刷新页面；若中断或超时，请手动粘贴 Cookie 后保存」；保留手动粘贴保存。冲突/超时英文原文经 `format_cookie_login_error` 映射为中文。
- **桌面路径**：`WebLoginSection` 继续 `session.login`（含 instance 时 cookie 写 vault / 匿名返回 cookie），不切 cookieLogin 轮询。

## 实现落点

| 路径 | 说明 |
| ---- | ---- |
| `src/renderer/lib/cookie_login_poll.ts` | 共享轮询、超时常量、中文错误映射 |
| `src/renderer/components/WebLoginSection.tsx` | web+instance 用共享轮询；web 匿名降级指引；桌面 session.login |
| `src/renderer/components/SettingsForm.tsx` | `handle_session_login` 调用 `poll_cookie_login` |
| `src/main/ipc/auth-ipc.ts` | `startCookieLogin` 并发 CONFLICT（中文）既有行为，补测覆盖 |

## 验收

- AC-001：web 添加路径有降级指引 + 手动粘贴可恢复
- AC-002：两组件共用同一 poll 实现与文案
- AC-003：CONFLICT 中文，无英文原始消息
- AC-004：120s 超时中文提示
- AC-005：桌面 cookie 登录仍 session.login
