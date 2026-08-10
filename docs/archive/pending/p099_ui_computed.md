# p099 ui 组件 computed 明暗抽查未实现（2026-08-09）

- 来源：t269 review Round 3 f009（minor）
- 内容：t269 spec AC3 要求「全部组件明暗主题下无需 dark: 即渲染正确（黑盒抽查暗色渲染）」。ui 组件未被应用消费（t270 起迁移），app 级 e2e 无法渲染；jsdom 不解析构建产物 CSS 变量，单测 computed 不可行。待 t270 迁移消费后补黑盒暗色抽查。
- 处理：t283
