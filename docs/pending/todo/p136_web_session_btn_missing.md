# p136 web 面板右上角无会话历史按钮

- 现象：期望用量面板右上角有「会话历史」按钮；web 面板（data-web=1）右上角只有刷新/设置/代理面板，无会话按钮。
- 影响：web 面板无法从右上角进入会话历史。
- 根因：`src/renderer/views/popup-view/TitleBar.tsx:99` 会话按钮包在 `!is_web() &&` 条件内，web 模式隐藏。会话历史是 Electron 桌面窗口能力（`window.usageboard.sessionHistory.open`），web 浏览器无此桥，隐藏可能是设计意图，但用户期望 web 面板可用。
- 测试缺口：无 web 模式按钮显隐测试。
- 线索：.scratch/bug_t304_evidence.md
- 处理：未开（需设计确认 web 是否应暴露会话历史）
