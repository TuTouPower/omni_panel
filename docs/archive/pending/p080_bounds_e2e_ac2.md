# p080 会话面板窗口 bounds 恢复无独立 e2e（AC2）

- 来源：t251 review f001（minor）
- 内容：AC2（会话面板 bounds 保存/恢复）仅被共用 `create_panel_window` 路径 + `get_saved_bounds` 键单测覆盖，无 history 窗口独立 e2e（需会话 fixture）。agent 窗口 e2e（panel_window_bounds.spec.ts）已覆盖恢复核心路径。（2026-08-08 核实：仍缺失，tests/e2e 下无 `#history` bounds 用例。）
- 处理：t262
