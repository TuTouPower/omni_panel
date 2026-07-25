> 验证方式：API（schema 校验 + IPC 透传）。新增自 t107。

# connector-auth

连接器 manifest 显式声明认证方式，作为渲染层选择「添加账号」表单的单一真相源。

## 背景

此前 `AddAccountDialog.tsx` 使用硬编码 `VENDOR_AUTH_MAP` 推断认证方式，导致 grok/exa/cpa 等厂商的表单与 manifest 真实能力脱钩。本 spec 引入 manifest 级 `auth` 描述符，由渲染层 registry 读取，替代硬编码映射。

## auth 描述符

```ts
interface AuthDescriptor {
    method: "apikey" | "oauth_device" | "web_login" | "cpa_mgmt" | "local_cli";
    secret_name: string; // 保存到 vault 的 secret 键名
    extra_fields?: string[]; // 除 secret 外还需用户填写的字段名（如 exa 的 API_KEY_ID）
    login_url?: string; // web_login / oauth_device 的登录入口
    require_endpoint?: boolean; // 是否强制要求 endpoint override
}
```

## Schema

- 定义：`src/shared/schemas/auth.ts` 的 `authDescriptorSchema`。
- manifest 引入：`src/shared/schemas/manifest.ts` 顶层 `auth: authDescriptorSchema.optional()`。
- `PluginMetadata` 引入：`src/shared/schemas/plugin-metadata.ts` 顶层 `auth` 并 re-export `AuthDescriptor` / `AuthMethod`。

校验规则：

- `method` 必须为枚举值之一。
- `secret_name` 必填且非空。
- `extra_fields` 若存在，元素须非空字符串。
- `login_url` 若存在，须为合法 URL。

## IPC 透传

`src/main/ipc/connector-ipc.ts` 的 `metadata_from_definition` 将 `definition.manifest.auth` 原样放入 `PluginMetadata.auth`。未声明 `auth` 的连接器返回 `auth: undefined`，渲染层按 capabilities 回退推导。

## 内置连接器映射

| 连接器      | method       | secret_name    | 备注                                |
| ----------- | ------------ | -------------- | ----------------------------------- |
| grok        | oauth_device | OAUTH_TOKEN    | 设备码 OAuth 流程                   |
| exa         | apikey       | SERVICE_KEY    | 额外字段 `API_KEY_ID`               |
| cpa         | cpa_mgmt     | cpa_mgmt_key   | 强制 endpoint override              |
| opencode_go | web_login    | SESSION_COOKIE | 登录入口 `https://opencode.ai/auth` |

其余 12 个内置连接器暂不补 `auth` 块，由 capabilities（`session` / `local` / 默认 `apikey`）回退推导。

## 渲染层消费

见 t108 `auth-flow-registry.ts`：`resolve_auth_method(connector)` 优先读 `metadata.auth.method`，缺失时按 capabilities 回退。
