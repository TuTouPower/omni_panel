# web panel 静态响应缺 CSP

- 来源：Grok 全仓评审（2026-08-11）
- 内容：Grok Issue 11：local-api 静态/JSON 无 CSP/frame-ancestors/nosniff，Electron CSP 不覆盖浏览器面板
- 处理：已直接修复（2026-08-11，无 task；见 git log config-ipc/window-manager/server.ts 小修）
