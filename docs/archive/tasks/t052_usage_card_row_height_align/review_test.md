# Task review t052（reviewer_focus: 测试）

- task：`t052_usage_card_row_height_align`
- spec：`docs\tasks\t052_usage_card_row_height_align/spec.md`
- diff_anchor：`0e56ace91f84afdee75c8962d41c60e6ef41f105`
- target：`git diff 0e56ace91f84afdee75c8962d41c60e6ef41f105`
- round：1
- reviewed_at：2026-07-23 16:50 UTC+8

## 改动概览

- `src/renderer/styles/globals.css:355`：`.overview-grid { align-items: start }` → `align-items: stretch`（唯一一行代码改动）。
- `docs/tasks/t052_usage_card_row_height_align/task.md`：补 diff_anchor / branch / 过程记录。
- `docs/tasks_index.json`：task.py 自动产物。
- **无测试文件改动**。

## 项目既有 CSS/布局测试机制

- 单元层：`tests/unit/renderer/globals_css.test.ts` 与 `tests/unit/renderer/styles/provider_account_list_spacing.test.ts` 直接 `readFileSync('src/renderer/styles/globals.css')` 做字符串/正则断言。项目存在「CSS 源即契约」的测试约定。
- e2e 层：`tests/e2e/web/popup_card_collapse_height.spec.ts` 已通过 `node.scrollHeight` / `getBoundingClientRect()` 断言卡片折叠展开对高度的影响；`tests/e2e/web/popup_demo_alignment.spec.ts` 断言顶栏与 `.card` 渲染。Playwright web 路径具备布局/几何断言能力。

结论：纯 CSS 视觉改动并非「无机制可测」，至少单元层 CSS 契约测试是既有约定。

## Findings

### t052_test_f001 - 改 CSS 致既有 CSS 契约测试红灯，未归因、未修测试

- 严重度：critical
- 位置：`tests/unit/renderer/globals_css.test.ts:72`
- 问题：本 task 把 `src/renderer/styles/globals.css:355` 的 `.overview-grid { align-items: start }` 改为 `align-items: stretch`，但同一行所在的 CSS 块被既有测试断言锁定：

    ```ts
    // tests/unit/renderer/globals_css.test.ts:68-73
    it("introduces .overview-grid for responsive provider card layout", () => {
        const grid_css = /\.overview-grid\s*\{[\s\S]*?\}/.exec(css)?.[0] ?? "";
        expect(grid_css).toContain("display: grid");
        expect(grid_css).toContain("grid-template-columns: 1fr");
        expect(grid_css).toContain("align-items: start"); // ← 已被本 task 改动破坏
    });
    ```

    正则 `/\.overview-grid\s*\{[\s\S]*?\}/` 非贪婪匹配第一个 `.overview-grid { … }` 块（globals.css:351–356），该块内 `align-items` 已从 `start` 改为 `stretch`，断言必然失败。

    实跑验证：`npx vitest run tests/unit/renderer/globals_css.test.ts` 输出

    ```
    AssertionError: expected '.overview-grid {\n    display: grid;\…'
                  to contain 'align-items: start'
    at tests/unit/renderer/globals_css.test.ts:72:26
    ```

    11 PASS / 1 FAIL，红灯真实存在。task.md 过程记录仅写「根因/修复方向」，无任何关于该测试失败的归因（实现 bug / 测试写错 / 规格变了），也未修测试。按 `### 红灯归因` 节规则，改测试须先证明实现错或规格变；本 task 的规格变（CSS 值从 `start` → `stretch`）本身就是 task 目的，正确动作是把断言同步改为 `align-items: stretch`（或更宽松但能区分方向的断言），implementer 未做。

    判定为 critical：测试轴「红灯未归因」+ 改动破坏既有 AC 契约测试致套件不可信；spec AC 第 4 条「桌面端与 web 双路验证」对应 `{test_cmd}` 通道现在在单层就挂了。

- 建议：最小修复是把 `tests/unit/renderer/globals_css.test.ts:72` 的断言同步改为

    ```ts
    expect(grid_css).toContain("align-items: stretch");
    ```

    与本 task 的规格意图一致。若担心后续再次回退，可加一条反向断言 `expect(grid_css).not.toContain("align-items: start")`。注意：`.overview-row`（globals.css:373）仍保留 `align-items: start`，这是另一个选择器，断言范围限定在 `.overview-grid` 块内即可，不会误伤。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：1 条（critical）。
- 总体判断：纯 CSS 单行改动本身合理，但破坏了项目既有 CSS 契约测试且未修未归因，单层套件当前红灯，必须补测试或修订断言后才能进入收尾。

verdict: FAIL

## Round 2 (2026-07-23 17:10 UTC+8)

### 前轮 finding 复核

#### t052_test_f001（critical）— 已修

- 改动：`tests/unit/renderer/globals_css.test.ts:72` 断言从 `align-items: start` 同步改为 `align-items: stretch`，与本 task 的 `src/renderer/styles/globals.css:355` 改动方向一致。
- 验证：`npx vitest run tests/unit/renderer/globals_css.test.ts` 12 PASS / 0 FAIL（R1 为 11/1）。
- 弱化检查：断言形式未变（仍是 `toContain` 字符串契约），强度与项目既有 CSS-as-contract 约定一致；未降级为存在性/恒真断言，未改用正则/`>=`/`toBeTruthy`。R1 建议的「最小修复」即此。
- 结论：真修，非换形式弱化。

### 本轮新发现

本轮 diff（相对 R1 审阅时的工作区状态）只新增一行测试断言同步改动；未引入新测试文件、新 mock、新 skip/only，无 `eslint-disable` / `@ts-ignore` / `type: ignore`。spec AC 1/2 的覆盖条件（同高、填背景）在 R1 阶段已判定由既有 CSS 契约单测 + e2e 布局几何测（`popup_card_collapse_height`、`popup_demo_alignment`）共同承担，非本轮新增缺口。

新发现 0 条。

### 总体判断

R1 critical finding 已按建议修复并实跑验证，测试套件恢复全绿；本轮无新增测试侧问题。

verdict: PASS
