# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p054。

`pnpm test:e2e:web` 默认走 real fixture（`tests/e2e/fixtures/data/responses.json`），KIMI 三实例 state 无 item 级 error，`account_error_badge.spec.ts` 断言 `.error-badge` 必失败。该 spec 依赖 synthetic fixture（`gen_synthetic.mjs` 固化注入 KIMI failed connector 的 error 项），仅 CI 的 `MOCK_FIXTURE=synthetic pnpm test:e2e:web`（docs/guides/testing.md:80）通过。测试本身非回归（fe80caa2 未触该路径），属本地默认 fixture 与 synthetic-only 测试的配置分叉：daily 命令默认跑 real 却含 synthetic-only 用例。2026-08-06 核实：`account_error_badge.spec.ts` 仍断言 error-badge，testing.md:80 仍区分 real/synthetic，分叉未修。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 消除「本地默认 `pnpm test:e2e:web` 含 synthetic-only 用例导致必挂」的分叉，使 daily 命令在本地默认 fixture 下可绿。
- 保持 CI `MOCK_FIXTURE=synthetic` 跑 smoke 时 account_error_badge 仍被执行并验证 error 徽标。

### 非范围

- 不删除 `account_error_badge.spec.ts` 或用例（synthetic 下仍须覆盖 error 徽标）。
- 不改 synthetic fixture 数据本身。
- 不改 connector 采集/错误注入逻辑（T027/T028 产物不动）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 本地默认 fixture（real）下执行 daily web e2e 命令不再因 `account_error_badge.spec.ts` 失败。
- [ ] `MOCK_FIXTURE=synthetic` 下 `account_error_badge.spec.ts` 仍执行并通过，error 徽标断言覆盖保持。
- [ ] 两种 fixture 下的命令都能被文档化命令（`docs/guides/testing.md`）触发，且运行结果与 fixture 选择一致。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试：AC1/AC2 为 e2e 命令运行结果，AC3 为文档命令一致性，均可由 `pnpm test:e2e:web` 与 `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 两条命令分别验证。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无（本 task 的"测试"即 e2e 用例本身，不额外写单元测试）。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 候选修法（p054 登记）：`account_error_badge.spec.ts` 在非 synthetic fixture 下条件 skip；或 webServer 恒设 `MOCK_FIXTURE=synthetic`。实施期任选其一，需保证 synthetic 下覆盖完整。
- 验证：本地默认命令绿 + `MOCK_FIXTURE=synthetic` 命令绿。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无（real/synthetic fixture 机制已从 testing.md:69-87 核实）。

### 风险与回退

- 风险：若选「webServer 恒设 synthetic」，本地 dev 默认也走 synthetic，可能削弱本地真实响应回放的价值；若选「spec 条件 skip」，需保证 synthetic 检测机制可靠（env 或 fixture 标志），避免误 skip 导致 synthetic 下 error 徽标无覆盖。
- 回退：还原 webServer/条件 skip 改动，仅涉及 e2e 配置或单 spec。

### 依赖与约束

- 依赖 p054 登记。
- 约束：不改 synthetic 数据与 connector 逻辑；保留两种 fixture 运行路径。

### Finalization 时更新的 blueprint

- 无
