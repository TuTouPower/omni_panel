# 会话窗口外壳（SessionShell）

需求：会话历史窗口为单壳外壳；P6 起用户面为「会话库 + 同屏查看」，不再暴露「工作台」页签。

## 窗口形态

- route `history`/`session` 单窗口不变，渲染根组件为 `SessionShell`。
- 顶栏：左品牌（logo + Omni Panel - Session）+ 右刷新/四面板跳转/窗口控制（`PanelTitleBar`）；**无**「工作台 / 会话库」居中页签。
- 默认页 = 会话库（`SessionLibrary`）；「同屏查看 / 同屏最近 / 单独打开 / 外部 onFocus」进入同屏页（`CompareView`）。
- 两页常驻挂载，切换只改 `data-active` / `hidden`，返回会话库时筛选与勾选状态保留。

## 同屏查看（CompareView）

- 顶栏：`← 返回会话库`、同屏最近 2/4/6/8、会话计数。
- 多列独立面板（最多 8）：demo 卡片头（徽标/时间/标题/目录/tokens/轮次/IdChip）+ 消息区。
- 移除面板内会话即从同屏集合去掉；空态提示勾选或同屏最近。

## 主题与入口

- 会话窗口调用共享 `useTheme()`，跟随全局 `config.theme`。
- 面板跳转：Usage / Agent / Settings / Session（与其它窗口一致）。

## 硬约束

- 设计系统作用于会话窗口；不改用量/代理/设置/托盘结构。
- 不再把会话装入工作台槽位；`sessionHistory.open` / onFocus 进入同屏查看。
