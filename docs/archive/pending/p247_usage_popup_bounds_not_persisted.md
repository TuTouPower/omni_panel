# p247 用量窗口大小与位置未持久化且拉伸高度被自适应内容覆盖

- 现象：macOS 默认的 popup 模式下，用户手动拖拽调整用量窗口位置或拉伸窗口高度后：
    1. 重启应用或关闭重开时，位置强制重置回托盘正下方，拉伸高度丢失；
    2. **在应用运行期间，在用量面板点击具体供应商（如 DeepSeek）查看用量，再点击返回「总览」，总览窗口也会立刻被重置回默认大小并弹回托盘正下方**，导致用户之前的拉伸完全失效。
- 影响：用量面板窗口（Usage Panel / popup 模式）。不仅重启应用时尺寸位置丢失，且在日常交互（切 Tab、看子页面、回总览）中被频繁破坏重置。
- 根因：
    1. `src/main/core/main-panel/main-panel-controller.ts` 中，popup 模式未注册 `target.on("move")` 监听，且 `position_popup` 每次显示均无条件将坐标重新锚定在托盘正下方；
    2. popup 模式下 `target.on("resize")` 仅调用了 `save_popup_width`，缺少 `usagePopupHeight` 字段与持久化；
    3. `PopupView.tsx` 在页签切换（如 overview ↔ deepseek）时，由于不同视图 DOM 高度不同，会通过 `use_popup_height_report` 重新上报当前内容高度；主进程 `PopupHeightController` 与 `apply_locked_size` 将内容高度视为唯一的绝对真相，无条件通过 `setBounds` 将窗口强行 resize 为内容自适应高度，并在 macOS 下重新根据托盘计算 x/y，瞬间抹杀用户之前拉大的窗口高度和拖拽位置。
        已确认同类位点：`setting`、`agent`、`session`、`dev` 均通过 `window-bounds.ts` 统一持久化了 `(x, y, width, height, displayId)`；唯独 `usage` 面板的双模（popup / floating）分流中，popup 仅在 t495 中打补丁存了 width，未持久化 height/position 且缺乏用户自定义尺寸与动态高度算法的协调。
- 测试缺口：`tests/unit/main/main_panel_controller.test.ts` 仅验证了宽度保存和自适应高度计算，缺少“用户手动 resize 高度/move 位置后持久化并在重启后恢复”、“内容高度变动/切页签不破坏用户已拉伸高度”的针对性单元测试与集成测试。
- 线索：`.scratch/repro_usage_window_bounds.ts` 最小复现验证：`usagePopupHeight` 为 undefined、popup 模式下无 `move` 监听、上报内容高度（如切页签）直接将拉伸的 800 高度压回 350 并将位置弹回托盘。
- 处理：main
