# p170 chart palette 缓存 key 不含 root（latent API 陷阱）

- 来源：t350 遗留（2026-08-13，t350_gen_f002 minor）
- 内容：`resolve_chart_palette(theme, root)` 缓存 key 为 `${theme}:${revision}` 不含 root；root 仅首次构建生效，后续命中可能返回以不同 root 构建的 palette。当前全部生产调用方走默认 documentElement，无实际错误。改进方向：root 纳入 key、或删 root 参数、或文档注明 root 仅作构建上下文。
- 处理：未开
