# Task review t065（reviewer_focus: 测试）

- task：`t065_build_config_cleanup`
- spec：`docs\tasks\t065_build_config_cleanup/spec.md`
- diff_anchor：`1d85c46dab2e6f9820717de6ce69dc4f359a2161`
- target：`git diff 1d85c46dab2e6f9820717de6ce69dc4f359a2161`
- round：1
- reviewed_at：2026-07-23 21:50 UTC+8

## Findings

（无）

## AC 覆盖与可测性评估

改动范围（`git diff 1d85c46..HEAD` 非 docs 部分）：

1. `package.json:22` — `lint` 脚本扩展为 `eslint src tests scripts connectors tests/fixtures *.ts *.mts --max-warnings=0`（I24 范围子集）。
2. `scripts/package-and-run.ts:13` — `procs` 由 `["OmniUsage.exe", "electron.exe"]`（win） / `["OmniUsage", "electron"]`（其他）收敛为仅 `OmniUsage.exe` / `OmniUsage`（I26）。
3. `index.html` — 删除（I27）。

无测试文件新增/修改/删除。

**可测性判断**：

- **lint 范围扩展（I24）**：属 dev 工具配置改动，`pnpm lint` 本身即验证手段；项目无 lint 范围 regression 测试惯例（`tests/` 未发现 scripts 或 config 守护测试）。强行加测试违反「不为一次性代码做抽象」。
- **package-and-run.ts 进程名收敛（I26）**：改的是开发辅助脚本（`scripts/`），项目惯例 `scripts/` 无单元测试覆盖（`tests/scripts/` 不存在）；改动方向是**降低**副作用范围（通杀 electron.exe → 仅 OmniUsage.exe），无可证伪的产品行为需测。
- **删 index.html（I27）**：文件删除无逻辑可测；该文件原本引用不存在的 `/src/renderer.ts`，不参与构建。

**危险模式扫描**：diff 无测试文件改动，N/A。

**AC 第9条（`pnpm lint + typecheck + test + package` 全绿）**：task.md 收尾报告勾选 `pnpm typecheck + test + lint 全绿`，**未勾 `pnpm package`**。此为流程 completeness 问题（implementer 自述），不属于测试维度 finding；提示 adoption 阶段确认 `pnpm package` 是否实跑。本 task 删 index.html、未动 vite/electron-builder 配置主体，理论上不影响打包，但 AC 明示要求，应核实。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：本 task 为构建配置/开发脚本清理，无产品代码行为改动，无测试文件改动合法。lint 扩展以 `pnpm lint` 自身验证；package-and-run.ts 属项目惯例不测的 `scripts/`；index.html 删除无逻辑可测。范围外提示：建议 adoption 阶段核实 `pnpm package` 是否按 spec AC 第9条实跑（task.md 收尾报告漏勾）。

verdict: PASS
