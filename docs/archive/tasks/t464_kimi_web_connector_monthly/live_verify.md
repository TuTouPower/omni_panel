# t464 真实本地验证记录

- 日期：2026-09-09（本机 Electron 手工验证；日志 UTC 时间为 2026-09-08 晚间）
- 环境：`out/main/index.js`，真实图形界面，Electron 42.2.0；Kimi 账号由用户在登录窗口完成网页登录。
- 结果：登录窗口请求实际出现 Cookie、Bearer `Authorization`、`x-msh-session-id`、`x-msh-device-id`；`GetSubscriptionStats` 返回 HTTP 200；connector 产出 3 条有效 observation，应用日志记录 `Connector kimi_web ... refreshed: 3 items`。
- 关键修复：登录窗口不再对 `kimi_web` 使用 1.5 秒自动关闭；登录捕获不再要求先离开登录域名；保存的 `SESSION_COOKIE` vault secret 为脱敏之外不可读的 JSON 会话材料，包含 Cookie/Bearer/session/device；quota 请求移除重复 `content-type`，避免 HTTP/2 `Header field "content-type" must only have a single value`。
- 安全：抓取工具只写 header 是否存在和 Cookie 名；真实凭据未写入仓库、日志或 fixture。手工摘要 `.scratch/kimi-manual-capture-summary.json` 仅为本地运行产物。
- 自动化回归：`pnpm test` 287 files / 3561 passed / 9 skipped；`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过；新增 connector 相关测试 2 passed，manifest contract 17 passed。
- 注意：测试 Electron profile 曾产生一个早期空的 Kimi Web 实例（无 secret），成功实例为后续创建的实例；其失败日志不代表成功实例失败。
