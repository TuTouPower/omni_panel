# d037 lucide BellOff 图标可用于「未监控铃铛叠斜线」

- 来源：t333
- 结论：lucide-react 提供 `BellOff`（`bell-off.mjs`），未监控状态用 `Icon name="bell_off"` 即可得铃铛带斜线视觉，无需自绘叠加；`Icon` 组件新增 `bell_off` 映射并支持 `data-slash` 透传到 svg。
- 证据：`node_modules/lucide-react/dist/esm/icons/bell-off.mjs` 存在；settings_form.test.tsx「marks the bell aria-pressed=true...」与 settings_view_watched.test.tsx「未监控/已监控」用例断言 `[data-slash="true"]` 显隐随 `watched` 状态切换，通过。
- 影响：`Icon` 组件（UI_ICONS 加 `bell_off: BellOff`，IconProps 加可选 `data-slash`）；t333 两处设置侧按钮复用。
- 现状：有效
