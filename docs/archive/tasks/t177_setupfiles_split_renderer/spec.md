# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

vitest.config.mts:16-17 全局 environment: "jsdom" + 唯一 setupFiles: ["./tests/smoke/setup.ts"]；setup.ts 全为 renderer 专用（行 3 import jest-dom、行 207-221 window.usageboard mock + 注入 #root DOM）。node 类测试（tests/unit/main/\*\*，如 paths.test.ts、claude-reader.test.ts）也跑 jsdom 被注入该 mock。vitest.contract_live.config.mts:13 有 node env 先例，但主套件未拆。隔离性不纯但无实际 bug。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- vitest.config.mts 拆分 environment 与 setupFiles，使 node 类测试（tests/unit/main/\*\* 等）跑 node 环境，renderer 类测试跑 jsdom 且注入 renderer-only setupFiles。

### 非范围

- 不改测试内容本身；不改 contract_live 配置（已有 node env）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：node 类测试（tests/unit/main/\*\*）在 node 环境运行，不注入 window.usageboard mock 与 #root DOM。
- [ ] AC2：renderer 类测试在 jsdom 环境运行，注入 renderer-only setupFiles（jest-dom、usageboard mock、#root DOM）。
- [ ] AC3：全部既有测试通过，无因环境拆分引入的新失败。

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

- 按项目默认。跑 pnpm test 全量。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- node 类测试是否隐式依赖 jsdom 环境或 setup.ts 注入的 mock：**已核实（2026-08-01 实验）**——全部 108 个非 renderer 测试文件（tests/unit/{main,ipc,shared,scheduler,connector,auth,config,core,network,preload,session,schemas,e2e,local-api} + tests/integration/**）在 `environment: "node"` 无 setup.ts 下全部通过（1185 tests）；grep 亦确认非 renderer 测试无 window/document/react 依赖。渲染侧 75 文件（tests/unit/renderer/**, tests/smoke/**, tests/unit/web/**）需 jsdom + setup.ts。验证方式：临时 node 环境配置实跑 + grep 扫描。

### 风险与回退

- 风险：某 node 测试隐式依赖 jsdom 或 setup.ts 注入，拆分后失败。
- 回退：revert 实现 commit。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：测试环境分层小节同步。
