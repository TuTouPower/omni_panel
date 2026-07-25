# Task spec

## 背景

`AddAccountDialog.tsx:13` 的 `VENDOR_AUTH_MAP` 是渲染层硬编码，与 `connectors/*/manifest.json` 的真实能力脱钩，导致 grok 显示 API key 输入（实际应走设备码 OAuth）、exa 缺 `API_KEY_ID` 字段、cpa 被标成 apikey 后 duplicate 到 deepseek。病根是认证方式靠渲染层猜，而不是 manifest 显式声明。

t092（commit `0b80bf6`）把 cpa/grok/exa 塞进 `VENDOR_AUTH_MAP: "apikey"` 时未核对 manifest 的 secret 名与 capabilities，引入四个厂商添加流程全错。本 task 是修复链的第一步：在 manifest schema 中加 `auth` 块作为认证方式的唯一真相，让渲染层不再猜。

## 范围

- `src/shared/schemas/plugin-metadata.ts`：manifest zod schema 加 `auth` 可选块（`method` 枚举：`apikey` / `oauth_device` / `web_login` / `cpa_mgmt` / `local_cli`；`secret_name` 必填；`extra_fields` / `login_url` / `require_endpoint` 可选）。
- 四个内置 connector 的 `manifest.json` 补 `auth` 块：
    - `connectors/grok/manifest.json`：`oauth_device` + `secret_name: OAUTH_TOKEN`
    - `connectors/exa/manifest.json`：`service_key`（复用 `apikey` method）+ `secret_name: SERVICE_KEY` + `extra_fields: [API_KEY_ID]`
    - `connectors/cpa/manifest.json`：`cpa_mgmt` + `secret_name: cpa_mgmt_key` + `require_endpoint: true`
    - `connectors/opencode_go/manifest.json`：`web_login` + `secret_name: SESSION_COOKIE` + `login_url: https://opencode.ai/auth`
- `src/main/ipc/connector-ipc.ts`：`metadata_from_definition` 在 `PluginMetadata` 中暴露 `auth` 字段（透传 manifest.auth，未声明则为 undefined）。
- `src/shared/types/ipc.ts`：`PluginMetadata` 类型补 `auth?: AuthDescriptor`。
- 单测：`tests/unit/ipc/connector-ipc.test.ts` 补四个厂商 descriptor 断言；`tests/unit/schemas/plugin-metadata.test.ts` 补 auth 块 zod 校验（缺 secret_name 报错、method 枚举外报错）。

## 非范围

- 不动 `AddAccountDialog.tsx` 与 `VENDOR_AUTH_MAP`（t108 处理）。
- 不动 `SettingsView.tsx` 的 source 查找逻辑（t110 处理）。
- 其他 12 个 connector（claude/codex/antigravity/deepseek/glm/tavily/minimax/kimi/getoneapi/tikhub/mimo/firecrawl）的 manifest 不补 auth 块——它们的 `apikey`/`session`/`local` 靠现有 capabilities 推导已正确，仅当未来出现同类 bug 时再补。

## 验收标准

- [ ] `plugin-metadata.ts` schema 支持 `auth` 块，缺 `secret_name` 或 method 枚举外值时 zod 校验失败。
- [ ] 四个目标 connector 的 manifest.json 均含正确 `auth` 块，`pnpm typecheck` 通过。
- [ ] `connector-ipc.test.ts` 断言四个厂商的 `PluginMetadata.auth` 与 manifest 一致。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- 无前置 task。后续 t108 依赖本 task 的 `AuthDescriptor` 类型与 IPC 字段。
- manifest.json 改动会被 `manifest-loader` 在启动时 zod 校验，schema 必须向后兼容（`auth` 可选，缺失不报错）。
