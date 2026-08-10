# p078 t222 sparkline 偏好门控疑似同款死锁（核查）

- 来源：t250 review Round 2 系统性 follow-up
- 内容：t250 f001 发现 activeUsageTab 的 `has_active_tab_pref_ref` 门控死锁（config 无键时永不写盘）；该模式抄自 t222 sparkline 的 `has_sparkline_pref_ref`（PopupView.tsx）。sparkline 同款逻辑疑似同样死锁：config 无 `sparklineWindowDays` 时 ref 永不置位，用户切换 1/7/30 天永不写盘。t250 已改 prev ref 模式修复 activeUsageTab，sparkline 未核查。（2026-08-08 核实：死锁仍存在，`PopupView.tsx:81/139-148/275-279`，且 config 有键但值等于当前 state 时首次切换同样被吞；现有测试只覆盖有键场景。）
- 处理：t261
