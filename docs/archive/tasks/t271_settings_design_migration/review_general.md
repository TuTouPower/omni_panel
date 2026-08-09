# Task review t271（reviewer_focus: 通用）

- task：`t271_settings_design_migration`
- spec：`docs/tasks/t271_settings_design_migration/spec.md`
- diff_anchor：`02f0b93fab91ab065a2f620cc3bf1421bf2ddc6a`
- target：`git diff 02f0b93fab91ab065a2f620cc3bf1421bf2ddc6a`
- round：Round 1
- reviewed_at：2026-08-09 11:14 UTC+8

## Findings

### t271_gen_f001 - AddAccountDialog 首帧测试仍绑定已删除的旧 Dialog 契约

- 严重度：important
- 锚点：AC 4；测试策略要求对应 web e2e 通过
- 位置：`tests/e2e/web/add_account_dialog_first_frame.spec.ts:16,41-55,69-88`；新 Dialog 实现位于 `src/renderer/components/ui/Dialog.tsx:33-63`，`AddAccountDialog` 使用它位于 `src/renderer/components/AddAccountDialog.tsx:253-258`
- 问题：迁移后生产代码改用统一 `Dialog`，不再提供旧 `.acct-dialog` CSS 动画；该测试仍从旧 `.acct-dialog` 到 `.ad-head` 截取 CSS、构造旧 DOM，并要求暂停动画后的 `opacity` 为 `0`。在真实 Chromium 中复现为 `Expected: "0", Received: "1"`，该测试因此失败。它同时留下了已删除窗口专属 selector 的残留引用，不能通过恢复旧生产类名解决。
- 建议：按当前统一 `Dialog` DOM 和实际视觉契约重写首帧测试；若统一 Dialog 不再提供入场动画，则删除过时的首帧动画断言，而不是恢复 `.acct-dialog` / `.ad-*` CSS。

### t271_gen_f002 - About Web E2E 仍查询已迁移的 `.ah-*` selector

- 严重度：important
- 锚点：AC 1、AC 4；测试策略要求对应 web e2e 通过
- 位置：`tests/e2e/web/settings_provider_accounts.spec.ts:14-15,23-24`；当前 About 实现位于 `src/renderer/views/settings-view/sections/about_section.tsx:16-23`
- 问题：About 页面已改为 utility class，logo 与版本文本不再拥有 `.ah-logo` / `.ah-ver`。Web E2E 仍使用两个旧 selector，实际复现为元素不存在：`about page shows real logo` 与 `about page shows version text` 均失败。当前同一组 Web E2E 为 8 项中 5 项通过、3 项失败；accounts/sidebar/用量条相关用例通过。
- 建议：改用当前稳定的语义定位或新增明确 `data-testid`（例如 logo 的 accessible name、版本文本的语义定位），保持测试不依赖已删除的 Settings 专属 CSS 类。

## 验证证据

- `pnpm test`：252 个 test files 通过；2750 passed、2 skipped。
- `pnpm typecheck`：通过。
- `pnpm lint`：通过；改动文件单独执行 `prettier --check` 全部通过，`git diff --check` 无输出。
- `pnpm build:web`：通过。
- `pnpm build && E2E_HEADLESS=1 xvfb-run -a pnpm exec playwright test --config=playwright.config.ts --project=electron tests/e2e/electron/settings_view.spec.ts tests/e2e/electron/add_account.spec.ts tests/e2e/electron/settings_provider_accounts.spec.ts tests/e2e/electron/plugin_config.spec.ts tests/e2e/electron/cpa_label_map_watch.spec.ts`：12 passed。
- Web E2E 复现命令覆盖 `settings_view.spec.ts`、`settings_provider_accounts.spec.ts`、`add_account_dialog_first_frame.spec.ts`：8 项中 5 passed、3 failed，失败均为上述 finding。
- `pnpm check` 在 typecheck、lint 后，于全仓 `prettier --check` 因 11 个未出现在 t271 diff 的既有文件失败；不将该基线格式问题列为 t271 finding。
- 对 t271 `src/renderer` 扫描未发现 `.acct-dialog`、`.ad-*`、`.set-select`、`.ah-logo`、`.ah-ver` 或 utility `dark:` 分支；Web 测试目录仍有 finding 所列旧 selector 引用。

