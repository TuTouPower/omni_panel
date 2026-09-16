# p242 开发面板模型路由的渠道读写契约与部署版本（new-api rc.36）不符

- 现象：开发面板模型路由报 `Error invoking remote method 'devPanel:modelRoutingChannels': Error: New API request failed (HTTP 401)`（打包版 2026-09-16）；经源码核对，即便换成有效令牌，**读**与**写**都仍不可用。
- 影响：模型路由面板读不到渠道 / 保存必然失败。
- 根因（三条，均按部署版本源码核对）：
    1. **响应形状判错（读路径）**：rc.36 的 `model.Channel` 是 `Id int \`json:"id"\``、`Status int`（1=启用，2=手动禁用，3=自动禁用）、`Models string`（逗号分隔）、`ModelMapping \*string`（JSON 字符串）。面板的 `channel_from_raw`只用`string_value`取`id`/`status`→ 数字 id 判空后**整个渠道被丢弃**（列表恒为空）；status=2/3 落到默认`"enabled"` → 禁用渠道被当成启用，`is_default_enabled\` 会把它纳入改写范围。
    2. **写入 URL/body 形状不符**：rc.36 只注册 `PUT /api/channel/`（`router/channel-router.go:51`），id 从 **body** 读（`controller/channel.go:1042-1057` 的 `PatchChannel` 内嵌 `model.Channel`，随后 `GetChannelById(channel.Id, true)`）；面板原用 `PUT /api/channel/<id>` 且 body 无 id → `GetChannelById(0)` 必然失败。用户自己的 `my_file/server/relay/new_api/README.md` 写的正是「`PUT /api/channel/`，body 含 id」。
    3. **id 类型**：Go 侧 `Id int`，body 里的 id 必须是数字；面板内部把 id 存成字符串，直接透传会被 JSON 解码拒绝。
- 修复：`id_value`/`channel_status` 同时接受 number 与 string（数字 id → 十进制字符串；数字 status 按 new-api 语义映射启用/禁用）；写入改为 `PUT /api/channel/` + `{ id: <整数>, models, model_mapping, priority? }`，非整数 id 报「渠道 ID 不是整数」并按单渠道失败处理。
- **更正先前判断**（避免后续误改）：曾记「部分更新会清空 key/name/group」——不成立。`model.Channel.Update()` 用 `DB.Model(channel).Updates(channel)`（rc.36 `model/channel.go:591`），GORM 传结构体时**跳过零值字段**，未提交的 key/name/group/type/base_url 会被保留；`GET /api/channel/:id` 反而 `Omit("key")`，所以「先读全量再合并」既不可能也没必要。唯一受影响的是 `priority: 0`（零值被跳过），面板只会下发 ≥1 的自动优先级，无实际影响。
- 配置侧（触发 401，非本条修复范围）：`~/kar/code/my_file/config/files/new_api.yaml` 的 `session` 不是 rc.36 接受的凭据。只读探针 `.scratch/probe_new_api2.mjs` 实测 `GET /api/status → 200`（`version: v1.0.0-rc.36`）、`GET /api/channel/?p=1 → 401 {"code":"AUTH_UNAUTHORIZED","message":"Unauthorized, invalid access token"}`，带不带 `New-API-User` 头相同；rc.36 `middleware/auth.go:218-228` 在 `service.ErrAuthTokenInvalid` 时返回该 code，`docs/authentication.md:3,146` 明确 `New-Api-User` 已不参与鉴权。用户需在控制台「个人设置 → 安全设置」取系统令牌写入 yaml。
- 测试缺口：原 dev-panel 单测的 fixture 全部使用**字符串** id 与字符串 status（`channel("supported", 1)`、`status: "disabled"`），既不触达数字 id 的丢弃路径，也掩盖了 PUT 形状错误（断言按 `path.split("/").at(-1)` 取 id）。补：数字 id/status 的真实响应形状用例（含 status=2/3 判禁用、models 逗号串、model_mapping JSON 串）；写请求断言 `path === "/api/channel/"` 且 body 携带整数 `id`。
- 未验证项：`[deploy]` 端到端读写需有效系统令牌（本机 yaml 令牌已被拒），且 PUT 会改动用户真实路由，agent 不宜自行施加。
- 线索：`.scratch/probe_new_api2.mjs`（只读探针，不打印令牌）；`.scratch/new-api-1.0.0-rc.36/`（源码副本：`model/channel.go`、`controller/channel.go`、`router/channel-router.go`、`common/page_info.go`、`docs/authentication.md`）。
- 处理：main-direct-fix
- 实测补充（2026-09-17，用户提供有效访问令牌后）：用该令牌对真实部署跑面板读路径（临时配置 + `create_dev_panel_model_routing_manager`，探针 `.scratch/probe_dev_panel_read.ts`）→ `get_config()` 正常，`get_channels()` 返回 **13 条渠道**，数字 `id`（39/38/6/66/72…）、`status` 2/3 判为禁用、`priority`、逗号分隔 `models` 全部解析正确 → **读路径在真实数据上验证通过**。写路径（`PUT /api/channel/`）仍未实测：需对某条真实渠道做一次回写，未获授权执行。
- 修复补充（2026-09-17）：本机 `new_api.yaml` 的模型条目是 `- name: X` + `alias:` 多键形式，而面板自带的 YAML 子集解析器只对「值还是对象」的列表项压栈，导致每条的 `alias`（及 `context`/`multimodal`）整行被丢弃；同时别名表只读顶层 `aliases:`。两处均已修（列表项一律压栈；别名表合并模型内嵌 `alias` 与顶层 `aliases`，同键顶层优先），并补单测。
