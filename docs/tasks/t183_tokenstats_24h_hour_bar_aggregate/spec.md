# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p020。

代理面板 24h preset 会拉取 current+previous 共 48 小时 records，查询按时间倒序限制 50,000 条。高密度使用时最早记录被静默截断；24h 时间轴小时柱因此只剩最近数小时。现有 hour 聚合不受 records LIMIT 影响，但 short window 分支明确跳过该数据源。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 24h preset + 时间 x 轴 + 小时粒度柱状图使用完整窗口聚合数据，不依赖 records 查询上限。
- tokens / calls / sessions 三种 metric 均覆盖完整 24h；agent 与平台筛选保持生效。
- 修正锁定旧行为的 renderer 测试，新增高密度 records 已截断但 hour 聚合完整的回归场景。

### 非范围

- 不改 24h KPI、donut、项目 x 轴、会话 x 轴；这些同源偏差由后续 task 处理。
- 不改 7d/30d 的 day/hour 柱状图、热力图和会话表。
- 不改 collector、records 表结构或持久化聚合表。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：24h 时间轴小时柱在窗口内 records 超过 50,000 条时仍覆盖完整 24 小时，较早时段不因倒序 LIMIT 消失。
- [ ] AC2：tokens、calls、sessions 三种 metric 的各小时值与完整窗口聚合结果一致，空小时保留零值桶。
- [ ] AC3：全部工具 / 单 agent 与全平台 / Win / WSL 筛选后的小时柱值正确，切换筛选不会退回受限 records 数据源。
- [ ] AC4：7d/30d 时间柱与 24h 的非时间轴柱行为保持不变。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- renderer view 测试模拟 records 仅含最近 3 小时、hour 聚合覆盖完整 24h，断言 24h 时间轴向柱状图传入完整聚合数据；删除原先“short window 不请求 hour 聚合”的旧行为断言，保留 day 粒度与非时间轴不请求该聚合的断言。
- 图表数据测试覆盖 24h 小时轴零桶、首尾偏小时桶及 tokens / calls / sessions series；复用真实铺桶函数，不 mock 被测聚合转换。
- 过滤与回归测试断言 agent/env 查询参数、7d/30d 路径和项目/会话轴不受影响。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：24h 首尾偏小时桶与 UTC+8 整点聚合边界错位；筛选切换时旧请求结果覆盖新结果；空聚合结果错误回退到受限 records。
- 回退：恢复 24h 时间柱 records 数据源与对应测试；不涉及数据迁移或持久化结构回滚。

### 依赖与约束

- 复用现有 hour 聚合的 UTC+8 小时边界、agent/env 过滤和请求竞态保护。
- 保持 records 有界查询，禁止通过移除或大幅提高 LIMIT 规避缺陷。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token-stats 柱状图数据流补充 24h 时间轴小时柱使用 hour 聚合。
- `docs/specs/ai-cli-token-stats-ui.md`：24h 小时柱数据源与完整窗口行为。
