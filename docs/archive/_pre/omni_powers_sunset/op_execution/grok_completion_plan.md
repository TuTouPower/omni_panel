# Grok 用量查询收尾计划

## 背景

当前工作树已包含未完成的 Grok（SuperGrok）接入：OAuth device-code 登录、Vault token、billing connector、IPC/preload、设置页和测试。目标是在不覆盖现有 WIP、不改无关 Windows 测试修复前提下，完成可测试、可打包、可实际操作的闭环。

已确认：

- 官方 logo 源：`\\wsl.localhost\Ubuntu-22.04\home\testuser\archive\get_official_logo\lobehub_icons\svg\icons\grok.svg`，使用 `fill="currentColor"`。
- billing 测试记录了 2026-07-14 实测响应；保留已验证 endpoint `https://cli-chat-proxy.grok.com/v1/billing?format=credits`。
- TDD seams：`VendorMark` DOM/资源、真实 manifest + connector runtime、已注册 IPC handler、`GrokOAuthManager` 公共 API、SettingsView 用户路径、真实打包产物。

## 步骤

1. **导入 logo**

    - 复制官方源到 `src/renderer/assets/vendor_logos/grok_light.svg`，字节比较确认一致。
    - `grok_dark.svg` 仅把根 fill 派生为 `#fff`。
    - 先补 icon 测试，再删除 `Icon.tsx` 中不可达的 `VENDOR_MARKS.grok` fallback。
    - 验证：icon 定向单测 + 文件比较。

2. **修正 connector 契约**

    - 先补 manifest、connector 阈值/source、`week` schema/executor 测试。
    - `manifest.json` 改为 poll capability，删除未使用的 `local.paths`。
    - `connector.ts` 改为 `source: "poll"`，warning/critical 阈值与同类 connector 对齐为 75/90。
    - 不改已实测 billing endpoint。
    - 验证：manifest、Grok connector、observation schema、tier1 executor 定向测试。

3. **加固 IPC sender**

    - 先测试五个注册 handler 拒绝未知/外部 origin，并允许 `file://` renderer。
    - 所有 Grok IPC handler 入口复用 `assert_valid_sender`。
    - 验证：Grok IPC 和 helpers 定向单测。

4. **修复 OAuth 生命周期**

    - 先测试 logout 与 pending refresh 竞态、同实例并发 refresh 合并。
    - 增加 per-instance generation、token mutation queue、`refresh_in_flight`。
    - 保证 logout 返回后旧 refresh 不能恢复 token；同实例 refresh-token rotation 不并发。
    - terminal grant error 清 token 后停止 auto-refresh。
    - 不引入通用 OAuth/Vault 框架，不增加远程 revoke。
    - 验证：OAuth manager 全部单测。

5. **动态代理**

    - 先测试 manager 连续请求读取最新 proxy。
    - 固定 `proxy_url` 改为 `get_proxy_url()`；main 传入 `currentConfigSnapshot.proxy?.url` getter。
    - 保留现有系统代理探测支持，但避免把探测结果持久化为用户设置。
    - 同步 blueprint conventions。
    - 验证：proxy 定向测试 + typecheck。

6. **设置页组合验证**

    - 补 SettingsView → Grok 编辑表单 → GrokLoginSection 用户路径测试。
    - 验证 billing endpoint 不作为可编辑字段显示、主题 logo 使用图片资源。
    - 补 `verification_uri_complete = null` 回退、错误后重试、logout 失败状态测试。
    - 仅在测试暴露问题时最小修改 UI。

7. **全量验收**

    - `pnpm check`
    - `pnpm test`
    - `pnpm build`
    - `pnpm test:e2e`
    - `pnpm package`
    - `pnpm test:packaged`
    - 启动 `artifacts/win-unpacked/OmniUsage.exe`，验证 Grok 账号、明暗 logo、device-code UI、用量刷新和退出登录。
    - 若无可用 Grok 账户，明确标注真实上游授权未验证，不宣称完整闭环通过。

## 修改约束

- 不执行 reset/restore/stash，不覆盖当前未提交工作。
- 不改无关 `config-store.test.ts`、`net-client.test.ts` 等 Windows 兼容 WIP。
- 不导入 `~/.grok/auth.json`，不改已实测 billing endpoint。
- 每个切片严格 red → green；只格式化本次触及文件。
