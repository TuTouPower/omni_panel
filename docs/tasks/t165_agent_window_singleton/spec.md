# Task spec

## 背景

`index.ts:789` `TOKEN_STATS_OPEN` handler 每次调用 `windowManager.createWindowFor("agent")` 新建 BrowserWindow，不复用。用户多次点 "代理面板" 入口会叠加多个渲染进程，每个独立加载全量 records（t162 前），内存叠加。应单例化：已有 agent 窗口则 focus，无则新建。

## 范围

- `index.ts` `TOKEN_STATS_OPEN` handler：维护 `agentWin` 引用，存在且未销毁则 `show()+focus()`，否则 `createWindowFor("agent")` 并记录引用、绑定 `closed` 清空。
- 与 `MainPanelController` 的窗口生命周期模式对齐（参考其 `win` 引用与 `closed` 清理）。

## 非范围

- 不改 main panel（usage）窗口逻辑。
- 不改 agent 窗口内部数据加载（t162/t164 负责）。
- 不改 `windowManager` 工厂。

## 验收标准

- [ ] 连续多次触发 `tokenStats.open()` 只存在一个 agent BrowserWindow。
- [ ] 已打开时再次触发，focus 已有窗口而非新建。
- [ ] 关闭 agent 窗口后引用清空，再次触发可新建。
- [ ] 单测/集成测覆盖单例行为（mock windowManager 计数 createWindow 调用次数）。

## 依赖与约束

- 无前置依赖；独立改动。
- Desktop 类（涉及 BrowserWindow）。
