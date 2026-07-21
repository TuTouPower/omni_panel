# Task report T015

本报告所在 commit 即 task commit，SHA 由 `git log --grep T015` 查，不在此记录。

## spec 验收标准勾选

- [x] `tests/e2e/fixtures/synthetic.json` 生成 + 入库。 - gen_synthetic 产 10 responses，synthetic.json 不被 .gitignore。
- [x] synthetic.json 无真实账号邮箱。 - EMAIL*RE 替换 + 兜底校验通过（仅 demo*\*@example.com）。
- [x] `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 跑通。 - 21 passed。
- [x] ci.yml 加 web smoke step。 - "Run web e2e smoke (synthetic fixture)" step，MOCK_FIXTURE=synthetic。
- [x] `pnpm test`（vitest）不受影响。 - 1407 passed。

## adoption 处置摘要

- 已修 6 项 / 遗留 0 项 / 无需修改 0 项
- T015_code_f001/f002/f003 — 采纳：mock_server 提示分支 + trend redact + plugin 日志 env 判断
- T015_test_f001/f002/f003 — 采纳：testing.md CI 策略 + 录制段 + ADR 008 落地

## 遗留问题

- 无。ADR 008 CI web 通道遗留已由 T015 收口；real fixture 仍仅本地（gitignore）。
