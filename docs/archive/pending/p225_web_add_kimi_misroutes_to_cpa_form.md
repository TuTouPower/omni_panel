# p225 Web 面板添加 Kimi 误路由到 CPA 管理端表单

- 现象：浏览器 Web 面板账号界面点“添加 Kimi”，弹窗标题“添加 Kimi 账号”、副标题“CPA 管理端授权”（CpaMgmtForm），Kimi 原生登录弹窗（OAuthDeviceForm，device-code 授权）不可达。用户确认 Claude / Codex 点添加同样显示 CPA 表单。
- 影响：Web 端无法为 Kimi / Claude / Codex / Antigravity 建原生账号（表单 auth_method=cpa_mgmt，manifest_id 会落 cpa，建出错误实例类型）；GLM 等非 CPA 覆盖 vendor 回退为默认 apikey 表单同样错误。桌面端不受影响（IPC catalog 正常）。
- 根因：产品缺陷，三段链条均已验证——(1) `src/web/usageboard-web.ts:317` web `connector.catalog()` 请求 `GET /v1/catalog`，而 `src/main/core/local-api/server.ts` 无此路由（仅 `/v1/connectors`=list），fetch 必 throw；(2) `useConnectorCatalog` catch 后 catalog 恒为 `[]`；(3) `AddAccountDialog.find_vendor` 回退分支 `plugin_infos.find(supportedProviders.includes)` 命中网关 CPA 实例——`supported_providers()` 对 CPA 取 monitor\_\* 全集且不过滤 monitor 开关（用户 CPA 实例 monitor_kimi=false 仍含 kimi），`resolve_auth_method` 得 cpa_mgmt。已确认同类位点：claude / codex / antigravity（CPA supportedProviders 全集内，复现脚本逐一验证同误路由）；catalog 回退分支对网关实例无排除是同 helper 误用。
- 测试缺口：`tests/unit/web/usageboard-web.test.ts` 只断言客户端 fetch `/v1/catalog`，无服务端路由存在性契约测试；`add_account_dialog.test.tsx` t121 组只覆盖 catalog 非空场景，无 catalog=[] + CPA 实例共存用例；`find_vendor` 回退分支无“跳过 gateway 源”约束测试。应补：server 路由级 catalog 存在性测试（web 桥全量路径审计仅此一处缺失）、dialog 在 catalog=[] + CPA 实例下 kimi 应为 oauth_device 的渲染测试。
- 线索：`.scratch/repro-kimi-cpa-misroute.ts`（`pnpm exec tsx` 运行，用真实 manifest discovery + handleConnectorCatalog + resolve_auth_method；场景 A catalog 正常→oauth_device，场景 B 空 catalog→cpa_mgmt，claude/codex/antigravity 同误路由，glm 回退 apikey）。
- 处理：t461
