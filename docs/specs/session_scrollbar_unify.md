# session_scrollbar_unify

会话窗口滚动条统一为 demo 细规范样式：6px 宽、透明轨道、token 化 thumb/hover。

## 规则

- 会话窗口滚动容器挂 `@utility scrollbar-token`（`globals.css`）：
    - Chromium：`::-webkit-scrollbar` 宽高 6px；track transparent；thumb `var(--color-scrollbar-thumb)`；hover `var(--color-scrollbar-thumb-hover)`；button 折叠（display:none / 0 尺寸）使指示与 thumb 同轴。
    - Firefox：`scrollbar-width: thin` + `scrollbar-color: var(--color-scrollbar-thumb) transparent`。
- thumb 色来自 DESIGN.md `colors.scrollbar-thumb` / `scrollbar-thumb-hover` 及 `-dark` 对，经 designmd 导出为 `--color-scrollbar-*`；暗色在 `.dark, [data-theme="dark"]` 翻转。
- 禁止组件内写滚动条色字面量。

## 已落地位点（t412）

|容器|class|
|---|---|
|卡片消息区|`.conversation-message-scroll.scrollbar-token`|
|大纲列表|`.conversation-outline-list.scrollbar-token`|
|侧栏槽位|`.session-rail-scroll.scrollbar-token`|
|摘选托盘|`.selection-tray-scroll.scrollbar-token`|
|会话库网格/列表|`.library-grid` / `.library-list` + `scrollbar-token`|

设置/CPA 仅收口 `scrollbar-color` 为 token（结构性 thin 保持原状，全应用 webkit 统一留后续）。

## 验证

- 单测：`tests/unit/renderer/styles/session_scrollbar.test.ts`（token、utility 配方、容器挂载、设置/CPA 无 rgba 字面量）。
- 构建产物：`.scrollbar-token::-webkit-scrollbar{width:6px;height:6px}`。
- 暗色真实窗口观感属 [deploy] 人工目检。
