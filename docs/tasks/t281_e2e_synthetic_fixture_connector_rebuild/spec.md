# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：`docs/pending.md` p105（t277/t278 实施期登记）。核实（2026-08-10 合并批次复测）：`MOCK_FIXTURE=synthetic` 下 `tests/e2e/web/account_error_badge.spec.ts` 与 `opencode_go_usage.spec.ts` 稳定失败——`tests/e2e/fixtures/synthetic.json` 的 `synthetic-kimi-failed` 与 `synthetic-opencode-go` 为手工写入条目，`tests/e2e/fixtures/mock_server.mjs` 的 `sync_connectors()` 依据 `/v1/config` 重建 connector 时丢弃无 config 匹配的 synthetic connector。基线问题（非 t277/t278 引入），修复后 synthetic web e2e 全绿。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- synthetic fixture 下 mock local-api 保留 fixture 中无对应 config plugin 的 synthetic-only connector（`synthetic-kimi-failed`、`synthetic-opencode-go`），或等价机制使这两个 spec 不再依赖 config 重建行为
- 若改 fixture 生成脚本，同步保证再生成产物与手工条目一致（补齐 `gen_synthetic.mjs` 对这两类 connector 的产出）

### 非范围

- real fixture（`responses.json`）行为
- 桌面/Electron e2e
- 其他 synthetic fixture 缺口（trend metricId 等既有登记项）

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：`MOCK_FIXTURE=synthetic pnpm test:e2e:web` 全绿（含 `account_error_badge.spec.ts` 与 `opencode_go_usage.spec.ts`）
- [ ] AC2：mock `sync_connectors()` 对 fixture 中 synthetic-only connector 的行为有单测守护（重建不丢弃 / 明确跳过）
- [ ] AC3：`pnpm e2e:gen-synthetic` 再生成后 synthetic fixture 仍包含这两类 connector（改生成脚本时）

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（AC1 为既有 web e2e 套件；AC2 为 mock_server 单测；AC3 为生成脚本幂等验证）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：`tests/unit/e2e/mock_server.test.ts` 补 `sync_connectors()` 对 synthetic-only connector 的保留/跳过断言
- e2e：`MOCK_FIXTURE=synthetic` 全量 web 套件（`account_error_badge`、`opencode_go_usage` 为验收锚点）
- 生成脚本：如改 `scripts/e2e/gen_synthetic.mjs`，验证再生成产物含两类 connector

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：改 mock 重建逻辑可能影响 real fixture 路径或其他 synthetic 用例；改生成脚本可能产生大 diff
- 回退：纯测试基建改动，可整段回退；不动 real fixture 路径

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：如改 synthetic fixture 生成约定，同步说明
