# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

`pnpm test:e2e:web`（`MOCK_FIXTURE=synthetic`）下会话面板用例有 4 个失败：「会话库搜索/筛选/排序/预览/并排打开闭环」断言「9 个会话」计数，页面实际显示「统计不可用」；三个虚拟列表用例等待 `.lib-card` 标题「大会话虚拟列表」hover 超时。

根因已查明：`MOCK_FIXTURE=synthetic` 时 mock 全量 `/v1/*` 走 synthetic fixture，该 fixture 不含会话库统计聚合数据，也不含「大会话虚拟列表」会话标题；虚拟列表用例虽经 `page.route` 注入 LARGE_SESSION，但会话库卡片未找到标题对应卡片。主仓基线（未改代码）同样 4 failed，确认为存量 fixture/测试问题。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 补 synthetic fixture 覆盖会话库统计聚合与大会话虚拟列表所需会话数据；若 fixture 由生成脚本生成，则改生成脚本并再生成产物。
- 必要时修正用例与 fixture 的对齐（如 `page.route` 注入与会话库卡片标题匹配）。

### 非范围

- 修改被测生产代码（如核实为生产 bug，另行上报处理，不在本 task 内修复）。
- 电子端 e2e。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] `MOCK_FIXTURE=synthetic` 下 `pnpm test:e2e:web` 全部通过，含会话库闭环与虚拟列表共 4 个既有失败用例。
- [ ] fixture 再生成流程可重复：重新运行生成脚本得到的产物与入库 fixture 一致。
- [ ] 其他 web e2e 用例不因本次 fixture 变更回归，既有通过用例保持通过。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 会话相关端点真实响应的 live 契约校验：本 task 只对齐 mock fixture 与测试，不引入 live 契约断言。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- fixture 数据形状以生产会话相关端点的真实响应结构为准，执行期对照 `src/main/core/local-api/server.ts` 中会话相关端点的响应实现。
- fixture 产物为 `tests/e2e/fixtures/synthetic.json`；若确认其由 `scripts/e2e/session_fixture.mjs` 生成，则修改脚本并再生成产物，不手改产物。
- 断言目标：`MOCK_FIXTURE=synthetic` 下 `pnpm test:e2e:web` 全绿，重点核对会话库统计计数与虚拟列表卡片标题匹配。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 会话库统计聚合的端点与响应形状：已核实——`GET /v1/sessionStats` 返回 `{sessions, agents, tokens, source_counts}`（`token-stats-store.ts query_session_stats`，sessions=token_stats_sessions 全表 COUNT、agents=COUNT(DISTINCT source)、tokens=四类 token 求和、source_counts 按 source 分组计数）。页面「统计不可用」判定：`tokenStats.getSessionStats()` 请求失败或返回空。synthetic fixture 缺该端点 → mock 404 → 统计不可用。

### 风险与回退

- 风险：fixture 变更可能牵连依赖同一份 synthetic fixture 的其他用例。
- 回退：还原 fixture 与生成脚本改动。

### 依赖与约束

- 仅修改 fixture、生成脚本与（必要时）对齐的用例；不修改生产代码。
- 来源：p075；2026-08-08 核实主仓基线（未改代码）下同一 4 用例同样失败，确认为存量 fixture/测试问题而非新引入回归。

### Finalization 时更新的 blueprint

- 无
