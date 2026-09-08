# d056 cli_flow「干净退出」用例 main 基线即红

- 来源：t459 task（AC-002 serve 回归验证时发现）
- 结论：`tests/e2e/cli/cli_flow.spec.ts:184`「实例在测后干净退出（quit 控制）」在 main（2f5bc2f3）上即失败（health 10s 内不可达判定 gone=false）；同 spec 其余 3 例通过。非 t459 改动引入。
- 证据：main 与 t459 worktree 各跑 `E2E_NO_WEBSERVER=1 pnpm exec playwright test --project=cli -g "干净退出"`，均 fail；error-context 断言 `expect(gone).toBe(true)` 收到 false。
- 影响：AC-002（serve 写 cli.json）由同 spec 其余用例（AC1/AC2 端口一致性、config 导入）与 t459 的 GUI 用例覆盖，仍可闭环；quit 退出路径回归需独立排查（可能是 quit 控制与 closeApp 竞态）。
- 现状：有效
