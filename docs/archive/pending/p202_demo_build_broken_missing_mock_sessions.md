# p202 demo 构建存量损坏：mockSessions 缺失 + Library/Workspace 类型错误

- 来源：t430 实施中顺手发现（2026-08-17，stash 基线复现确认非 t430 引入）
- 内容：`public/frontend_demo/app` 无法构建——`src/data/mockSessions` 缺失（Library.tsx:376/393/411、Workspace.tsx:5/93/101/274 引用，vite ENOENT + tsc TS2307/TS7006/TS7053）。demo 有自己的 eslint/vite 配置，不在主仓 lint/typecheck 门禁内，故存量未暴露。影响：demo 改动无法以 `pnpm build` 自证，只能靠 vite 报错定位或手工拆解验证。修复方向：恢复/生成 `src/data/mockSessions` 数据文件（可参考 demo 其它 data 或页面用量的形状），再逐文件清 Library/Workspace 隐式 any。
- 处理：t430
