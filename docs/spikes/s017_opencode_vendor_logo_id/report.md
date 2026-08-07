# Spike report

## 问题

确认会话 source `opencode` 应映射到用量面板中哪个 `VendorMark` vendor id。

## 成功判据

在连接器清单、用量面板 provider 列表、logo 资源映射和既有测试中找到一致的 vendor id，并确认该 id 能渲染 OpenCode logo。

## 尝试

- 检查 `connectors/opencode_go/manifest.json` 的 connector id 与 provider 字段。
- 检查 `src/renderer/lib/provider-usage.ts` 的 provider 顺序和 `src/shared/schemas/plugin-output.ts` 的 provider schema。
- 检查 `src/renderer/components/Icon.tsx` 的 `VENDOR_THEME_LOGOS` 与 `tests/unit/renderer/components/icon.test.tsx` 的 logo 渲染测试。

## 证据

- `connectors/opencode_go/manifest.json` 将 id 和 provider 都声明为 `opencode_go`。
- `src/renderer/lib/provider-usage.ts` 的 `PROVIDER_ORDER` 包含 `opencode_go`。
- `src/shared/schemas/plugin-output.ts` 的 `usageProviderSchema` 包含 `opencode_go`。
- `src/renderer/components/Icon.tsx` 以 `opencode_go` 作为双主题资源键。
- `tests/unit/renderer/components/icon.test.tsx` 已用 `<VendorMark id="opencode_go" />` 验证 OpenCode 双主题资源。

## 结论

`opencode` 会话 source 应映射为 `opencode_go`。直接传入 `opencode` 会因没有对应资源键而使用通用 `overview` 兜底图形。结论由仓库内静态资源和既有测试交叉验证，可信度足够。

## 是否采纳

- 决定：是
- 理由：复用用量面板已有 OpenCode 双主题 logo，避免错误落入通用兜底图形。
- 后续 task：t246
