# Task review T016

- task：`T016_migrate_seed_fake_specs`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree，含 7 spec `git mv` electron/ → web/ + 改造 + `docs/tasks_index.md` 状态翻 `active`）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 03:55 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T016_code_f001 — stale error banner 用 `count()` 即判 skip，时序敏感

- 严重度：low
- 位置：`tests/e2e/web/popup_card_states.spec.ts:24-28`
- 问题：`stale error banner shows retry action` case 在 `waitReady()`（等 `.app-title`）后立即 `await err_banner.count()` 判 skip。`.card-state.err` 由 connector 数据渲染后才出现，与 `app-title` 可见不是同一拍；mock 下通常快到不可察，但 slow CI / 弱机理论上可能 `count() === 0` 导致 real fixture 误跳过（实测 37 passed 未触发，仅潜在 flake）。
- 建议：判 skip 前给错误 banner 一个短 timeout 的可见性探测。例如：
    ```ts
    const has_err = await err_banner
        .first()
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
    if (!has_err) test.skip(true, "...");
    ```
    或保持现有 `count()` 但显式 `await webPage.waitForTimeout(300)` 给渲染缓冲。当前实现不阻断合入。

### T016_code_f002 — HTML5 drag `mouse.move({steps:8})` 由来注释偏简略

- 严重度：suggestion
- 位置：`tests/e2e/web/popup_drag_handle.spec.ts:29-30`
- 问题：注释 `// native dragstart 需 mouse 在按住状态下移动若干像素` 描述正确，但未解释为何原 electron 版（HEAD `popup_drag_handle.spec.ts`）仅 `mouse.down()` 就能断言 `.dragging` 类。Electron 也用 Chromium，理论一致；推测原 electron 版工作是因为 `.dragging` 类由 React DnD / pointer 事件监听器在 `pointerdown` 即设置，或 Electron `BrowserWindow` focus 状态不同导致 Playwright 事件命中时序差异。未深查，但维护者未来可能困惑该步是否冗余。
- 建议：注释中补一句"原 electron 版无此步，web headless 必需；若未来重构拖拽实现（e.g. 改 pointerdown 监听），可重测是否仍需"，或留 TODO 链接到排查记录。当前实现正确，仅注释建议增强。

### T016_code_f003 — log "关键改动点 3" 高度测量描述不精确

- 严重度：suggestion（文档瑕疵）
- 位置：`docs/tasks/T016_migrate_seed_fake_specs/log.md:37`
- 问题：log 写"高度测量：Electron 窗口高度跟随内容 → web viewport 固定，改测 `.scroll-inner.scrollHeight`"。实际上：
    - `popup_height_debounce.spec.ts` 确由 `[data-popup="live"] getBoundingClientRect().height` 改为 `.scroll-inner.scrollHeight`（符合描述）。
    - `popup_card_collapse_height.spec.ts` **原本**就用 `.scroll-inner.scrollHeight`（HEAD `popup_card_collapse_height.spec.ts:24` 已是 `content.evaluate((node) => node.scrollHeight)`），未改测量基准，仅 selector 由 `name: /折叠 Height Account A/` 硬编码改为 aria-label 动态提取。
    - 描述未区分两 spec，易误导后续维护者以为 `popup_card_collapse_height` 也改了测量方式。
- 建议：log 改为"高度测量：`popup_height_debounce` 由 live 外框 getBoundingClientRect 改测 `.scroll-inner.scrollHeight`（web viewport 固定，外框不随内容变化）；`popup_card_collapse_height` 沿用原 `.scroll-inner.scrollHeight`，仅 selector 泛化"。非阻断。

### T016_code_f004 — CSS attribute selector 字符串插值未转义

- 严重度：low
- 位置：`tests/e2e/web/popup_card_collapse_height.spec.ts:32,56,59,109`、`popup_height_debounce.spec.ts:36,42`、`popup_refresh_state_reset.spec.ts:24,29` 等所有 `button[aria-label="展开 ${account_label}"]` / `button[aria-label="折叠 ${account_label}"]` 处
- 问题：account_label 由 `aria-label.replace(/^折叠\s+/, "")` 提取后直接拼入 CSS attribute selector，未转义 `"`、`]`、`\`。当前 real/synthetic fixture 账号 label 均为邮箱 / provider 帐号名（无特殊字符），实测稳定。若未来 fixture 引入含特殊字符的 label（罕见），selector 会 syntax error。
- 建议：改用 Playwright locator 更稳健：
    ```ts
    live.getByRole("button", { name: `展开 ${account_label}`, exact: true });
    ```
    Playwright 内部处理转义，且语义更清晰。当前代码可工作，属加固建议。

## 结论

4 finding（1 low + 1 low + 2 suggestion），均非阻断。

实现与 spec 一致：

- 7 spec 成功去 electron 依赖（`grep` 确认无 `\bomni\b` / `firstWindow` / `seed_fake_plugin` / `createTestWithSetup` / `openViaIpc` 代码残留；仅注释中保留对原 electron 版的说明，符合预期）。
- fixture import 路径统一 `../fixtures/test_web`，`webPage` 命名一致。
- 断言泛化保留业务价值：dedup 无重复 card-name、collapse/expand height 差值方向、critical fill 颜色、HTML5 drag `.dragging` 类、三窗口翻译文案、tab 切换折叠态保留、刷新后 spinner 清理——均非"仅非空"级断言。
- selector 泛化（`aria-label` 动态提取 + `replace(/^折叠\s+/, "")`）合理，未硬编码邮箱或 provider。
- 高度测量改 `.scroll-inner.scrollHeight`（仅 `popup_height_debounce`）针对 web viewport 固定语义丢失的对策合理；`popup_card_collapse_height` 沿用原测量未变。
- HTML5 drag `mouse.move({steps:8})` 在 web 下必要，测试通过。
- synthetic skip 2 case（opencode_go 整 case + popup_card_states retry banner）依赖 real 特性，合理。
- 删 1 case（auth failure settings link）：real/synthetic 均无 `is_auth_error` 匹配的 failed connector，无法平移，删除合理；留 2 electron spec（account_operations UI selector 失效 / plugin_failure_modes 强依赖 fake error 行为）分类清晰，与 spec 非范围一致。
- 非范围守住：`git diff --stat` 确认 `tests/e2e/fixtures/`、`tests/e2e/pages/`、`src/` 零改动，T010 基建 / mock / synthetic / pages 未被动。

建议 adoption 阶段酌情采纳 f001（skip 前加 timeout 探测，降低 flake）与 f004（CSS selector 改 getByRole，未来更稳）。f002 / f003 属注释 / 文档增强，可选。
