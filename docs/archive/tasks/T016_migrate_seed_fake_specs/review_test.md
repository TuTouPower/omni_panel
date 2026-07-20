# Task review T016

- task：`T016_migrate_seed_fake_specs`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 03:51 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T016_test_f001 — multi_account case 1 dedup 断言偏弱

- 严重度：suggestion
- 位置：`tests/e2e/web/multi_account.spec.ts:12-33`（"multiple enabled connectors with same provider merge into one card"）
- 问题：case 名为"merge into one card"，但实际断言仅为 `duplicates (同 card-name 出现 >1 次) 为空`。该断言无法区分"3 个 KIMI connector 合并为 1 张 Kimi card（期望）"与"任何 card-name 都只出现一次（包括只有 1 个 connector 的 provider 也满足）"。即原 electron 版用 dup-svc-plugin + dup-svc-plugin-2 明确验证"合并"，迁移后断言弱化为"无重复"，未约束合并数。real fixture 下 KIMI 3 enabled connector → 应断言"Kimi card 恰好 1 张"，否则 dedup 行为退化（例如未来误改为每 connector 一张 card）不会被捕获。
- 建议：在现有 duplicates 断言基础上，追加对 KIMI 合并结果的强校验。例：
    ```ts
    const kimi_cards = live.locator(".card .card-name", { hasText: "Kimi" });
    await expect(kimi_cards).toHaveCount(1);
    ```
    保持泛化（不锁 "Demo Plugin" 等 fake 值），但锁死"3 connector → 1 card"的合并语义。

## 结论

验收标准 4 条逐条验证：

1. **迁 web/** — 7 spec 完成（multi_account、opencode_go_usage、popup_card_states、popup_card_collapse_height、popup_drag_handle、popup_height_debounce、popup_refresh_state_reset），与 spec 范围一致。
2. **test:e2e:web 全绿** — real fixture 37 passed（含新迁 16 case）；synthetic 35 passed + 2 skipped。
3. **失败/强依赖 fake case 处理** — 删 1（popup_card_states "auth failure shows settings link"：mock 无 enabled + isFailed + is_auth connector，删因合理）；留 electron 2（account_operations：UI 重构后旧 selector 失效，非 seed_fake 问题，T016 范围外，log 注明需另 task；plugin_failure_modes：3 case 强依赖 seed_fake error/crash/slow 行为，mock 无对应 fixture）。log 记录完整。
4. **vitest 不破** — 1407 passed，未受影响。

**7 spec 断言测期望行为评估**（非旧 fake 硬编码）：

- multi_account：dedup（弱，见 f001）+ Antigravity 多 bar（>=1，real fixture 2 period gemini-models/claude-gpt，断言泛化合理）。
- popup_card_states：stale error banner `.card-state.err` + "重试" 文案（与 ProviderCard render_error_banner 对应，real KIMI 401 failed + stale items 触发）；critical fill `var(--risk-red)`（与 usage-colors risk_current_level pct>=95 对应，real Codex 3/4 critical）。
- popup_card_collapse_height：scrollHeight 测真实布局变化，非 getBoundingClientRect 在固定 viewport 下失效的旧方式。
- popup_drag_handle：`mouse.down` + `mouse.move({steps:8})` 触发原生 dragstart，断言祖先 `.card` 加 `dragging` class，对应 ProviderCard drag_root_props + card_class 逻辑。
- popup_refresh_state_reset：全局刷新按钮 `getByTitle("刷新全部")` 后折叠态保留 + spinner 清理。
- popup_height_debounce：折叠/展开高度循环 + `.popup-mirror` 在 web 下不渲染（Electron 专属预渲染）断言合理。
- opencode_go_usage：OpenCode Go tab 多账号 + 三窗口文案（滚动/一周/一月），real 8 workspace 覆盖。

**synthetic skip 2 case** — opencode_go_usage（synthetic 无 opencode_go provider）+ popup_card_states retry banner（synthetic 无 failed connector）。依赖 real 特性，CI synthetic smoke 不覆盖可接受，本地 real fixture 跑覆盖。

**web e2e 覆盖提升** — 21 → 37 passed（+16 case），覆盖 dedup / 多账号 / 多 bar / stale error / critical 颜色 / 折叠高度 / 拖拽 / 刷新保留 / 防抖 / mirror 树缺失等核心 DOM 行为，覆盖度显著提升。

**总体判断**：1 个 suggestion（dedup 弱化），无阻断问题。迁移达到 spec 验收标准，断言泛化、删/留决策有据，覆盖度真实提升。建议 owner 视情况采纳 f001 强化 dedup 断言。
