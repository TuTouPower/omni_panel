# Task plan

## 实施路径

1. **复现 + 证据**：playwright（或打包 `OmniUsage.exe` 人工）打开 AddAccountDialog，在动画首帧截图，确认黑线出现 + 定位是 `.acct-dialog` border / box-shadow 还是 `.ad-head` 的 `border-bottom` 在空内容阶段可见。
2. **红**：若可测，补一条能捕获首帧样式的测试（如渲染 dialog、断言空内容阶段 `border-color` 为 transparent 或动画 from 帧 opacity:0 生效）；不可测则跳过红，依赖视觉证据。
3. **绿**：根据证据修 CSS——候选方向：
    - 给 `@keyframes dialogIn` 的 `from` 帧补 `border-color: transparent` + `box-shadow: none`，让首帧不带 border/shadow，动画进行中再过渡出来；
    - 或给 `.acct-dialog` 默认 `border-color: transparent`，body 填充后（或动画结束）才设回 `var(--win-border)`；
    - 或确认 opacity:0 本应隐藏但因 React 首帧时序未生效，则用 `visibility:hidden`→`visible` 或推迟挂载。
4. **视觉验证**：再截图对比，确认黑线消失、正常打开动画不受损。
5. **静态 + 回归**：`pnpm test` / `pnpm typecheck` / `pnpm lint`。

## 关键文件

- `src/renderer/styles/globals.css`（`.acct-dialog` line 2523、`@keyframes dialogIn` line 2535、`.ad-head` line 2545）
- `src/renderer/components/AddAccountDialog.tsx`（dialog 结构，确认首帧渲染内容）

## 风险

- 首帧黑线可能是多因素（border + box-shadow + 子元素 border 同时），单一改动可能只消除一部分，需逐项截图验证。
- 视觉问题不可纯靠单测，验收依赖人工/playwright 截图。
