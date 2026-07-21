# Task spec

## 背景

ADR 008 遗留：web e2e fixture（`tests/e2e/fixtures/data/responses.json`）含本机真实账号 gitignore，CI 无 responses.json 跑不了 web e2e，web SPA 数据链路失 CI 覆盖。需造 synthetic seed fixture（脱敏假账号）入库供 CI smoke，恢复 CI web 回归通道。

## 范围

- **`scripts/e2e/gen_synthetic.mjs`**：从真实 `data/responses.json` 取前 N instance + 对应 state/secrets/config，脱敏 accountLabel/accountEmail/email 为 `demo_${provider}@example.com`，输出 `tests/e2e/fixtures/synthetic.json`（**入库**，无真实账号）。
- **mock 切换**：`mock_server.mjs` + `vite_mock_plugin.mjs` 读 `MOCK_FIXTURE` 环境变量（默认 `real`=data/responses.json；`synthetic`=fixtures/synthetic.json）。
- **ci.yml**：e2e job 加 web smoke step（`MOCK_FIXTURE=synthetic pnpm test:e2e:web`）。
- **.gitignore 例外**：`tests/e2e/fixtures/synthetic.json` 入库（`data/` 仍 gitignore）。

## 非范围

- 不改 web spec 内容（smoke 用既有 web/ spec）
- 不改 gen_fixture（真实录制）
- 不改 packaged/electron project

## 验收标准

- [ ] `tests/e2e/fixtures/synthetic.json` 生成 + 入库（非 gitignore）
- [ ] synthetic.json 无真实账号邮箱（全 demo\_\*@example.com）
- [ ] `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 跑通（chromium + synthetic mock）
- [ ] ci.yml 加 web smoke step
- [ ] `pnpm test`（vitest）不受影响

## 依赖与约束

- synthetic.json 入库（无敏感）；data/responses.json 仍 gitignore（本机真实）
