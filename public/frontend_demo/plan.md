# Coding Agent 会话历史查看工具 — 前端 Demo 计划

## 目标
一个前端 demo：查看多种 Coding Agent（claude code、grok build、opencode、codex、cursor、aider 等模拟数据）的会话历史。
- 支持同时打开 1–6 个会话（多栏并排布局）
- 用户可方便地复制：单会话中某几段记录，或跨会话的某几段记录（批量选择 → 一键复制/导出 Markdown）

## Stage 1 — 读取技能
加载 `vibecoding-webapp-swarm`（React 设计优先流程），只读本阶段需要的文件。

## Stage 2 — 构建（委托 coder 子代理或主线实现）
技术：React + TypeScript + Tailwind + shadcn/ui，纯前端（本地 mock 数据，无后端）。
核心功能：
1. **会话源面板**：左侧 Agent 列表（Claude Code / Grok Build / OpenCode / Codex / Cursor / Aider），每个 agent 下有多条历史会话，点击打开到工作区。
2. **多栏工作区**：1–6 个会话栏并排（可拖拽调宽/关闭），每栏独立滚动渲染消息流（user/assistant/tool call 块）。
3. **选择复制**：每条消息块有复选框/点选高亮；底部浮动工具条显示已选 n 段，支持：
   - 复制为 Markdown（含 agent 名、角色、时间戳）
   - 复制为纯文本
   - 按会话分组复制
   - 跨会话混合选择
4. **Mock 数据**：内置 6+ 个 agent × 若干会话的真实感编程对话（含代码块、tool_use 块）。

视觉：低饱和暖色、充分留白、清晰层级；暗色代码块；避免蓝紫渐变。

## Stage 3 — 验证与交付
- 构建通过（vite build）
- 用 website_version_manager build_version 交付版本卡片
