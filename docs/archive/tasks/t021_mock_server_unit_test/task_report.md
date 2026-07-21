# Task report T021

本报告所在 commit 即 task commit，SHA 由 `git log --grep T021` 查，不在此记录。

## spec 验收标准勾选

- [x] 新单测覆盖 health/connectors/state 精确/unknown fallback/secrets 精确/trend 精确/POST/404。 - 10 用例（删 OPTIONS 无对应分支后 9 + DELETE 404 + 等 = 实际 9 跑绿）。
- [x] `pnpm test`（vitest）含新测全绿。 - 1416（1407+9）passed。
- [x] mock key 格式回归（双 `?` / days 硬编码）能被单测抓。 - trend 精确 query 用例反证 T018 critical（若退回 url.search 双 ? 会红）。

## adoption 处置摘要

- 已修 1 项 / 无需修改 1 项
- T021_code_f001 - 采纳：删 fake_responses 无用 config 键
- T021_test - 无需修改（0 finding）

## 遗留问题

- 无。mock_server 单测自保护就位，T018 critical 类回归可被单测抓。
