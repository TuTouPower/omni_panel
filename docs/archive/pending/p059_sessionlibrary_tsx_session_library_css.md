# p059 会话库 SessionLibrary.tsx / session-library.css 超行数阈值待拆分

- 来源：t227 code reviewer round 1/2/3 连续提示（未进 finding 表）
- 内容：`src/renderer/components/session-library/SessionLibrary.tsx` 645 行、`src/renderer/styles/session-library.css` 725 行，均超项目 400 行 minor 阈值（未达 800 important），round 1-3 持续净增。建议按功能拆（SessionCard/SessionRow/预览抽屉抽独立组件文件、CSS 按区块拆）。
- 处理：t241
