# p258 用量 popup 点击外部自动收起

- 来源：用户提出（2026-09-19）：用量窗口弹出面板情况下，用户点击其他地方时自动缩回去
- 内容：用量 popup（`mainPanelMode=popup`）现状无点击外部自动隐藏，只有托盘 toggle（`main-panel-controller.ts:316-327 open_or_toggle`）与显式 `hide():331-336`；与 p256（darwin 托盘菜单 clickaway 兜底）不同条目。darwin popup 用 `showInactive` 不抢焦点（`show_panel:300-311`，t497），blur 方案需先验证失活事件是否可靠；另与 t503 展示期提权/隐藏恢复（`elevate_for_show/restore_after_hide:270-288`）、p253 跨 Space 跟随有交互，收起=hide（保留渲染进程，t194）而非 close。验收：popup 可见时点击其他应用/桌面自动 hide，下次托盘打开直接 show 无冷启动；pinToTop 开启时行为待定（是否豁免自动收起）。
- 处理：main
