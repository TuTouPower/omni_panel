# Task review T022

- task：`T022_plugin_failure_to_web`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 09:30 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T022_code_f001 — spec.md 范围与验收标准未同步实际方案（items=[] → real KIMI items=2 stale）

- 严重度：low
- 位置：`docs/tasks/T022_plugin_failure_to_web/spec.md:9-10,18-19`
- 问题：spec.md 范围仍写 "手造 failed connector（instanceId=mock-failed-connector, enabled, snapshot.status=failed, items=[], error="mock failure"）"，验收标准 "[ ] synthetic.json 含手造 failed connector（status=failed, items=[], error）"。实际 `scripts/e2e/gen_synthetic.mjs:67-79` 实现是 `find(real_connectors, i => i.enabled === true && i.snapshot?.status === "failed")` 取 real KIMI（instanceId=ca494b59…, items=2 stale, error="HTTP 401: request failed (236 bytes)"）。spec 背景第 5 行明确提到 "real KIMI failed 带 stale items 渲染 stale banner"，即方案变更的依据存在于背景，但范围/验收未随方案调整更新，留下文档 drift。
- 建议：在 spec.md 范围与验收标准里把"手造 failed connector（items=[]）"替换为"取 real enabled+failed connector（如 KIMI 401 带 stale items）"，与 `gen_synthetic.mjs` 实现和 background 对齐。若 owner 倾向于保留原方案文字，至少在 task_report.md 说明实际落地的方案变体。

### T022_code_f002 — web spec 注释事实错误（误导读者）

- 严重度：low
- 位置：`tests/e2e/web/plugin_failure_modes.spec.ts:5-9,17,20`
- 问题：注释写 "real/synthetic fixture 含 failed+无items connector（real GLM/MIMO/MINIMAX 缺 secret；synthetic 从 real 取一个 failed 加入）触发 ProviderCard `.card-state.err`"。但：(1) synthetic 实际加入的是 KIMI 401（enabled+failed, items=2 stale），不是 GLM/MIMO/MINIMAX；(2) KIMI 带 items=2（非"无items"），实际走 ProviderCard `has_stale_error` 分支渲染 `render_error_banner`（`src/renderer/components/ProviderCard.tsx:209-227`，前缀"采集失败："+"重试" action），不是 `isFailed` 分支的纯 failed card。第 17 行"failed+无items connector 渲染 .card-state.err"与第 20 行"Missing required secret / HTTP 401 / 等"混杂不同分支的文案，读者难以对应代码。
- 建议：注释改为 "real/synthetic fixture 含 enabled+failed connector（synthetic 从 real 取 KIMI 401，items 非空 → stale banner 同样渲染 `.card-state.err`）触发 ProviderCard `render_error_banner` 分支"。span 断言本身仍成立（banner 第二个 span 是 "采集失败：…"，非空），不必改断言。

## 结论

代码实现正确、克制：`gen_synthetic.mjs` find 条件 `enabled === true && snapshot?.status === "failed"` 精确匹配 KIMI 401；failed instance、state、secrets 三 key 完整 push 并全部过 `redact()`（邮箱脱敏 + secrets 值为 `"***"`）；非范围边界守住（未改 real responses.json、T010 mock_server、SPA 源码）。web spec 用 `.card-state.err`（泛化、不锁 provider）合理，real/synthetic 两端都能落到 KIMI stale banner；retry action 用 `if (count > 0)` 守卫与 ProviderCard `onRefresh` 条件渲染一致。删 electron 版本 3 case 合理——mock 无法造 error/crash/slow runtime behavior 区分，failed card 渲染已由 web e2e 覆盖，behavior 区分归 connector 单测。

两处 finding 均为文档/注释 drift（low），不阻塞 task done，建议在收尾前修正 spec.md 与 web spec 注释，避免后续 T023+ 或归档读者被误导。
