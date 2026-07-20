# Adoption T013

逐条处置 `review_code.md` 和 `review_test.md` 的 finding。流程见 AGENTS.md step 7。

| finding_id     | decision | rationale                                                 | status |
| -------------- | -------- | --------------------------------------------------------- | ------ |
| T013_code_f001 | 采纳     | "录 61 responses" 硬编码依机器变；改"全部 + 基线 61"      | 已修   |
| T013_test_f001 | 采纳     | 录制步骤 1 补 packaged/dev 两条具体启动命令 + health 验证 | 已修   |
| T013_test_f002 | 采纳     | 三路对照表 web 行补"首次需先录 fixture"提示               | 已修   |
| T013_test_f003 | 采纳     | CI 策略小节补 ADR 008 synthetic seed 遗留回引             | 已修   |

## 处置说明

4 条 finding 全是 `docs/guides/testing.md` 清晰度补强，一次 Edit 修完：

- **f001**：步骤 2 "录 61 responses" → "录全部 responses... 响应数随本机 instance 数变化（T010 基线 61）"。
- **test_f001**：步骤 1 拆 packaged（先 `pnpm package` 再 `./artifacts/win-unpacked/OmniUsage.exe`）/ dev（`pnpm start`）两条命令 + `curl /v1/health` 验证。
- **test_f002**：三路对照表 web 行"何时跑"补"（首次需先录 fixture，见上节）"。
- **test_f003**：CI 策略小节末加"遗留：若未来要 CI web 回归，需造 synthetic seed fixture 入库，见 ADR 008"。

仅文档改动，不触发重审。
