# d045 Button text 变体、icon 尺寸档与 as-link

- 来源：t420 task
- 结论：`ui/Button` 以加法扩展 `variant="text"`（accent 行内动作）、size `inline`/`icon`/`icon-md`/`icon-sm`/`icon-xs`（无固定高 / 32 / 28 / 26 / 22）与 `as="a"`（原生链接 + `no-underline`）；既有 primary/secondary/danger/ghost/icon 与 standard/sm 默认渲染不变。jsdom 下 `fireEvent.keyDown(Enter|Space)` 不触发原生 button click，键盘可达测试应靠 `<button type="button">` 语义断言，勿用手动 `fireEvent.click` 冒充键盘。
- 证据：`src/renderer/components/ui/Button.tsx`；`tests/unit/renderer/components/ui/ui.test.tsx` t420 用例；Round 1 test finding t420_test_f001 探针 clicks=0。
- 影响：业务手拼按钮收组件层；web 中键新开标签页路径统一 as-link；后续键盘测勿在 jsdom 冒充 Enter/Space→click。
- 现状：有效
