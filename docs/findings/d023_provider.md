# d023 工作台徽标复用用量面板 provider 资源（2026-08-07）

- 来源：s017 / t246
- 结论：会话 source 到用量面板 provider logo 的映射为 `claude_code`→`claude`、`kimi_code`→`kimi`、`grok`→`grok`、`opencode`→`opencode_go`；未知 source 使用 `overview` 兜底。`VendorMark` 负责复用单资源或双主题资源，工作台会话面板和左侧 rail 不应重新实现首字母徽标。
- 证据：`connectors/opencode_go/manifest.json`、`src/renderer/components/Icon.tsx` 的资源映射、`src/renderer/lib/provider-usage.ts` 的 provider 列表、`icon.test.tsx` 的 OpenCode 资源测试，以及 t246 组件测试对实际资源输出的断言。
- 影响：新增会话 source 或 provider 时，先确认用量面板的 vendor id，再扩展共享映射与组件测试；未知 source 必须保留非空 SVG 兜底。
- 现状：有效
