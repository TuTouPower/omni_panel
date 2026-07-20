# Adoption T015

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                           | status |
| -------------- | -------- | ------------------------------------------------------------------- | ------ |
| T015_code_f001 | 采纳     | mock_server main() 缺失提示未按 MOCK_FIXTURE 分支，与 plugin 不一致 | 已修   |
| T015_code_f002 | 采纳     | gen_synthetic trend 未过 redact，防御性；改 redact(trend)           | 已修   |
| T015_code_f003 | 采纳     | vite_mock_plugin 日志用路径子串判断 fixture 类型；改用 env 一致     | 已修   |
| T015_test_f001 | 采纳     | testing.md CI 策略段过时（仍写 web 不 CI）；改 synthetic web smoke  | 已修   |
| T015_test_f002 | 采纳     | testing.md 录制段未提 gen-synthetic；补 synthetic 段                | 已修   |
| T015_test_f003 | 采纳     | ADR 008 遗留未关闭；追加 T015 落地状态 + 遗留清空                   | 已修   |

## 处置说明

- **code_f001（触代码）**：`mock_server.mjs` main() 缺失提示改三元（synthetic→gen-synthetic，real→gen-data），与 vite_mock_plugin 一致。
- **code_f002（触代码）**：`gen_synthetic.mjs` trend 拷贝改 `redact(resp[trendKey], "trend", 0)`，防御性。
- **code_f003（触代码）**：`vite_mock_plugin.mjs` 日志 fixture 类型判断改 `process.env.MOCK_FIXTURE === "synthetic"`，与分支依据统一。
- **test_f001（仅文档）**：testing.md "CI 策略"段重写——CI 跑 vitest + MOCK_FIXTURE=synthetic test:e2e:web + test:packaged（原"web 不 CI"过时）。
- **test_f002（仅文档）**：testing.md 录制段补 synthetic seed fixture 子段（gen-synthetic 用途 + 何时重生成）。
- **test_f003（仅文档）**：ADR 008 追加"落地（T015）"段，记录 CI web 通道恢复 + 遗留清空。

重跑 `MOCK_FIXTURE=synthetic pnpm test:e2e:web` → 21 passed；typecheck 过。
