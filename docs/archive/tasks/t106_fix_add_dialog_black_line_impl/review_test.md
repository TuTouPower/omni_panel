# Task review t106（reviewer_focus: 测试）

- task：`t106_fix_add_dialog_black_line_impl`
- spec：`docs/tasks/t106_fix_add_dialog_black_line_impl/spec.md`
- diff_anchor：`da200f5057bfa9e982280057cef3de4305ec004c`
- target：`git diff da200f5057bfa9e982280057cef3de4305ec004c`
- round：1/2
- reviewed_at：2026-07-25 15:12 UTC+8

## Findings

### t106_test_f001 - 测试以 CSS 源码属性存在性断言替代真实视觉行为验证

- 严重度：important
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:553-570`
- 问题：新增两个用例直接读取 `src/renderer/styles/globals.css`，通过正则提取 `.acct-dialog` 与 `@keyframes dialogIn from` 代码块，再断言其中包含 `border-color: transparent`、`box-shadow: none`、`animation-fill-mode: backwards`。这些断言验证的是源码字符串存在，既不是 AddAccountDialog 打开时的真实视觉输出，也不是用户可观察行为，属于「存在即通过」危险模式。CSS 中写了这些属性不等于首帧黑线已消除（动画时序、合成层、内容填充时机、其他元素仍可能导致闪现）；反之，若未来通过其他 CSS 手段消除黑线，这些测试也会误失败。spec AC1 要求「AddAccountDialog 打开时不再闪现黑色横线」，AC2 要求「视觉验证通过（playwright 截图或打包后人工确认）」，当前自动化测试均未覆盖。
- 建议：将视觉回归固化为自动化测试，例如用 Playwright 对 AddAccountDialog 首帧截图并断言无黑线像素，或在渲染组件后断言首帧计算样式 `getComputedStyle(dialog).borderColor` / `boxShadow` 处于隐藏状态；CSS 字符串检查若保留，只能作为辅助，不能作为 AC 的唯一测试证据。

## 结论

- 前轮 finding 复核：本轮为首轮，无前轮 finding 复核。
- 本轮新发现：1 条
- 总体判断：新增测试未验证 spec AC 要求的真实视觉行为，仅以 CSS 源码存在性断言充当通过证据，测试不可信，无法保证首帧黑线问题被持续回归。

verdict: FAIL

## Round 2 (2026-07-25 15:20 UTC+8)

## Findings

### t106_test_f002 - Playwright 视觉验证基于静态 fixture 而非实际组件，未固化为自动化回归

- 严重度：important
- 位置：`.scratch/t106_visual/screenshot.mjs:8`、`.scratch/t106_visual/dialog.html:22-48`、`tests/unit/renderer/components/add_account_dialog.test.tsx:556-560`
- 问题：Round 1 指出单元测试仅检查 CSS 源码字符串，未验证真实视觉行为。实现方回应称已通过 Playwright 截图完成视觉验证，但相关脚本与截图全部存放在 `.scratch/t106_visual/`（临时草稿目录）。这些脚本打开的是手写静态 HTML fixture（`dialog.html` 直接复制了 `.acct-dialog` 与 `@keyframes dialogIn` 的 CSS），并非实际应用中的 `AddAccountDialog` 组件或打包后的 Electron 窗口。因此截图证据既不能证明 React 真实渲染路径下首帧黑线已消除，也未被纳入任何可重复运行的自动化测试（E2E / 集成 / 单元）。未来若有人改动 `globals.css`、组件结构或动画逻辑，现有测试与临时截图都无法在 CI 中捕获回归。
- 建议：将视觉验证固化为可重复运行的测试，例如在 `tests/e2e/` 或 `tests/integration/` 中新增 Playwright 用例，在真实应用渲染 `AddAccountDialog` 后截取首帧并与无黑线基准图对比；若暂不可行，至少把 fixture 与截图脚本作为 task 证据提交到 task 目录或 tests 下，并说明复现步骤，而不是留在会被清理的 `.scratch/`。

## 结论

- 前轮 finding 复核：
    - `t106_test_f001`（测试以 CSS 源码属性存在性断言替代真实视觉行为验证）：**未修 / 修不彻底**。当前测试仍直接读取 `src/renderer/styles/globals.css` 并断言字符串包含 `border-color: transparent`、`box-shadow: none`、`animation-fill-mode: backwards`，与 Round 1 相比仅新增注释说明 jsdom 限制。注释承认「无法断言实际首帧视觉输出」，恰恰说明该用例仍是「存在即通过」模式；它没有改成对计算样式、首帧截图或真实组件行为的断言，无法保证 AC1「AddAccountDialog 打开时不再闪现黑色横线」被持续回归。
- 本轮新发现：1 条

- 本轮新发现：1 条
- 总体判断：单元测试仍是 CSS 字符串检查，且声称的 Playwright 视觉验证只是基于静态 fixture 的临时草稿，既未测试实际组件，也未纳入自动化回归。视觉验证 concern 未得到充分解决。

verdict: FAIL

## Round 3 (2026-07-25 15:30 UTC+8)

## Findings

无。

## 结论

- 前轮 finding 复核：
    - `t106_test_f001`（测试以 CSS 源码属性存在性断言替代真实视觉行为验证）：**已修**。实现方已删除 CSS 字符串单元测试，改为 Playwright web e2e 测试 `tests/e2e/web/add_account_dialog_first_frame.spec.ts`，在真实 Chromium 中暂停动画于 from 帧并断言 `.acct-dialog` 的 `border-color` 透明、`box-shadow` 隐藏，直接验证首帧计算样式。
    - `t106_test_f002`（Playwright 视觉验证基于静态 fixture 而非实际组件，未固化为自动化回归）：**已修**。静态 fixture 与截图已归档到 `docs/tasks/t106_fix_add_dialog_black_line_impl/visual_evidence/`；同时新增可重复运行的 Playwright e2e 测试读取真实 `globals.css` 片段，成为 CI 可持续回归。
- 本轮新发现：0 条
- 总体判断：视觉验证 concern 已通过真实浏览器计算样式断言与归档证据解决，测试可信。

verdict: PASS
