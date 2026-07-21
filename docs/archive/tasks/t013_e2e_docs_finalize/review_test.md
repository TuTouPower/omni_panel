# Task review T013

- task：`T013_e2e_docs_finalize`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-21 03:00 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T013_test_f001 — 录制流程步骤 1 未给具体启动命令

- 严重度：low
- 位置：`docs/guides/testing.md:42`（web e2e 录制 fixture 步骤 1）
- 问题：步骤 1 写“启动 OmniUsage（packaged 或 `pnpm start`，读本机 `%APPDATA%/OmniUsage` 真实数据，提供 local-api :17863）”，未给 packaged 启动命令。testing.md 第 14 行已约定 packaged 入口为 `./artifacts/win-unpacked/OmniUsage.exe`（需先 `pnpm package`），录制流程未回引，接手者首次跑可能卡在“packaged 怎么起”。`pnpm start` 也未说明需先 `pnpm dev` 或是否走 electron-vite dev。
- 建议：步骤 1 显式给两条命令：
    - packaged：先 `pnpm package`，再 `./artifacts/win-unpacked/OmniUsage.exe`
    - dev：`pnpm start`（electron-vite dev）
      两者择一，确保 local-api :17863 可达后继续步骤 2。

### T013_test_f002 — 三路对照表未提示 web project 的 fixture 前置

- 严重度：low
- 位置：`docs/guides/testing.md:57-61`（三路 e2e project 对照表）
- 问题：表中 web “何时跑：本地日常”让接手者以为直接 `pnpm test:e2e:web` 即可跑。实际新机器/CI 无 `tests/e2e/fixtures/data/responses.json`（`.gitignore:19` 排除，目录下文件 139 MB），直接跑会因缺 fixture 失败。录制流程在上一节，但对照表未回引，跳读时易漏。
- 建议：在表中 web 行“何时跑”列补一句“（首次需先录 fixture，见上节）”，或在表下方加一行注脚说明 web project 对 fixture 的依赖。

### T013_test_f003 — CI 策略小节未提 ADR 008 的 synthetic seed 遗留

- 严重度：suggestion
- 位置：`docs/guides/testing.md:46-53`（CI 策略小节）
- 问题：ADR 008（`docs/blueprint/decisions.md` 008 条）遗留记“未来若需 CI web 回归，造 synthetic seed fixture（脱敏假账号）入库供 CI smoke”，这是恢复 CI web SPA 数据链路覆盖的唯一通道。testing.md “CI 策略” 小节止步于“web e2e 不进 CI”，未提示该遗留与恢复路径，接手者后续想补 CI web 回归时需自行翻 ADR 才能发现方向。
- 建议：CI 策略小节末加一行“遗留：若未来要 CI web 回归，需造 synthetic seed fixture（脱敏假账号）入库，见 ADR 008”。

## 验收标准核对

| spec 验收标准                                                            | 对应改动                                                                                                                                                                                                                                    | 结论 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| CI web e2e 策略明确（ci.yml 注释或 testing.md 说明 CI 跳过 web project） | `.github/workflows/ci.yml:68-69` 注释说明 web e2e 不进 CI + CI 只跑 packaged smoke + vitest；`docs/guides/testing.md:46-53` “CI 策略” 小节同步说明，并列出 CI 实际跑的两条命令 (`pnpm test` + `pnpm test:packaged`)                         | 满足 |
| webServer 顶层决策记录（testing.md 或 ADR 说明保留理由，或拆 config）    | `docs/blueprint/decisions.md` ADR 008（2026-07-21）记录背景 / 选项（A 拆 config / B 保留顶层）/ 结论（选 B，Playwright 无 project 级 webServer，拆 config 维护成本 > 节省的 vite preview 启动开销）/ 替代 / 遗留                            | 满足 |
| testing.md 补 web e2e 章节（录制 + CI + 三路对照）                       | `docs/guides/testing.md:36-61` 新增 “web e2e 录制与 CI 策略” 章节，含录制三步、CI 策略、三路 project 对照表                                                                                                                                 | 满足 |
| handoff.md 追加 e2e 改造交接段                                           | `docs/handoff.md:20-41` 追加 2026-07-21 02:50 UTC+8 段，含 branch（`main`）/ head_commit（`a41cbad`）/ 已完成 T009-T012 / 未完成 T013-T014 / 陷阱（fixture gitignore、webServer 顶层、vite.web.config.ts eslint 放行）/ 下一步（T014 图标） | 满足 |

## 测试覆盖影响评估

**CI 实际跑**：

- ci.yml：`pnpm check`（lint+typecheck）+ `pnpm test`（vitest 单元 + 集成，ubuntu + windows 矩阵）+ `pnpm test:packaged`（packaged smoke，windows）
- nightly.yml：`pnpm test` + `pnpm test:e2e:electron`（Xvfb，ubuntu + windows 矩阵）

**失去 CI 覆盖的链路**：

- web SPA 数据链路：renderer 读 mock local-api 回放 `responses.json` → provider card / dashboard / settings 渲染。web e2e 21 个 spec（`tests/e2e/web/`）全在本地跑，CI 不覆盖。
- 兜底：renderer 组件与 mock_api_plugin 无独立单元/集成测试（它们就是 e2e 基建本身）。packaged smoke 覆盖 exe 启动与渲染层，但不覆盖数据回放路径与 provider 卡片状态。

**合理性判断**：CI 由 vitest 单元/集成 + packaged smoke 构成，覆盖模块正确性与产物可用性；web SPA 端到端数据链路确有 CI 缺口，但 fixture 含真实账号（gitignore）致 CI 无法跑，决策合理。缺口由 ADR 008 遗留（synthetic seed fixture 入库）作为恢复通道，T013 范围内无法闭环，属可接受遗留。见 T013_test_f003 建议在 testing.md 显式提示该遗留。

## 录制流程可复现性评估

三步框架清晰：启动 app → `pnpm e2e:gen-data` → `pnpm test:e2e:web`。中间步骤（gen-data 产 61 responses 到 `tests/e2e/fixtures/data/responses.json`、secrets 黑名单正则脱敏 `***`）描述到位。短板在步骤 1 未给具体启动命令（见 T013_test_f001），补完即可复现。

## 结论

3 条 finding（1 low / 1 low / 1 suggestion），均为 testing.md 文档清晰度补强，不涉及测试代码或测试覆盖本身缺陷。spec 4 条验收标准全部满足，CI 策略与 ADR 008 决策一致，测试覆盖缺口（web SPA 链路失 CI 覆盖）已由 ADR 008 遗留收口。建议 adoption 采纳 3 条 finding 后直接收尾。
