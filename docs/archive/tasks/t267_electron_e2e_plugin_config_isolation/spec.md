# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

完整运行 `pnpm test:e2e:electron` 时，`plugin_config.spec.ts:91` 的用例「CPA settings persist after app restart without exposing the secret」偶发失败：重启后 endpoint 读回 synthetic 默认值 17863，而非之前保存的 cpa.example.test。单独运行该 spec 时稳定 4 passed；主仓基线完整 e2e 为 35 passed，说明非功能回归。疑似根因是测试间 electron 进程、端口或用户数据目录残留与竞态：前一测试的 app 未完全退出时，本 spec 的重启流程读取到错误状态；失败仅在完整套件（多 spec 串行）下出现，且重启相关测试（如 secrets_persistence）排在其前置。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 定位并修复 electron e2e 测试间的隔离问题：进程残留、端口占用、userData 目录残留或竞态。
- 可能涉及 e2e harness 的 app 启动/关闭生命周期、端口分配、userData 目录隔离的改动。

### 非范围

### 非范围

- CPA 配置持久化的生产逻辑**在基线判断后经 f003 实证为生产 bug（endpoint 编辑被 effect 覆盖）**；2026-08-08 用户授权扩范围一并修复（见实施笔记与 p093）。
- web e2e。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：完整运行 `pnpm test:e2e:electron` 连续 3 次全部通过。
- [ ] AC2：单独运行 `plugin_config.spec.ts` 仍全部通过。
- [ ] AC3：隔离修复不削弱任何用例的断言语义——不以删除断言或无界 sleep 消除竞态；确需等待时使用确定性条件等待。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 黑盒 e2e 重复运行验证：完整 `pnpm test:e2e:electron` 连跑 3 次 + `plugin_config.spec.ts` 单跑，全部通过为准。
- 失败用例位于 `tests/e2e/plugin_config.spec.ts:91`；修复点在 e2e harness 的 app 启动/关闭生命周期、端口分配或 userData 目录隔离。
- 必要时在 harness 加启动前清理、唯一端口分配或唯一 userData 目录，保证 spec 间互不残留。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 偶发失败的确切竞态点：本机完整 electron e2e 连跑 3 次均 43 passed，未复现 plugin_config 失败；但 run 2 出现 snapshot-cache.json rename ENOENT（`writeJsonAtomic` 失败）——`closeApp` 后仍有子进程写已关闭的 userData 目录，证实 Electron 子进程（renderer/gpu/utility）在 Playwright `app.close()` 后未完全终止。该残留是 restart 竞态候选：旧进程未退出即 start，可能占用 local-api 端口或写共享 userData，使重启读回旧/默认状态（endpoint 17863）。修复方向 = closeApp 确保进程树退出。

### 风险与回退

- 风险：harness 生命周期改动影响所有 electron e2e 用例，可能引入新的不稳定。
- 回退：还原 harness 变更，恢复原有行为。

### 依赖与约束

- 修复只限 e2e 测试与 harness，不得改动生产逻辑；**例外**：2026-08-08 用户授权扩范围修复 f003 实证的生产 bug（CpaConnectorSettings effect 覆盖用户输入），见实施笔记与 p093。
- 验证依赖本地可运行完整 electron e2e 套件的环境。
- 来源：p077（bug 条目）；2026-08-08 核实：单独运行该 spec 稳定 4 passed，完整套件偶发失败，主仓基线完整 e2e 35 passed，初判为测试隔离问题；f003 实证含生产 bug。

### Finalization 时更新的 blueprint

- 无
