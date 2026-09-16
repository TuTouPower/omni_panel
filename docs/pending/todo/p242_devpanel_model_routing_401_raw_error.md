# p242 开发面板模型路由：渠道接口 401 原样透出 IPC，且写入契约与部署版本（new-api rc.36）不符

- 现象：打开开发面板模型路由报 `Error invoking remote method 'devPanel:modelRoutingChannels': Error: New API request failed (HTTP 401)`（打包版 2026-09-16 实测；该串只在 UI 出现，主进程日志无对应条目）。
- 影响：渠道列表整块失败且文案不可操作；另经源码核对发现**写入路径与该版本契约不符**（见下），即使用户换到有效令牌，保存也会失败/破坏渠道。
- 根因（分两层，均已核对到证据）：
    - **触发条件（配置侧）**：`~/kar/code/my_file/config/files/new_api.yaml` 的 `session` 不是部署版本接受的凭据。只读探针 `.scratch/probe_new_api2.mjs` 实测 `http://localhost:30001`：`GET /api/status → 200`（服务健康，`version: v1.0.0-rc.36`），`GET /api/channel/?p=1 → 401 {"code":"AUTH_UNAUTHORIZED","message":"Unauthorized, invalid access token"}`；带与不带 `New-API-User` 头结果相同。对照部署版本源码（`.scratch/new-api-1.0.0-rc.36/`）：`middleware/auth.go:218-228` 在 `service.ErrAuthTokenInvalid` 时返回该 code/文案；`docs/authentication.md:3,146` 明确「`New-Api-User` 不再参与鉴权，`Authorization: Bearer <PAT>` 即可」。故 `my_file/server/relay/new_api/README.md` 的「不加 `New-API-User: 1` 一定 401」已过时，**"产品缺 New-API-User 头" 的假设经此排除**；用户需在控制台「个人设置 → 安全设置」取系统令牌（README 亦警告不要用普通用户 token）写入 yaml。
    - **产品侧缺陷（可修，已按 rc.36 源码核对）**：
        1. **写入契约不符**：`model-routing.ts:724-731` 用 `PUT /api/channel/<id>` + body `{models, model_mapping, priority}`。rc.36 的 `router/channel-router.go:51` 只注册 `PUT /`（即 `/api/channel/`），id 从 **body** 读（`controller/channel.go:1042-1057` 的 `PatchChannel` 内嵌 `model.Channel`，`UpdateChannel` 随即 `GetChannelById(channel.Id, true)`）→ 面板的 URL 形状与 body 都拿不到 id，`GetChannelById(0)` 必然失败。用户 README 写的正是「`PUT /api/channel/`，body 含 id」。
        2. **部分更新会破坏渠道**：body 只带三个字段，而 `channel.Update()` 是整行覆盖；缺 `key` 会把 `Key` 清空、缺 `name/group/type/base_url` 会被置零。正确做法只能是用户 README 所述「先读再合并」：`GET /api/channel/:id`（含 key）→ 合并后再 PUT 全量 body（含 id）。
        3. **错误未归一**：`get_channels()`（`:664-668`）与 `save_impl()` 的首个 `fetch_channels()`（`:676`）直接抛原始错误，而 `test()`（`:789-791`）、写入失败（`:753`）经 `public_error()` → 前者把 `New API request failed (HTTP 401)` 原样透出 IPC，且无「哪个配置、怎么修」信息。
        4. **`public_error()` 过度脱敏**（`:638-642`）：含 session/token 的原文一律换成兜底串，把 `New API 配置缺少 base_url 或 session：<config_path>` 这类**已经可操作**的提示也吃掉。
        5. **快照读取静默**（`:794-807`）：`get_snapshot_info()` 读/解析失败 `return null`，无法区分「从未保存过快照」与「快照文件损坏」——与 3 反向的不一致。
- 已排除的假设（避免重复排查）：**分页无 off-by-one**——rc.36 `common/page_info.go:41-56` 对 `p<1` 做兼容（`p=0` 视为第 1 页），面板从 `p=1` 起即第 1 页，用户 README 的 `p=0` 只是兼容写法；`model_mapping` 必须传 JSON 字符串，面板 `JSON.stringify` 正确。
- 测试缺口：现有 dev-panel 单测只覆盖成功路径与 `test()` 的失败归一，没有 `get_channels()` 失败路径、没有「写渠道的 URL/body 形状符合契约」「部分更新不覆盖未提交字段」、也没有 `get_snapshot_info()` 损坏文件的断言。应补（用注入的 fake transport，无需真实服务）：401 → 抛错文案含配置路径与「令牌/凭证」语义且不含裸 HTTP 码；写入请求的 method/path/body（含 `id`，且保留原字段）；快照损坏 → 可区分结果。
- 未验证项：写渠道路径的端到端行为需有效 PAT 才能实测（本机 yaml 令牌已被拒），属 `[deploy]` 级验证；本次仅按 rc.36 源码契约修正形状并用 fake transport 单测覆盖。
- 线索：`.scratch/probe_new_api2.mjs`（只读探针，不打印令牌）；`.scratch/new-api-1.0.0-rc.36/`（源码副本，含 `router/channel-router.go`、`controller/channel.go`、`common/page_info.go`、`docs/authentication.md`）。相关实现 `src/main/core/dev-panel/model-routing.ts`、IPC `src/main/ipc/dev-panel-ipc.ts`。
- 处理：未开
