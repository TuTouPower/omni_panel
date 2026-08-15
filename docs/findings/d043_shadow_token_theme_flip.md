# d043 阴影明暗由变量层翻转，组件禁 dark:shadow-

- 来源：t415
- 结论：`--shadow-window` / `--shadow-card` 与 color 语义 token 同构——`@theme` 保留 light 与 `-dark` 成对值，`.dark, [data-theme="dark"]` 内把语义名重绑到 `-dark`。组件只写 `shadow-window` / `shadow-card`，禁止 `dark:shadow-*-dark`。logo 品牌投影用 `@utility logo-drop-shadow`（filter），不进 box-shadow 五层。
- 证据：t415 `globals.css` 翻转块；`tests/unit/renderer/styles/elevation_layering.test.ts` 扫 `src/renderer`+`src/web` 清零 `dark:shadow-`；TrayMenu/PanelTitleBar 消费 `logo-drop-shadow`。
- 影响：后续 UI task 不得在组件再写阴影主题变体；新投影优先 `--shadow-*` 或 `@utility`。
- 现状：有效
