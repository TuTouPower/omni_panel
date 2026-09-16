# p242 开发面板模型路由：渠道接口 401 以原始内部串透出 IPC，缺可操作提示（与 test/save 处理不一致）

- 现象：打开开发面板模型路由时报 `Error invoking remote method 'devPanel:modelRoutingChannels': Error: New API request failed (HTTP 401)`（打包版 2026-09-16 实测；该错误只出现在 UI，主进程日志无对应条目）。
- 影响：用户看到的是 IPC 原始错误串，无法从中知道「是哪个配置、哪种失败、怎么修」；渠道列表页直接整块失败，无降级视图。
- 根因：
    - **配置侧（触发条件）**：`~/kar/code/my_file/config/files/new_api.yaml` 里的 `session` 已失效。只读探针 `.scratch/probe_new_api.mjs` 用同一 base_url/令牌实测：`GET /api/status → 200`（服务本身健康，`http://localhost:30001`），`GET /api/channel/?p=1 → 401 {"code":"AUTH_UNAUTHORIZED","message":"Unauthorized, invalid access token","success":false}`。属凭据需要用户更新，非服务不可用。
    - **产品侧（可修部分）**：`src/main/core/dev-panel/model-routing.ts` 的错误处理不对称——`test()`（`:789-791`）与 `save_impl()` 的渠道写入失败（`:753`）都经 `public_error()` 归一（会剥掉 `Bearer\s+\S+`、把含 session/token 的原文换成兜底文案），而 `get_channels()`（`:664-668`）与 `save_impl()` 里的 `fetch_channels()`（`:676`）**直接抛原始错误**，于是 `New API request failed (HTTP 401)` 原样经 IPC 到 UI。且 401/无效令牌属可操作失败，却没有任何「更新配置里的 session」指引（配置路径 `config_path` 就在手上，未利用）。
- 同类位点（已确认同属一个修复面）：
    1. `model-routing.ts:664 get_channels()` — 原始错误透出（本次报错点）；
    2. `model-routing.ts:676 save_impl()` 的首个 `fetch_channels()` — 同样未包裹，保存路径会重复暴露同一原始串；
    3. `model-routing.ts:794 get_snapshot_info()` — 读取/解析失败静默 `return null`，用户无法区分「没有快照」与「快照文件坏了」（与 1/2 反向的不一致：一个太吵、一个太静）；
    4. `model-routing.ts:642 public_error()` 自身把「含 session/token 的原文」一律替换为兜底串，连 `New API 配置缺少 base_url 或 session：<config_path>` 这种**已经可操作**的提示也会被吃掉（该函数被 test/save 使用）——需要保留配置路径这类关键信息。
- 测试缺口：现有 dev-panel 单测只覆盖成功路径与 `test()` 的失败归一，没有「渠道接口 401/auth 类失败时 IPC 返回可操作文案」的断言，也没有 get_channels 失败路径的用例（UI 侧同理，无失败态渲染断言）。应补：transport 返回 401 → `get_channels()` 抛错文案含配置路径/「令牌」语义且不含裸 HTTP 状态码；`get_snapshot_info()` 损坏文件返回可区分结果。
- 线索：`.scratch/probe_new_api.mjs`（只读探针，只输出状态码与响应头 120 字节，不打印令牌）；配置键样例见 `~/kar/code/my_file/config/files/new_api.yaml`（`base_url`/`session`/`user_id`/`models`）。相关实现 `src/main/core/dev-panel/model-routing.ts`、IPC `src/main/ipc/dev-panel-ipc.ts`。
- 处理：未开
