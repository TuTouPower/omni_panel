# p079 t250 popup_view_t250 测试 act 警告（真实 timers + wait_debounce）

- 来源：t250 review Round 2 f008（minor）
- 内容：popup_view_t250.test.tsx 用真实 timers + `wait_debounce`（600ms）等待防抖，测试运行产生 8 条 React act 警告（既有基线 0）。断言无假通过风险。可改 fake timers + advanceTimersByTime 消除（注意 RTL waitFor 与 fake timers 兼容需 shouldAdvanceTime）。（2026-08-08 核实：仍在，实测复现 8 条警告。）
- 处理：t261