## AC 核对

| AC   | 结论                             | 证据                                                                                                                             |
| ---- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| AC 1 | 未完全证明                       | 设置相关单测与 Electron e2e 通过；对应 Web E2E 仍因 f001/f002 红灯。当前失败直接来自迁移后的测试契约不一致，修复前门禁仍不完整。 |
| AC 2 | 暂无 finding                     | 设置分区、强调色、用量条样式与配色等相关单测/Web E2E 通过。                                                                      |
| AC 3 | 自动检查通过，视觉部分未完全自证 | t271 `src/renderer` 未发现组件 `dark:` 分支，构建通过；明暗主题逐屏视觉正确性仍属于人工检查。                                    |
| AC 4 | 未满足                           | t271 生产源码已无旧 Settings 专属 selector，但 Web 测试仍残留 `.acct-dialog`、`.ah-logo`、`.ah-ver` 引用并产生失败。             |
| AC 5 | `[deploy]` 未自证                | 本轮未执行迁移前后逐屏截图人工对照；spec 已声明该项无法由 agent 自证。                                                           |

## 结论

- 本轮新发现：2 条。
- 未进表的提示：`pnpm check` 的全仓格式失败来自 t271 diff 外的既有文件；测试期间出现 React `act(...)` 警告，但未形成失败且不据此阻断本轮。
- 总体判断：生产迁移路径已通过单测、构建和 Electron e2e，但对应 Web E2E 尚未全绿，且测试保留已删除 CSS 契约；修复两条 important finding 后再开下一轮审阅。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-09 11:43 UTC+8)

### Round 1 finding 复核

- `t271_gen_f001`：已消除。`tests/e2e/web/add_account_dialog_first_frame.spec.ts:17-41` 已改为在真实 SPA 中打开 Accounts -> 添加账号，验证统一 `Dialog` 的 `role=dialog`、`aria-modal`、遮罩尺寸及 `animationName=none`，不再构造 `.acct-dialog` / `.ad-*` 旧 DOM。使用 synthetic fixture 的对应 Web E2E 已通过。
- `t271_gen_f002`：已消除。`tests/e2e/web/settings_provider_accounts.spec.ts:9-28` 已改用 `img[alt="OmniPanel"][width="96"]` 与 `getByText(/^版本 /)`，不再查询 `.ah-logo` / `.ah-ver`。使用 synthetic fixture 的对应 Web E2E 已通过。
- real fixture 文件 `tests/e2e/fixtures/data/responses.json` 当前缺失，真实 fixture Web E2E 仍会因 `/v1/*` 返回 404 而受限；该环境缺口不影响上述 selector 与当前统一 Dialog 契约的修复结论。

### t271_gen_f003 - Settings 左侧导航选中态被旧 CSS 规则覆盖

- 严重度：important
- 锚点：AC 1（各分区渲染）与 AC 3（主题下正确渲染）
- 位置：`src/renderer/views/SettingsView.tsx:431-438`；冲突规则位于 `src/renderer/styles/globals.css:1272-1293`
- 问题：`SettingsView` 为选中项添加 `bg-[var(--color-primary-container)] text-[var(--color-accent)]`，但后置 `.set-nav-item` 规则仍设置 `background: transparent`、`color: var(--text-2)`；`.set-nav-item .sn-ic` 又设置 `color: var(--text-3)`。真实 Chromium + synthetic fixture 复现时，选中 General 按钮 class 为 `set-nav-item bg-[var(--color-primary-container)] text-[var(--color-accent)]`，计算样式仍为 `backgroundColor: rgba(0, 0, 0, 0)`、`color: rgb(163, 171, 186)`、`fontWeight: 500`。
- 失败场景：打开 Settings 或切换任一分区后，当前分区没有背景高亮，文字与图标没有 accent 色，用户无法通过视觉识别当前分区；这直接违反分区渲染与主题视觉契约。
- 建议：使 `.set-nav-item` 基础规则不再覆盖选中态的 `background` / `color`，并将未选中态颜色与背景放入明确的未选中选择器或语义类；同时让 `.sn-ic` 的基础颜色不覆盖选中态 accent 颜色。

