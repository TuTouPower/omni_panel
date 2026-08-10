# p055 工作台 WorkspaceView.tsx / workspace.css 超行数阈值待拆分

- 来源：t224 code reviewer（round 1/2 提示，未进 finding 表）
- 内容：`src/renderer/components/workspace/WorkspaceView.tsx` 629 行、`src/renderer/styles/workspace.css` 780 行，均超项目 400 行 minor 阈值（未达 800 important）。工作台为 t224 新建且后续 t225（面板交互）/t226（摘选）还会继续演进，建议按功能拆（如消息状态逻辑抽 hook、弹窗样式独立）。
- 处理：t232
