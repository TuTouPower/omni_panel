# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

热力图（weekday×hour 分布）在 >=7d 窗口下某些 weekday 整列空白（用户观察到周六全空）。根因见 `docs/pending.md` p010：热力图走 `token_stats_records`，后端 `query_records` 用 `ORDER BY timestamp DESC LIMIT`（宽窗口 100000），7d 实际 ~14 万行被截断，丢弃最早的几天；窗口内仅出现在被截断日期的 weekday 整列消失。

注意：buckets 是 day 粒度（无 hour），**不能**直接替代 records 喂热力图（t162/t164 给柱图改 buckets 的方案不适用于 hourly 热力图）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 修复 >=7d 窗口下热力图 weekday 整列空白：窗口内出现的每个 weekday 都能按实际数据着色，不被 records LIMIT 截断丢弃。
- 确定并实现正确的数据获取方式（候选见上下文区「未知契约清单」，需 Step 1 实验核实后定）。

### 非范围

- 热力图视觉/配色调整。
- buckets 表结构变更（除非选定方案需要）。
- 其他图表（柱图/donut）的数据源——已由 t162/t164 处理。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 选定任意 >=7d 窗口，热力图窗口内实际有数据的 weekday 列都有着色（非全空白）。
- [ ] 选定一个已知含周六数据的 >=7d 窗口，周六列出现着色（复现 p010 场景，验证修复）。
- [ ] 24h×7 格的热力图数值与 records 全量（无 LIMIT）聚合一致。
- [ ] 30d 窗口下热力图仍可加载（性能不退化到不可用；具体阈值见上下文区测试策略）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1/AC2：可自动测试（构造跨多 weekday 的 records，断言着色覆盖）。
- AC3：可自动测试（对比新实现与全量 records 聚合结果）。
- AC4：部分自动（性能阈值可断言；极端数据量需 `[deploy]` 真实大库验证）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 现有 `tests/unit/renderer/lib/token-stats/chart-data.test.ts` 覆盖 `prepareHeatmapData` 的 weekday/hour 映射；需补「窗口跨多 weekday 且某 weekday 仅在早期日期」场景。
- 后端若新增聚合查询：`token-stats-store` 测试需覆盖 weekday×hour GROUP BY 与窗口边界。
- AC4 性能：30d 窗口热力图加载时间断言（需实测基线后定阈值，或断言「不拉全量 records 到 renderer」）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

实现方案三选一，Step 1 实验确认数据量与性能后选定：

- **方案 A：热力图专用聚合查询**：后端加 `query_heatmap(env, start, end)` SQL 直接 `GROUP BY weekday,hour` 返回 ≤168 格，renderer 不再拉 records。优点：数据量固定小，30d 也能用；缺点：SQL 需处理本地时区（+8）的 weekday/hour 计算（strftime + '8 hours'）。`UNVERIFIED-SPIKE`：实测 strftime 在 SQLite 对 epoch ms 的 weekday/hour 提取正确性（probe 已验证 strftime('%w', ..., '+8 hours') 可用）。
- **方案 B：去 LIMIT / 窗口自适应 LIMIT**：热力图路径单独传极大 LIMIT 或分页拉全 records。优点：改动小；缺点：30d 全量 records 到 renderer 重（probe 见 7d 已 14 万行，30d ~60 万行），性能风险。
- **方案 C：热力图只用 records 的 timestamp/session_id/model 轻量列**：后端加专用轻量查询（只 SELECT 这几列，去 LIMIT 或高 LIMIT）。介于 A/B 之间。

### 风险与回退

- 风险：方案 A 的 SQLite 时区/weekday 计算边界（跨日、DST 本仓无 DST）；方案 B 的 30d 性能。
- 回退：保留现 records 路径作 feature flag；新查询灰度；出问题回退到当前实现（接受 LIMIT 截断）。

### 依赖与约束

- 时区固定 UTC+8（无 DST），weekday/hour 按本地时区。
- `getDay()` 周日=0..周六=6，热力图 `(getDay()+6)%7` 映射周一=0..周日=6（已正确，无需改）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token-stats 数据源矩阵补「热力图」一行（records 还是聚合查询）。
