# Task spec

## 背景

后端已支持用户 connector 目录（`userData/connectors`，`discover_connector_definitions` 扫 builtin + user），但 `connectorProviderSchema` 限制 provider 名为固定 enum（`usageProviderSchema.or(z.literal("cpa"))`），用户自定义 connector 的 provider 名不在 enum 内会被 manifest-loader 跳过（`load_definitions_from_dir` L47-52 检查 `connectorProviderSchema.safeParse`）。

用户要求能自行在脚本目录添加 connector（manifest.json + connector.ts），需放开 schema + 加文档。

## 范围

- `connectorProviderSchema`：从固定 enum 改为 `z.string().min(1)`（允许任意 provider 名），或在 enum 基础上加 `z.string().regex(/^[a-z][a-z0-9_]*$/)`（snake_case 格式约束）。
- `usageProviderSchema`（plugin-output.ts）同步放开或保持枚举（renderer 聚合层对未知 provider 的 fallback 处理）。
- `PROVIDER_LABELS` / `PROVIDER_ORDER`：对未知 provider 提供 fallback（label = provider 名、order 末尾）。
- `auto_seed_connectors`：确保 user_dir connector 不被 removedConnectorIds 意外拦截。
- 文档：`docs/guides/custom-connector.md`（manifest.json 格式 + connector.ts 模板 + 参数类型 + 示例）。
- 测试：manifest-loader 对自定义 provider 名加载成功；renderer 对未知 provider 不崩。

## 非范围

- 不实现 connector 脚本编辑器。
- 不改 connector runtime（vm sandbox）。
- 不改 secret/vault 机制。
- 不改 web panel 对未知 provider 的支持（后续）。

## 验收标准

- [ ] 用户在 `userData/connectors/my_vendor/` 放 manifest.json + connector.ts，app 启动后自动发现并 seed。
- [ ] manifest provider 为任意 snake_case 字符串均被接受。
- [ ] renderer 对未知 provider 显示 vendor mark fallback + provider 名作 label。
- [ ] 文档 `docs/guides/custom-connector.md` 含完整模板 + 示例。
- [ ] `pnpm test` / `pnpm typecheck` 全绿。

## 依赖与约束

- connector.ts 在 vm sandbox 内执行（无 import/export，`declare const ctx`），需文档说明约束。
- manifest.json schema 需文档化（parameters/endpoints/script/capabilities）。
- 与 t094（打开脚本目录按钮）协同。
- 大重构：schema 放开影响 renderer 聚合 / IPC / 配置 / provider-usage 多层。
