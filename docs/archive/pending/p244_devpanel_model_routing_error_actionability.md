# p244 开发面板模型路由错误文案不可操作：原始串透出 IPC、过度脱敏、快照损坏静默

- 现象：开发面板模型路由报 `Error invoking remote method 'devPanel:modelRoutingChannels': Error: New API request failed (HTTP 401)`——只给内部串，不说哪个配置、哪个字段、怎么修；同一次崩溃链上，快照读取失败则完全无声（面板显示「无快照」）。
- 影响：用户拿到 401/失败时无法自助定位（配置路径、是鉴权还是网络、要改哪一项），只能人工翻代码；快照损坏与「从未保存过」不可区分，出问题时没有日志线索。
- 根因：`src/main/core/dev-panel/model-routing.ts` 的错误处理四处不对称：
    1. **未归一**：`get_channels()` 与 `save_impl()` 的首个 `fetch_channels()` 直接把传输层错误抛出，而 `test()`、写入失败分支走 `public_error()` → 前者把 `New API request failed (HTTP 401)` 原样透出 IPC。
    2. **鉴权失败无指引**：401/403 与网络不可达、其它 HTTP 状态码在文案上不可区分，手里已有 `config_path` 却没用上。
    3. **`public_error()` 过度脱敏**：任何含 `session`/`token` 字样的原文都被整条替换成兜底串，把 `New API 配置缺少 base_url 或 session：<config_path>` 这类**已经可操作**的提示也吃掉（它只该脱敏凭据本身）。
    4. **快照读取静默**：`get_snapshot_info()` 读/解析失败 `return null`，与「文件不存在」同形。
- 已确认同类位点并集（本次一并修）：上述 1–4；`create_transport` 抛出的是不带状态码的普通 Error，是 1/2 无法区分失败类型的根因。
- 测试缺口：dev-panel 单测只有成功路径与 `test()` 的失败归一，没有 `get_channels()` 失败路径、没有鉴权失败文案断言、也没有快照损坏用例。补：本地 HTTP server 返回 401 → 抛错文案含配置路径与「系统令牌」语义；返回 500 → 通用 HTTP 文案；快照文件写入非法 JSON → 返回 null 且有 warn（与文件缺失的静默区分）。
- 线索：`.scratch/probe_new_api2.mjs`（只读探针，复现真实 401）；`.scratch/new-api-1.0.0-rc.36/middleware/auth.go:218-228`（401 来源）。相关实现 `src/main/core/dev-panel/model-routing.ts`；写入契约缺陷另见 p242。
- 处理：main-direct-fix
