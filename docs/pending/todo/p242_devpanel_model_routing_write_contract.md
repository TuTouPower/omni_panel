# p242 开发面板模型路由的渠道写入契约与部署版本（new-api rc.36）不符

- 现象：开发面板模型路由的渠道列表报 `Error invoking remote method 'devPanel:modelRoutingChannels': Error: New API request failed (HTTP 401)`（打包版 2026-09-16 实测）；渠道列表整块失败。经源码核对，**即使换成有效令牌，保存路径也会失败**（原因见下）。
- 影响：模型路由面板的「保存」不可用；即便能发出请求，部分更新还会覆盖渠道的 key/name/group 等未提交字段，可能直接弄坏渠道。
- 根因（**产品侧缺陷，已按部署版本源码核对**；触发条件见「配置侧」）：
    1. **PUT 形状不符**：`model-routing.ts` 用 `PUT /api/channel/<id>` + body `{models, model_mapping, priority}`。rc.36 的 `router/channel-router.go:51` 只注册 `PUT /`（即 `/api/channel/`），且 id 从 **body** 读（`controller/channel.go:1042-1057` 的 `PatchChannel` 内嵌 `model.Channel`，`UpdateChannel` 随即 `GetChannelById(channel.Id, true)`）→ 面板的 URL 形状与 body 都拿不到 id，`GetChannelById(0)` 必然失败。用户自己的 `my_file/server/relay/new_api/README.md` 写的正是「`PUT /api/channel/`，body 含 id」。
    2. **部分更新会破坏渠道**：body 只带三个字段，而 `channel.Update()` 是整行覆盖；缺 `key` 会把 `Key` 清空、缺 `name/group/type/base_url` 会被置零。正确做法即用户 README 所述「先读再合并」：`GET /api/channel/:id`（`router/channel-router.go` 已注册该路由）取回原对象 → 合并 `models`/`model_mapping`/`priority` → 再 `PUT /api/channel/` 全量 body（含 id）。
- 配置侧（触发 401，非本 task 修复范围）：`~/kar/code/my_file/config/files/new_api.yaml` 的 `session` 不是 rc.36 接受的凭据。只读探针 `.scratch/probe_new_api2.mjs` 实测：`GET /api/status → 200`（服务健康，`version: v1.0.0-rc.36`）、`GET /api/channel/?p=1 → 401 {"code":"AUTH_UNAUTHORIZED","message":"Unauthorized, invalid access token"}`，带不带 `New-API-User` 头相同；rc.36 `middleware/auth.go:218-228` 在 `service.ErrAuthTokenInvalid` 时返回该 code，`docs/authentication.md:3,146` 明确 `New-Api-User` 已不参与鉴权。用户需在控制台「个人设置 → 安全设置」取系统令牌写入 yaml（README 亦警告不要用普通用户 token）。
- 已排除的假设（避免重复排查）：**分页无 off-by-one**——rc.36 `common/page_info.go:41-56` 对 `p<1` 做兼容（`p=0` 视为第 1 页），面板从 `p=1` 起即第 1 页；`model_mapping` 必须传 JSON 字符串，面板 `JSON.stringify` 正确；`Authorization: Bearer <token>` 单头即可。
- 测试缺口：现有 dev-panel 单测只覆盖成功路径与 `test()`，没有「写渠道请求的 method/path/body 符合 rc.36 契约」的断言，也没有「读-合并-写不丢未提交字段」的用例。应补（注入 fake transport，无需真实服务）：断言 `PUT /api/channel/` + body 含 `id` 且保留 `name/group/type/base_url/key` 等原字段；`GET /api/channel/:id` 被调用。
- 未验证项：`[deploy]` 写路径的端到端行为需有效系统令牌才能实测（本机 yaml 令牌已被拒），且 PUT 会改动用户真实路由，agent 不宜自行施加。
- 线索：`.scratch/probe_new_api2.mjs`（只读探针，不打印令牌）；`.scratch/new-api-1.0.0-rc.36/`（源码副本：`router/channel-router.go`、`controller/channel.go`、`common/page_info.go`、`docs/authentication.md`）。
- 关联：错误文案与可操作性部分已单列 p244 并在 main 修掉，不在此条目范围。
- 处理：未开
