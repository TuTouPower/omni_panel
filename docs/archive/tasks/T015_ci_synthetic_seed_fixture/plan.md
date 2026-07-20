# Task plan

## 步骤与验证

1. 写 `scripts/e2e/gen_synthetic.mjs`（读 data/responses.json，脱敏取子集） → 验证：跑产 synthetic.json
2. 跑 gen_synthetic → 验证：synthetic.json 含 demo 邮箱，无真实
3. 改 `mock_server.mjs` + `vite_mock_plugin.mjs` 支持 MOCK_FIXTURE env → 验证：grep 环境变量分支
4. `MOCK_FIXTURE=synthetic pnpm test:e2e:web` → 验证：跑通
5. `tests/e2e/fixtures/synthetic.json` 入库（.gitignore 只排 data/） → 验证：git status 显示 synthetic.json
6. ci.yml 加 web smoke step → 验证：ci.yml 含 MOCK_FIXTURE=synthetic
7. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：synthetic 脱敏不彻底（漏字段）→ grep 真实邮箱域名兜底
- 风险：synthetic 结构不完整致 web 渲染崩 → 本地 MOCK_FIXTURE=synthetic 跑通验证
- 回退：删 synthetic.json + mock 还原 + ci.yml 删 step

## Finalization 时更新的 blueprint

- 无（ADR 008 遗留收口，不需新 ADR）
