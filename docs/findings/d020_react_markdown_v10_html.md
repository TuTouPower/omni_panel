# d020 react-markdown v10 默认丢弃原始 HTML（2026-08-06）

- 来源：t225
- 结论：react-markdown v10 默认**不渲染原始 HTML**——需显式配 rehype-raw 才把 HTML 当节点解析。会话内容不可信场景下，只装 react-markdown + remark-gfm（不装 rehype-raw、不 dangerouslySetInnerHTML）即满足「不把会话 HTML 当 HTML 执行」安全约束。测试侧 `img`/`script` 查询为 null 可真实拦截 rehype-raw 误配回归。
- 证据：t225 MarkdownMessage.test.tsx HTML 安全用例（script 注入 + img onerror 均不执行，`document.querySelector("img"/"script")` 为 null）。
- 影响：后续会话库/消息渲染沿用同一约束；新增 markdown 渲染库评估以「默认不解析 HTML」为安全前提。
- 现状：有效
