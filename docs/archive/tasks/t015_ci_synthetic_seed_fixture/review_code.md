# Task review T015

- task：`T015_ci_synthetic_seed_fixture`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-20 23:05 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` -> `review_code.md` / 前缀 `code`；`测试` -> `review_test.md` / 前缀 `test`。

## Findings

### T015_code_f001 - mock_server.mjs main() 缺失提示未区分 synthetic

- 严重度：medium
- 位置：`tests/e2e/fixtures/mock_server.mjs:60-63`
- 问题：`main()` 分支里 `MOCK_FIXTURE=synthetic` 且 `tests/e2e/fixtures/synthetic.json` 不存在时，提示仍为固定 `先跑 pnpm e2e:gen-data`，与 `vite_mock_plugin.mjs:16-23` 的分支提示不一致（后者 synthetic 分支正确指向 `e2e:gen-synthetic`）。spec 范围明确要求 mock_server 读 MOCK_FIXTURE 切换；缺失提示作为切换逻辑的配套语义，应在两处保持一致，否则 CI 排查路径会误导。
- 建议：复用 `vite_mock_plugin.mjs` 的三元写法，按 `process.env.MOCK_FIXTURE === "synthetic"` 给出对应命令提示。

### T015_code_f002 - gen_synthetic trend 未走 redact 兜底

- 严重度：low
- 位置：`scripts/e2e/gen_synthetic.mjs:58-59`
- 问题：`out[trendKey] = resp[trendKey]` 直接原样拷贝，未过 `redact()`。当前 fixture trend 为 `[null,...,null]`（7 个 null），无敏感；但真实录制时 trend 若含邮箱或可识别字符串（如 accountLabel 回显），会绕过 `EMAIL_RE` 兜底校验直接落盘入库。兜底校验虽能捕获邮箱，但 trend 若含非邮箱的敏感字段（如 prompt 片段）则漏检。
- 建议：`out[trendKey] = redact(resp[trendKey], provider, i)`；与其他分支保持一致。当前不构成泄露，属防御性建议。

### T015_code_f003 - mock_api_plugin 挂载日志用路径子串判断 fixture 类型

- 严重度：suggestion
- 位置：`tests/e2e/fixtures/vite_mock_plugin.mjs:32`
- 问题：`f.includes("synthetic") ? "synthetic" : "real"` 用路径字面量判断 fixture 类型。当前路径 `tests/e2e/fixtures/data/responses.json` 不含 "synthetic"，逻辑正确；但与上面 `MOCK_FIXTURE === "synthetic"` 的判断依据不统一，若未来 real fixture 路径或文件名变化（如 `synthetic_real.json`）会误报。
- 建议：用 `process.env.MOCK_FIXTURE === "synthetic" ? "synthetic" : "real"` 与分支判断保持一致。

## 结论

3 findings（1 medium / 1 low / 1 suggestion），无 critical/high。

- 脱敏充分：`EMAIL_RE` 递归替换任意 string 内邮箱子串，synthetic.json 实测仅 2 个邮箱均 `demo_*@example.com`；records/sessions/buckets 跳过（含真实 prompt），未出现在产物中；兜底校验通过。
- MOCK_FIXTURE 切换逻辑：`mock_server.mjs` RESP_FILE 与 `vite_mock_plugin.mjs` f 路径分支正确（默认 real，synthetic 指向 fixtures/synthetic.json）；缺失提示仅在 mock_server main() 不一致（f001）。
- synthetic.json 入库合理：`.gitignore` 仅排 `tests/e2e/fixtures/data/`，synthetic.json 路径未被 ignore；文件脱敏后无真实账号。
- ci.yml web smoke step 在 "Package app" 之后、"Run packaged smoke tests" 之前；`MOCK_FIXTURE: synthetic` env 正确设置（ci.yml:67-74）。
- 非范围守住：working tree 未触碰 web spec / `scripts/e2e/gen_fixture.mjs` / packaged 或 electron project 文件；`package.json` 仅加 `e2e:gen-synthetic` script 一行。

总体实现与 spec 一致，核心脱敏与 CI 通道恢复达成。建议采纳 f001（一致性 bug），f002/f003 视 owner 判断。
