# Task review T020

- task：`T020_css_selector_getbyrole`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 00:35 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

无。

### 验证项核对

1. **web/ 下无 `aria-label="${...}"` 拼 label 的 CSS selector**
    - `rg 'aria-label="\$\{' tests/e2e/web` → 0 匹配。
    - `rg 'aria-label="[^"]*\$\{' tests/e2e/web` → 0 匹配。
    - `rg '\[aria-label=' tests/e2e/web` → 0 匹配（CSS attribute selector 形态绝迹）。
    - 验收标准满足。

2. **getByRole exact:true 语义对等原 CSS attribute 精确匹配**
    - 原 `button[aria-label="展开 ${account_label}"]` 是 CSS attribute selector 对 aria-label 属性值全等。
    - `getByRole("button", { name: \`展开 ${account_label}\`, exact: true })`中`exact: true` 要求 accessible name 全等，无 substring 退化。
    - 语义对等。Playwright 内部处理 name 匹配的转义/归一化，消解了 T016 code_f004 所述 `"`/`]`/`\` 脆弱性。

3. **变量插值正确**
    - popup_card_collapse_height.spec.ts：`展开 ${account_label}` / `折叠 ${account_label}` 4 处，`account_label` 来自 line 26/46/99 `getAttribute("aria-label").replace(/^折叠\s+/, "")`，变量名一致。
    - popup_height_debounce.spec.ts：`折叠 ${label}` / `展开 ${label}` 2 处，`label` 来自 line 27 `labels.push(...replace(/^折叠\s+/, ""))`，变量名一致。
    - 模板字符串无裸字符串拼接错位。

4. **其余逻辑未动**
    - diff 仅换 selector 方式：popup_card_collapse_height.spec.ts +5/-5，popup_height_debounce.spec.ts +2/-2。
    - 高度断言、`.scroll-inner` / `.bar-row` / `.card-name` / `.titlebar` / `.scroll` / regex `/^折叠 .+/` / `/^Codex$/` 均未改动。
    - 测试结构、wait、for-loop、expect 顺序保持原样。

5. **非范围守住**
    - 未触及 electron spec（`tests/e2e/electron/` 未出现在 working tree 改动中）。
    - 未改 non-label CSS selector（`.card-grip` class 类本次未触碰，working tree 仅 2 个 .spec.ts 修改 + docs/tasks_index.md + T020 task 目录新增）。
    - popup_refresh_state_reset.spec.ts（spec 背景点名的第三文件）T016 commit `712505d` 已改为 `getByRole` 形态，无 `aria-label="${...}"` CSS selector 残留，不属 T020 范围。该文件 line 24/29/48/53 的 `getByRole("button", { name: \`展开 ${account_label}\` })`未加`exact: true`（substring 匹配），系 T016 历史遗留，非本 task 引入，不记为 T020 finding。

### 旁注

- 改动当前落在分支 `task_t016_migrate_seed_fake_specs`（非 `task_t020_*`）。CLAUDE.md 单 task 流程要求独立分支 `task_tnnn_slug`；owner 若计划以 T020 分支提交需注意，如沿用现分支则 commit subject 含 `T020` 仍可被 `git log --grep T020` 追溯。此属流程提醒，非代码/文档 finding。

## 结论

T020 两文件改动语义对等、范围精确、验收标准满足。working tree 无 `aria-label="${...}"` CSS selector 残留；getByRole exact:true 正确替代原 attribute 精确匹配；变量插值与上下文一致；非范围守住。可进入 adoption 阶段。
