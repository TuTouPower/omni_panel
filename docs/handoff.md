# handoff

- 最后更新：2026-09-27
- branch：`main`
- head_commit：`1dbafa58`
- 当前状态：用量弹窗高度动态自适应、边距统一对齐与多账号卡片自适应展开修复已合入 main 分支。

## 2026-09-27 用量弹窗高度动态自适应与边距规范修复

- branch：`main`
- head_commit：`1dbafa58`
- 内容：
    1. **弹窗高度自适应根治**：彻底消除 popup 模式窗口拉宽后高度无法变矮的单向棘轮死锁。移除 `PopupHeightController` 中的 `min_preferred_height` 逻辑与 `usagePopupHeight` 配置项持久化，弹窗高度完全由内容物理高度驱动（拉宽折行减少变矮，缩窄折行增加变高）。
    2. **高度锁定与防手动纵向拉伸**：弹窗模式下将 BrowserWindow 的 `minHeight` 与 `maxHeight` 严格锁定为内容计算高度（`target`），仅开放宽度横向拉伸（`[USAGE_MIN_WIDTH, workArea.width]`）；`resize` 事件监听器拦截任何外力篡改并强制恢复 `expected_height`。
    3. **离屏测高镜像对齐与多账号撑高修复**：解决切换「多账号」明细卡片无法撑高窗口的问题。修复 `PopupView.tsx` 向离屏测高镜像（`data-popup="mirror"`）传递 `l2open_providers` 与 `expanded_map` 的状态丢失，并对齐卡片头部按钮（折叠箭头、拖拽手柄）的 DOM 尺寸，消除镜像测高与前台 DOM 几何高度偏差。
    4. **滚动容器边距规范**：弹窗滚动容器规范化为 `px-4 pb-4 pt-3`，卡片到窗口左边距（16px）、右边距（16px）与底边距（16px）保持绝对一致。
    5. **自动化测试覆盖**：新增单测覆盖镜像多账号展开与高度锁定防拉伸；Playwright Electron 端到端测试扩展 6 项约束验收（含拉宽变矮/缩窄变高、纵向拉伸拦截、切换多账号明细自动撑高）。
- 下一步：按 backlog 执行既有任务。
