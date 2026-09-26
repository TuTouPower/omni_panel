# 会话历史查看 Demo

OmniPanel 会话历史前端 demo：多栏并排打开多个 coding agent 的会话，勾选跨会话消息段一键复制为 Markdown/纯文本（React + TypeScript + Vite + Tailwind，纯前端 mock 数据，无后端）。计划与背景见 [`../plan.md`](../plan.md)。

本地查看：

```bash
cd public/frontend_demo/app
pnpm install
pnpm dev
```

浏览器打开 vite 打印的地址；入口 `src/main.tsx` → `src/App.tsx`，页面在 `src/pages/`（Home / Library / Workspace），组件在 `src/components/`，mock 数据在 `src/data/mockSessions.ts`。
