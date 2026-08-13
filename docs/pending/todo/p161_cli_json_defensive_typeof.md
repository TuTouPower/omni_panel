# p161 omni_panel.mjs 对恒 string 的 resolve/join 结果防御性 typeof 收窄

- 来源：t344 遗留（2026-08-13，t344_code_f003 minor）
- 内容：omni_panel.mjs 对恒为 string 的 `resolve`/`join` 结果做 `typeof x === "string"` 收窄，兜底值 `""` 语义错误（不可达死代码）。为消 TS 的 any 推断而加，属防御性噪音。改进方向：根治 .mjs 类型推断（如 esbuild/tsx 解析或统一类型声明），移除防御性 typeof。
- 处理：未开
