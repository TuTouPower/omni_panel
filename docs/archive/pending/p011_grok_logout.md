# p011 grok 网络故障被呈现为「已过期」，用户 logout 后无法重登（2026-07-31）

- 现象：期望——采集失败区分网络错误与凭证失效，网络恢复后自愈；实际——2026-07-31 07:19 起 `cli-chat-proxy.grok.com` 连接超时（请求挂起约 10.6s 无响应），poll 失败 → 历史观测标 stale → 卡片/账号行显示「已过期」+「采集失败」+「重新登录」。用户在设置里退出登录后尝试重登，device-code `login_start` 连接 `auth.x.ai` 超时失败（DNS 被污染，解析到 Facebook IP `2a03:2880:...:face:b00c...` / `31.13.90.33`），token 已被清空，之后 poll 一律 401，面板持续显示「已过期」。复现：断开/污染到 xAI 域名的网络让 grok poll 超时 → 观测标 stale → UI 呈现与凭证失效不可区分。
- 影响：grok 连接器用量展示；所有 OAuth poll 型连接器在网络抖动时都可能被误呈现为凭证失效，诱导破坏性 re-login（logout 清 token 不可逆）。
- 根因：环境问题为主 + 产品设计弱点。环境：本机到 xAI/Grok 域名不通（`auth.x.ai` DNS 污染；`cli-chat-proxy.grok.com` 连接超时）。产品：`ProviderAccountRow.tsx` 对任意 error 显示「重新登录」，不像卡片失败态用 `is_auth_error` 门控；refresh-service 对 OAuth（poll）连接器收到 401 无即时 `refresh_now` 兜底（自动重登仅 session 连接器）；「已过期」badge 语义是数据 stale，文案读作凭证过期。
- 测试缺口：现有测试只覆盖 auth 错误路径的 UI 状态，未覆盖「网络超时 → stale → 账号行 badge/按钮」组合断言；缺 refresh-service 对 OAuth 连接器 401/超时行为的集成测试。补测方向：renderer 层断言非 auth error 不显示「重新登录」；集成层覆盖 OAuth 连接器超时/401 的 stale 标记与恢复路径。
- 线索：`.scratch/grok-expired-2026-07-31/notes.md`；运行日志 `~/AppData/Roaming/OmniPanel/logs/app-2026-07-31.log`（07:19 首次超时、09:23:52 logout、09:23:59 login_start Connect Timeout、12:29:02 401）
- 处理：t172
