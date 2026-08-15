# d046 告警条/code chip/徽章/toast 四类复合模式唯一实现

- 来源：t422 task
- 结论：业务侧告警条走 `ui/Alert`（error/warning/success，12% color-mix 浅底为授权先例）；只读 code 值走 `ui/CodeChip`；卡片头 accent 计数与推荐徽章走 `Badge` variant `accent`/`recommend`（既有 count/label 保留）；底部 toast 走 `ui/Toast`。审计 grep 须锚定完整配方（如 `rounded-md bg-[color-mix(...error...)]`），勿扫 icon 光晕/hover 态的孤立 color-mix。
- 证据：`src/renderer/components/ui/{Alert,CodeChip,Toast,Badge}.tsx`；`tests/unit/renderer/components/ui/ui.test.tsx` t422 用例与业务侧配方清零断言。
- 影响：新提示条/chip/徽章/toast 禁止再手拼同配方；SettingsView 原 10% 错误条已收敛 12%。
- 现状：有效
