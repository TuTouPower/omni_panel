# Task review T020

- task：`T020_css_selector_getbyrole`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 01:10 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

无。

## 验证记录

### 验收标准逐条对应

1. **web/ 下无 `aria-label="${...}"` 拼 label 的 CSS selector**
    - `rg "\[aria-label=" tests/e2e/web/` 0 命中。
    - `rg "aria-label=" tests/` 剩余命中均为非 label 拼接：`tests/unit/renderer/components/button.test.tsx:31`（静态 aria-label 测 props）与 `tests/e2e/electron/popup_window_constraints.spec.ts:42/46`（`[aria-label="折叠"]` 固定文本，非 interpolation，spec 非范围已排除 electron）。满足。

2. **`pnpm test:e2e:web` real + synthetic 全绿**
    - real（默认 fixture）：41 passed，含 `popup_card_collapse_height` 4 case、`popup_height_debounce` 2 case、`popup_refresh_state_reset` 3 case，全绿（25.5s）。
    - synthetic（`MOCK_FIXTURE=synthetic`）：38 passed + 3 skipped（22.7s），与基线一致。
    - 改造后两路均通过，无回归。

3. **`pnpm typecheck` 过**
    - `tsc --noEmit` 无输出，退出 0。

### getByRole exact 语义等价性

- 原 `button[aria-label="展开 ${account_label}"]` CSS attribute selector 为字符串全等匹配。
- 新 `getByRole("button", { name: \`展开 ${account_label}\`, exact: true })`：Playwright 对 accessible name 在 exact 模式下做 trim 后严格相等，无 substring 退化，等价。
- DOM 落点 `src/renderer/components/CollapsibleCard.tsx:46` 为原生 `<button>`，隐式 role=button，`aria-label` 即 accessible name，role 可解析。
- `aria-label` 构造（`src/renderer/components/ProviderAccountRow.tsx:135`）：`` `展开 ${display_label || "账号"}` `` / `` `折叠 ${display_label || "账号"} ``，单一空格拼接。
- 测试侧提取：`getAttribute("aria-label").replace(/^折叠\s+/, "")`，`\s+` 吞尽 "折叠" 后全部空白，`account_label` 为纯 label；重组用单一空格，与源码生成串严格相等。闭环正确。
- 风险边界：若未来 `display_label` 自身含前导空白，原 CSS 与新 getByRole exact 均会失败（行为等价，非本 task 引入）。

### 覆盖度

- `popup_card_collapse_height` 4 case：仍测 single collapse height 下降 / expand 恢复 / collapse all scroll attached / tab 切换保持折叠态。断言对象与性质未变。
- `popup_height_debounce` 2 case：rapid collapse/expand 循环 + live 可测量/mirror 不可见。断言未变。
- 其余 web spec 未改。覆盖度不降。

### flaky 风险

- `locator(...)` 与 `getByRole(...)` 同为严格模式 Locator，auto-retry/auto-wait 行为一致。
- `exact: true` 不影响等待策略，仅约束匹配语义。
- real/synthetic 双路多次运行未出现抖动。

## 结论

3 条验收标准全部验证通过（web/ 无 interpolation CSS、real 41 passed + synthetic 38 passed/3 skipped、typecheck 过）。getByRole exact 与原 CSS attribute 全等在当前 DOM 与 aria-label 构造下严格等价，提取/重组闭环正确，无覆盖度下降，无新增 flaky 风险。无 finding。
