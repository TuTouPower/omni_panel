# window.open URL 解析无 try/catch

- 来源：Grok 全仓评审（2026-08-11）
- 内容：Grok Issue 12：setWindowOpenHandler new URL(url) 无 try/catch，畸形 url 抛错；登录窗口未装 handler
- 处理：已直接修复（2026-08-11，无 task；见 git log config-ipc/window-manager/server.ts 小修）
