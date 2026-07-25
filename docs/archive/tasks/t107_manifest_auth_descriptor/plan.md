# Task plan

## 步骤与验证

1. 在 `plugin-metadata.ts` 的 manifest schema 加 `authDescriptorSchema`（`method` 枚举 + `secret_name` + 可选字段）→ 验证：`tests/unit/schemas/plugin-metadata.test.ts` 红→绿（缺 secret_name 报错、非法 method 报错、合法块通过）。
2. 改 `src/shared/types/ipc.ts` 的 `PluginMetadata` 加 `auth?: AuthDescriptor` → 验证：`pnpm typecheck`。
3. 改 `connector-ipc.ts` 的 `metadata_from_definition` 透传 `definition.manifest.auth` → 验证：`tests/unit/ipc/connector-ipc.test.ts` 红→绿（grok/exa/cpa/opencode_go 四条断言）。
4. 改四个 `connectors/*/manifest.json` 补 `auth` 块 → 验证：`pnpm test` 全绿 + `pnpm typecheck`。
5. 手动验证：启动应用，devTools 调 `window.usageboard.connector.list()`，确认四个 connector 的 `metadata.auth` 非空 → 验证：console 输出符合预期。

## 风险与回退

- 风险：`manifest-loader` 启动时校验失败导致应用无法启动。 → 回退：`auth` 块在 schema 中设为 `.optional()`，缺省不报错；若四个 manifest 写错，git revert 对应 manifest.json 即可。
- 风险：`AuthDescriptor` 类型与后续 t108 的预期不一致。 → 回退：t108 开始前先对齐类型定义，必要时在本 task 内补 commit。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：「连接器运行时」小节补一句「manifest 可显式声明 `auth` 块作为认证方式唯一真相，替代渲染层硬编码」。
