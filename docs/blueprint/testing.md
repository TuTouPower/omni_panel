# 测试

`{doctor_cmd}` / `{test_cmd}` / `{blackbox_verify}` 必须在本文件给出说明。

- `{doctor_cmd}`：环境前置检查——本仓无独立 doctor 命令；`task-run` Step 1 写「无」，靠 `{test_cmd}` 各命令自身的失败信号判定环境。
- `{test_cmd}`：日常测试（红/绿），见下方「门禁类别清单」。
- `{blackbox_verify}`：黑盒验证——是一套方法论，不是单个命令。agent 按本文件描述自行决定如何执行。

日常命令速查（人读）见 `docs/guides/testing.md`；本文件是权威定义。

## Schema / codegen 验证

本仓无 schema、migration 或 codegen 工具（无 Prisma / Alembic / gql-codegen）。

- 触发路径：无
- 生成命令：无
- 验证命令：无
- 合并后动作：无
- migration 窗口：无

`src/generated/build-info.ts` 由 `scripts/gen-build-info.ts` 在 `pnpm build` 时生成（git 信息），不进库（`.gitignore`）；`build` 命令本身会重新生成，无需独立 codegen 步骤。

## 门禁类别清单

填 `{test_cmd}` 时按本节逐类覆盖。运行时通过 ≠ 类型 / 构建正确，每类须有独立验证。本仓当前全部绿。

| 类别                    | 命令             | 说明                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 单元测试                | `pnpm test`      | vitest run；单元 + 集成。mock 不得掉被测逻辑、断言不得过弱（假绿）。vitest.config.mts 用 projects 拆两项目（t177）：`renderer`（jsdom + `tests/smoke/setup.ts`，`tests/unit/renderer/**`、`tests/smoke/**`、`tests/unit/web/**`）+ `node`（node 环境无 setupFiles，其余全部）。新增测试目录须列入对应项目 include，否则被静默跳过。 |
| 生产 + 测试代码类型检查 | `pnpm typecheck` | `tsc --noEmit`；`tsconfig.json` 的 `include` 含 `src` 与 `tests`，生产与测试代码同一次检查覆盖。                                                                                                                                                                                                                                    |
| lint                    | `pnpm lint`      | `eslint src tests scripts connectors tests/fixtures *.ts *.mts --max-warnings=0`；零 warning 零 error。                                                                                                                                                                                                                             |
| 生产构建                | `pnpm build`     | `gen-build-info` + `electron-vite build` + `vite build`（web）；暴露 codegen、RSC 边界、server-only 导入等问题。                                                                                                                                                                                                                    |

综合门禁速查：`pnpm check`（typecheck + lint + format:check + deadcode + arch）。

### worktree 注意事项

task 在 `../omni_usage_{tid}/` worktree 执行时，worktree 无 `node_modules`，门禁命令需先备依赖：

- `pnpm install --prefer-offline`：pnpm store 全局共享，较快；推荐。
- 或软链主仓 `node_modules`（快但需注意 better-sqlite3 原生 ABI）。
- better-sqlite3 ABI 由 `scripts/ensure_sqlite_abi.mjs` 在 worktree 内按 Electron/Node 运行时切换；`pnpm test` 前置 `node scripts/ensure_sqlite_abi.mjs node`。
- `src/generated/`（gitignore）需在 worktree 内先 `npx tsx scripts/gen-build-info.ts` 生成，否则 `build-info-ipc` 相关测试整批必挂（t218 实测）。

## 黑盒验证（{blackbox_verify}）

黑盒按 task 范围选择层级，非单个命令：

- 默认：`pnpm test`（主）。
- 涉及打包 / 托盘 / 多窗口 / 真实 Electron 行为：`pnpm package` 后真实启动 `artifacts/win-unpacked/OmniPanel.exe`，跑 `pnpm test:packaged`（CDP 连 exe 的 smoke）。
- 涉及连接器 live 契约：`pnpm test:contract:live`（打真实上游，需凭据）。
- 涉及 web SPA：`pnpm test:e2e:web`（Playwright chromium，mock local-api）。会话面板关键路径由 `tests/e2e/web/session_panel.spec.ts` 覆盖（双页签状态保留 / 打开会话装槽与消息渲染 / 槽满 toast / 摘选三格式复制 / 会话库搜索筛选排序预览并排打开闭环），数据来自 synthetic fixture（`scripts/e2e/session_fixture.mjs` → `tests/e2e/fixtures/synthetic.json`）；本地与 CI 均须 `MOCK_FIXTURE=synthetic` 运行（`playwright.config.ts` webServer 固定 `--host 127.0.0.1` 供 Windows IPv4 可达）。
- 涉及测试实例隔离验证：`pnpm start:test`（黄图标、沙盒数据、17864 端口），见 `docs/guides/testing.md`「测试实例」。
- 代理面板性能基线：`pnpm exec tsx scripts/token-stats-baseline.ts --records 600000 --output .scratch/t189/baseline.json`；固定 seed 生成脱敏临时 SQLite，覆盖 24h/7d/30d 与 agent/platform 组合，比较查询、payload 和 renderer 转换阶段。报告只作相对基线，不把绝对耗时设为 CI 门禁。

黑盒失败处置见 `task-run` skill：`< max_verify_round` 回 Step 3 修复；`≥ max_verify_round`（默认 5）`block --reason blackbox`。
