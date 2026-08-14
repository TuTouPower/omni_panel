# Task spec

## 背景

p151：账号展开区趋势折线图（`TrendSparkline`）X 轴有两个缺陷：

1. **标签过度节流**：`TrendSparkline.tsx:85` 硬编码 `target_labels = n <= 5 ? n : 4`，7 天窗口 7 个日点被稀到 4 个坐标。`MM-DD` 标签约 28px，inner_width 514px 可容纳约 18 个，7 个根本不重叠。
2. **1 天窗口丢时分粒度**：`shared/lib/trend.ts:40` `build_trend_series` 把 `observed_at` 格式化成 UTC 日期（`YYYY-MM-DD`），丢弃时分。1 天窗口内逐小时观测点全落同一日期，渲染端 `p.date.slice(5)` 只能标出重复的 `MM-DD`。

## 契约区

### 范围

- `src/shared/lib/trend.ts`：`build_trend_series` 序列保留观测时刻，使同一 UTC 日内不同时刻的点可区分。
- `src/renderer/components/TrendSparkline.tsx`：按序列粒度选择 X 轴标签格式（同一 UTC 日内多点 → 显示时刻；跨日期 → 显示日期）；标签节流改宽度自适应，宽度足够时不再无故稀到 4 个，点数过多时仍防重叠。
- 同步 `build_trend_series` 全部消费方：`src/main/ipc/trend-ipc.ts`（`trend:get` / `trend:getBulk`）、`src/main/core/local-api/server.ts`（`/v1/trend`）。
- 补/改测试：`tests/unit/shared/trend.test.ts`、`tests/unit/renderer/components/trend_sparkline.test.tsx`（及 IPC/local-api 相关测试，若存在）。

### 非范围

- 不迁移、不补齐历史存量观测数据（旧数据可能只有日粒度，1 天窗口显示仍受限，如实呈现）。
- 不做 X 轴交互增强（缩放、悬浮 tooltip、拖动选窗等）。
- 不改用量周期标签（`format_usage_period_label`）。
- 不做 30 天窗口按周聚合等额外粒度策略。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：同一 UTC 日内多点（1 天窗口）时，折线图 X 轴标签能区分不同时刻（含时分信息），不再全部显示为重复的同一 `MM-DD`。
- [ ] AC-002：7 天窗口 7 个日点、渲染宽度足够时，X 轴标签展示全部 7 个（≥7），不再只显示 4 个。
- [ ] AC-003：点数远超宽度（如 30 天窗口 cap 120 点）时，X 轴标签不重叠，标签数小于点数（宽度自适应节流仍生效）。
- [ ] AC-004：对同一批观测，`trend:get`、`trend:getBulk`、`/v1/trend` 三条路径返回的序列一致（含时刻信息），popup 与 web 面板趋势图显示一致。
- [ ] AC-005：折线 / 面积 / 数据点圆点每个数据点仍可见，不受标签节流改动影响（空值点仍跳过）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002/003/005：可自动测试（`trend.test.ts` 断言序列时刻保留；`trend_sparkline.test.tsx` 断言标签格式与数量、数据点圆点数）。
- AC-004：核心可自动测试（对同一批观测分别经 `build_trend_series` 单测断言时刻保留，覆盖三个消费方共享的同一序列函数）；真实 HTTP 往返与浏览器渲染属 `[deploy]` 人工冒烟，agent 无法自证。

## 上下文区

- 来源：p151（2026-08-13 核实，`.scratch/bug_trend_xaxis/repro.ts` 复现）——机制 A 标签节流 + 机制 B 时分丢失，合并一个修复范围

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 跨平台字体宽度逐像素度量：标签宽度用近似估算（字符数 × 估算字宽）决定节流，不逐像素测量真实渲染宽度；极端字体差异导致的轻微重叠不测。
- 历史存量观测只有日粒度的场景：不补测（属数据缺失，非本 task 修复目标）。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `tests/unit/shared/trend.test.ts`：新增「同一 UTC 日内逐小时观测 → 序列保留时刻，各点可区分」；现有午夜整点观测的 `date` 断言按新契约更新（日期部分保持 `YYYY-MM-DD` 语义）。
- `tests/unit/renderer/components/trend_sparkline.test.tsx`：
    - 「renders at most ~5 X-axis date labels regardless of point count」锁死静态节流，修复后语义失效——**整体删除**或按宽度自适应新语义整体替换并写明理由，禁止就地改预期。
    - 新增：同一日期多点 → 标签为时刻格式；7 个日点宽度足够 → 全部标签展示；120 点 → 标签数小于点数且不重叠。
- 断言目标：X 轴标签文本（`text` 节点内容）、标签数量、圆点数量；序列断言走 `build_trend_series` 返回。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- `/v1/trend` 响应 `date` 字段格式：`YYYY-MM-DD` → `YYYY-MM-DDTHH:mm`（UTC 时刻，与现有 `format_utc_date` 的 UTC 归一一致）。已核实（2026-08-13 用户确认）：`docs/specs/web-panel.md` 未固定 date 格式；本仓库 UI（popup + web 面板）是唯一消费方且复用同一 renderer 组件树，随 `TrendSparkline` 自动同步；采纳破坏性升级而非兼容层，同步更新 web-panel spec 文档。

### 风险与回退

- 风险：
    - `date` 字段对外格式变更（`YYYY-MM-DD` → `YYYY-MM-DDTHH:mm`），潜在外部消费者按前缀精确匹配旧格式。
    - 1 天窗口旧存量数据可能只有日粒度，无时刻可显示，修复后该场景显示仍有限。
    - 标签宽度估算与真实渲染差异导致极端宽度下轻微重叠。
- 回退：`git revert` 本 task commit 即恢复原行为。

### 依赖与约束

- 无前置 task。
- 约束：改动共享 `build_trend_series`，须同步 `trend-ipc.ts` 与 `local-api/server.ts` 两个消费方；web 面板复用 renderer 组件树，随 `TrendSparkline` 修复自动同步，勿在 `src/web/` 重复实现。

### Finalization 时更新的 blueprint

- `docs/specs/web-panel.md`：`/v1/trend` 响应 `date` 字段格式（含时刻或新增字段）说明。