## Round 2 验证证据

- Round 1 两项修复对应的 Web E2E：synthetic fixture 下 `8 passed (10.6s)`，覆盖 `settings_view.spec.ts`、`settings_provider_accounts.spec.ts`、`add_account_dialog_first_frame.spec.ts`。
- 相关 7 个 renderer 单测文件：`7 passed`、`119 passed`。
- `pnpm build:web`：通过。
- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm test`：通过；仅有既存 React `act(...)` 警告。
- `git diff --check 02f0b93fab91ab065a2f620cc3bf1421bf2ddc6a`：无输出。

## Round 2 结论

- 本轮新发现：1 条（`t271_gen_f003`）。
- 未进表的提示：real fixture 缺失限制真实 fixture Web E2E；全仓格式检查的既有基线问题不属于本轮 diff；React `act(...)` 警告未形成失败。除 `t271_gen_f003` 外未发现其他 blocker。
- 总体判断：Round 1 的两项测试契约问题已修复并通过 synthetic Web E2E，但 Settings 选中导航态仍被旧 CSS cascade 覆盖，存在 important finding，需修复后再开下一轮审阅。
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-09 12:10 UTC+8)

### Round 2 finding 复核

- `t271_gen_f001`：已消除。`tests/e2e/web/add_account_dialog_first_frame.spec.ts:17-41` 在真实 SPA 中打开 Accounts → 添加账号，使用 `getByRole("dialog", { name: "添加账号" })`、`aria-modal`、遮罩尺寸和 `animationName=none` 验证当前统一 `Dialog`；不再构造或选择旧 `.acct-dialog` / `.ad-*` DOM。旧类名仅存在于迁移说明注释，不属于运行时 selector。
- `t271_gen_f002`：已消除。`tests/e2e/web/settings_provider_accounts.spec.ts:9-29` 使用 `img[alt="OmniPanel"][width="96"]` 与 `getByText(/^版本 /)`；`src/renderer/views/settings-view/sections/about_section.tsx:17-23` 提供对应语义 DOM，不再依赖 `.ah-logo` / `.ah-ver`。
- `t271_gen_f003`：已消除。`src/renderer/views/SettingsView.tsx:431-456` 为当前导航项提供 `aria-current="page"`、primary-container 背景、accent 文字和图标颜色；`src/renderer/styles/globals.css:1272-1294` 的 `.set-nav-item` 基础规则已移除 background/color，hover 仅作用于非当前项。`tests/e2e/web/settings_view.spec.ts:62-118` 已按明暗主题 token 检查计算样式，Round 2 的 cascade 覆盖不再复现。

### `t271_gen_f004`：Web E2E 仍断言已迁移的 `.on` class（important）

- 位置：`tests/e2e/web/settings_view.spec.ts:35-38`、`:58-60`。
- 问题：点击“彩色区分：九色循环”后，测试仍要求按钮 `toHaveClass(/\bon\b/)`；点击“粗胶囊型”后，测试仍要求相同旧 class。当前 `src/renderer/components/settings/BarSchemeField.tsx:17-30` 使用统一 `Button`、utility classes 和 `aria-pressed`，没有 `on`；`src/renderer/components/ui/Segmented.tsx:29-43` 使用当前值驱动的 utility class，也没有 `on`。`src/renderer/components/ui/Button.tsx:41-45` 仅合并 base、variant、size 与传入 className，不会自动添加 `on`。
- 失败场景：真实 Web E2E 点击成功后，两个按钮 DOM class 都不含独立 `on`，对应断言失败；迁移后的 Web E2E 门禁无法通过。
- 建议：改断言为 `aria-pressed` 或断言当前 utility class/可观察语义状态，不要恢复旧 `on` class。

### `t271_gen_f005`：迁移后仍残留无引用的 Settings 专属旧手写 CSS（important）

- 位置：`src/renderer/styles/globals.css:1241-1254` 的 `.settings-head .back-btn` / hover；`:1603-1641` 的 `.cpa-foot .cf-save`、`.cf-remove` 及 hover/disabled。
- 问题：当前 JSX 已迁移到统一 UI `Button`：`src/renderer/views/SettingsView.tsx:421-424` 使用 `Button` 渲染返回控件，`src/renderer/components/CpaConnectorSettings.tsx:382-400` 使用 `Button` 渲染保存/移除控件；源码中无 `.back-btn`、`.cf-save`、`.cf-remove` DOM 引用，仅剩对应 CSS 声明。`.cpa-foot` 仍用于布局，不属于本 finding。
- 失败场景：AC 4 要求窗口专属手写控件 CSS 删除且可由 grep 证明迁移完成，但这些无引用旧 selector 仍进入生产 CSS，导致旧实现残留和验收失败。
- 建议：删除上述无引用 `.back-btn`、`.cf-save`、`.cf-remove` 规则；保留仍被实际 DOM 使用的结构布局规则。

## Round 3 验证证据

- 已重新按 diff anchor `02f0b93fab91ab065a2f620cc3bf1421bf2ddc6a` 复核相关测试、组件、Settings 视图和 `globals.css`；`git diff --check` 无输出。
- 源码 selector 搜索确认 `.back-btn`、`.cf-save`、`.cf-remove` 仅出现在 `src/renderer/styles/globals.css` 声明中，未发现对应 JSX/DOM 引用。
- 本轮未运行 Playwright、build、typecheck 或 lint，避免在“只追加审阅报告”的边界外生成 artifacts 或其他文件；上一轮已有的测试与构建证据保留在 Round 2。
- 工作区状态仅保留既有 task 实施改动与本审阅报告，未生成额外验证产物。

## Round 3 结论

- 本轮新发现：2 条（`t271_gen_f004`、`t271_gen_f005`）。
- 未进表的提示：视觉 `[deploy]` 仍需人工逐屏对照；旧 selector 仅存在于迁移说明注释时不计为运行时残留；本轮未新增测试运行结果。
- 总体判断：`t271_gen_f001`、`t271_gen_f002`、`t271_gen_f003` 均已消除，但 `t271_gen_f004` 与 `t271_gen_f005` 仍为 important blocker，需修复后再开下一轮审阅。
- 系统性 follow-up：无。

verdict: FAIL

## Round 4 (2026-08-09 12:30 UTC+8)

### Round 1–3 finding 复核

- `t271_gen_f001`：已消除。`tests/e2e/web/add_account_dialog_first_frame.spec.ts:17-41` 在真实 SPA 中打开账号添加流程，使用统一 `Dialog` 的 role、`aria-modal`、遮罩尺寸和 `animationName=none` 验证首帧，不再构造或选择旧 `.acct-dialog` / `.ad-*` DOM。`src/renderer/components/AddAccountDialog.tsx:253-258` 为 Dialog 提供 `ariaLabel`，当前测试契约与实现一致。
- `t271_gen_f002`：已消除。`tests/e2e/web/settings_provider_accounts.spec.ts:17-18,28` 使用 `img[alt="OmniPanel"][width="96"]` 与版本文本定位；About 实现位于 `src/renderer/views/settings-view/sections/about_section.tsx:17-23`，不再依赖 `.ah-logo` / `.ah-ver` 运行时 selector。
- `t271_gen_f003`：已消除。`src/renderer/views/SettingsView.tsx:431-456` 为当前导航项提供 `aria-current`、primary-container 背景、accent 文字和图标颜色；`src/renderer/styles/globals.css:1257-1279` 已移除会覆盖 utility 的基础 `background` / `color`，hover 仅作用于非当前项。当前选中态不再复现 Round 2 所述 cascade 覆盖。
- `t271_gen_f004`：Round 3 的失败描述不成立，撤回该 finding，不再作为遗留 blocker。Round 3 将 `toHaveClass(/\bon\b/)` 误判为必然失败；当前按钮 class 中的 `text-[var(--color-on-surface)]` 会匹配该正则里的独立 `on`，因此该断言不能证明缺少旧 `on` class，也不能据此认定真实 E2E 红灯。独立验证 `/\bon\b/.test("text-[var(--color-on-surface)]")` 返回 `true`。同时，当前 `tests/e2e/web/settings_view.spec.ts:35-39,59-63` 已改用 `aria-pressed=true` 验证选择状态，底层测试可信度问题已消除；不需要恢复旧 `on` class。
- `t271_gen_f005`：已消除且删除范围正确。`src/renderer/styles/globals.css:1234-1240` 的 `.settings-head` 布局和 `:1582-1587` 的 `.cpa-foot` 布局仍被保留；已删除无运行时引用的 `.settings-head .back-btn`、`.cpa-foot .cf-save`、`.cf-remove` 控件规则。当前 `src/renderer` 未发现这些旧 class 的 DOM 引用，迁移未误删必要布局。

### 当前范围扫描

- 审查目标严格为 `git diff 02f0b93fab91ab065a2f620cc3bf1421bf2ddc6a`；当前 diff 的相关 Settings sections、统一 Dialog、forms/controls、Web E2E 和 `globals.css` 变更未发现新的 critical/important finding。
- `git diff --check 02f0b93fab91ab065a2f620cc3bf1421bf2ddc6a`：通过，无输出。
- 本轮未重新运行 build、lint、typecheck 或测试；不把 `task.md` 中既有通过记录作为本轮验证证据，也不在只追加审查报告的边界外生成产物。

### AC 核对

| AC   | 结论                                           | 证据                                                                                                             |
| ---- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| AC 1 | 当前代码与测试契约未发现 blocker               | 设置导航选中态、About 语义定位、统一 Dialog 和相关断言均已按迁移后实现对齐。                                     |
| AC 2 | 暂无 finding                                   | 本轮复核相关设置分区、控件与配色变更，未发现新的重要问题。                                                       |
| AC 3 | 自动检查范围内暂无 finding，视觉部分未完全自证 | 迁移后的主题 token 与选中态规则已复核；视觉 `[deploy]` 仍需人工逐屏对照。                                        |
| AC 4 | 当前代码与测试范围未发现 blocker               | 旧 Settings 专属控件 selector 已从生产 CSS 清除，保留项仅为实际使用的布局规则；Web 测试不再依赖对应旧 selector。 |
| AC 5 | `[deploy]` 未自证                              | 本轮未执行迁移前后逐屏截图人工对照。                                                                             |

## Round 4 结论

- 本轮新发现：0 条。
- Round 3 的 `t271_gen_f004` finding 撤回；其余 `t271_gen_f001`–`t271_gen_f003`、`t271_gen_f005` 已消除。
- 未进表的提示：视觉 `[deploy]` 仍需人工逐屏对照；本轮未重跑 build、lint、typecheck 或测试，因此不新增自动化通过声明。
- 总体判断：按目标 anchor diff 复核，当前未发现未解决的 critical/important blocker。
- 系统性 follow-up：无。

verdict: PASS
