# Task plan

## 步骤与验证

1. 跑既有测试确认基线绿（`pnpm test`）→ 验证：基线全绿。
2. 抽配置保存/导入回调为 controller 模块，依赖显式注入（currentConfigSnapshot / secretParamKeys / orchestrator / grokOAuthManager / tokenStatsManager / BrowserWindow / main_panel_controller）→ 验证：`pnpm typecheck` 通过。
3. 抽 IPC 注册编排为 bootstrap 模块，`index.ts` 仅保留入口装配与调用 → 验证：`pnpm test` 绿。
4. 行数核验（`index.ts` 与新文件均 ≤ 800 行）→ 验证：`wc -l`。
5. 打包 smoke：真实启动 `artifacts/win-unpacked/OmniUsage.exe`（`pnpm test:packaged`）→ 验证：启动正常、主面板可用。

## 风险与回退

- 风险：IPC 注册顺序改变引发行为差异；controller 抽离时闭包依赖漏注入；打包入口路径引用变化。
- 回退：纯搬移改动，按 `git diff` 分块还原；打包 smoke 失败即回退到最后绿态。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：main 进程入口/bootstrap 模块边界变化需同步；无变化则不更新。
