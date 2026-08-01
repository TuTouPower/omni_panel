# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

ctx.status 机制已就绪（src/main/core/connector/host-io.ts:26-30，提供 for*pct/for_ratio/for_balance，t066 产物）但 0/16 个 connector 完成迁移。15/16 个 connector（connectors/{name}/connector.ts）内仍保留 40 个重复内联 helper：is_record×8、to_number×13、parse_limit×5、status_for*\*×13、classify_status×1。仅 antigravity 无 helper。迁移为纯机械替换，统一阈值语义。风险点在于 vm 沙箱脚本内联阈值与宿主 ctx.status 阈值的取值一致性，需逐 connector 对照。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 15 个含内联 helper 的 connector（claude/codex/cpa/deepseek/exa/firecrawl/getoneapi/glm/grok/kimi/mimo/minimax/opencode*go/tavily/tikhub）删除 status*for**/classify_status 内联阈值 helper，status 计算统一改调 ctx.status（for_pct/for_ratio/for_balance）。
- kimi/mimo/tavily 的 `limit<=0→normal` 内联语义经调用侧 guard 保留：`limit > 0 ? ctx.status.for_*(...) : "normal"`。
- 非 status utility helper（is_record/to_number/parse_limit）保留各 connector 本地最小副本（沙箱禁止 import，ctx 未暴露等价物）。

### 非范围

- 不改 ctx.status 机制本身（host-io.ts / connector-thresholds.ts）。
- 不改 antigravity（无 helper）。
- 不改各 connector 的 fetch/解析逻辑，只替换 status 计算方式。
- 不删除 is_record/to_number/parse_limit 本地 utility 副本（沙箱 import 约束下无法共享化）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：15 个目标 connector 的 connector.ts 中不再定义 status*for*\*/classify_status 内联阈值函数，status 计算改经 ctx.status（kimi/mimo/tavily 经调用侧 guard 保留 limit<=0→normal 语义）。
- [ ] AC2：迁移后各 connector 对相同输入的 status 判定结果与迁移前一致（阈值语义不漂移，含 limit<=0 分支）。
- [ ] AC3：全部 connector 既有测试通过；无因迁移引入的新失败。

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

按项目默认。逐 connector 跑既有 connector 测试（tests/integration/connector/）；对照迁移前后 status 输出验证阈值语义一致。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- vm 沙箱脚本内联阈值与宿主 ctx.status 阈值的取值一致性：**已核实（2026-08-01 逐 connector 对照）**。
    - 阈值函数体：`claude`/`cpa` status_for_pct、`deepseek` status_for_balance、`firecrawl` status_for_ratio、`exa` status_for_cost、`grok` classify_status 与宿主 `src/shared/lib/connector-thresholds.ts` 完全一致（percent 90/75、ratio 0.9/0.75、余额反向 0.1/0.2）。
    - `limit<=0` 语义差异：宿主三函数统一返回 `unknown`；kimi/mimo/tavily 内联返回 `normal`（深层 API limit 可能缺失），exa/deepseek/getoneapi/mimo-balance 调用侧已 guard 后传 `unknown`，firecrawl 内联返回 `unknown`。迁移方案：kimi/mimo/tavily 调用侧改 `limit > 0 ? ctx.status.for_*(...) : "normal"` 保留内联语义；已 guard 的 connector 直接换 `ctx.status.for_*`。
    - 非 status helper：is*record/to_number/parse_limit 为纯 utility 函数。ctx 未暴露等价物；沙箱脚本禁止 import/export（`runtime.ts:71` 拒绝），无法 import 共享模块。迁移方案：这些 utility helper 保留各 connector 本地最小副本（非阈值语义，不构成统一性风险）；仅 status 阈值 helper（status_for*_/classify*status）删除内联、改调 `ctx.status.for*_`。
    - 验证方式：读 `src/shared/lib/connector-thresholds.ts` + 15 个 connector 内联 helper 逐行对照 + `runtime.ts` 沙箱 import 约束。

### 风险与回退

- 风险：阈值语义漂移导致某 connector status 判定变化。
- 回退：改动集中在各 connector.ts 内联 helper 删除与替换，revert 实现 commit 即恢复。

### 依赖与约束

无

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：connector status 计算小节（如有）同步为 ctx.status 统一入口。
