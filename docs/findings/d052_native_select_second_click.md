# d052 原生 select 选项手势含第二次 document 可达 click

- 来源：t451 task（p218 症状A 根因链）
- 结论：原生 `<select>` 用鼠标选定选项时，除 `change` 外还会向 select 本体再派发一次 `click`（无 down 阶段），且该 click 冒泡到 document。`document` 级 click-to-close 浮层若把 select 排除在安全区外，会出现「change 打开→同一手势 click 瞬间关闭」。
- 证据：`node_modules/@testing-library/user-event/dist/esm/utility/selectOptions.js`（注释 "the browser triggers another click event on the select for the click on the option"；单选分支先 `click(select)` 再 input/change 再 `click(select)`）；t451 `.scratch/bug_custom_range/repro_a`（userEvent 序列终态关闭 vs `fireEvent.change` 对照保持打开）；Chromium 真机 e2e `tests/e2e/web/agent_custom_range.spec.ts` 通过。
- 影响：任何「select 选项打开浮层 + document click 关闭浮层」组合须把触发 select 纳入关闭豁免区，或显式状态管理开关。
- 现状：有效
