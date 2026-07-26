# Sonnet 审阅报告

## 当前模型判断依据

主会话可见模型标识 `default_model`，配置偏好 `opus`，`ANTHROPIC_DEFAULT_SONNET_MODEL=default_sonnet[1m]`。本次以 sonnet 视角执行独立审阅。

## 审阅范围

全量审阅以下 6 个文件：

- `docs/tasks/T004_responsive_container_query/spec.md`
- `docs/tasks/T004_responsive_container_query/plan.md`
- `docs/tasks/T005_upcoming_reset_panel/spec.md`
- `docs/tasks/T005_upcoming_reset_panel/plan.md`
- `docs/tasks/T006_trend_sparkline/spec.md`
- `docs/tasks/T006_trend_sparkline/plan.md`

辅以源码验证：`window-manager.ts`、`globals.css`、`ProviderOverview.tsx`、`observation-store.ts`、`provider-usage.ts`、`local-api/server.ts`、`use-popup-height-report.ts` 等。

---

## 高优先级问题（CRITICAL / HIGH）

### T004_code_f001 — grid 列数与 spec 验收不一致

- **位置**：`plan.md` 步骤 4 vs `spec.md` 验收标准第 2 条
- **现象**：spec 要求 640–1023px 呈「双列」；plan 写 `repeat(auto-fill, minmax(290px, 1fr))` 在 640–1023px 区间。在 1023px 容器宽下 `1023 / 290 ≈ 3.5 → 3 列`，不是双列。
- **影响**：实现者按 plan 写代码后，验收 640–1023px 时会得到 3 列而非 spec 要求的 2 列，验收失败或引发歧义争论。
- **建议**：plan 步骤 4 中间断点改为 `repeat(2, 1fr)` 或 `repeat(auto-fill, minmax(400px, 1fr))`（保证 640–1023 范围内只放 2 列）。或修改 spec 验收为「640–1023px 呈 2–3 列自适应」，明确预期。
- **置信度**：高（CSS Grid math 验证）
- **优先级**：HIGH

### T004_code_f002 — 拖拽排序多列适配风险未给出明确策略

- **位置**：`plan.md` 风险与回退 第 2 条；`ProviderOverview.tsx:22-24` (`onDragOver` 签名)
- **现象**：现有 `onDragOver(provider, clientY, rect)` 只用 Y 轴判定拖拽位置，隐含单列假设。plan 回退写「若改动过大，保留单列拖拽行为，仅布局多列」——即视觉多列但拖拽仍按单列 DOM 顺序处理。
- **影响**：多列下用户拖拽卡片到同行另一列时，实际触发的是按纵向 DOM 顺序移动，与视觉预期不符，造成困惑。
- **建议**：plan 应在步骤 3 就明确决策：是(a) 多列下禁用拖拽、(b) 补 clientX 列判定、还是(c) 多列布局下拖拽仍按单列语义（需在 UI 上标明）。当前「若改动过大」的措辞把决策推迟到了实现阶段。
- **置信度**：高
- **优先级**：HIGH

### T006_code_f001 — 趋势查询缺少适配索引，现有索引无法高效覆盖

- **位置**：`plan.md` 步骤 4；`observation-store.ts:44-45`
- **现象**：spec 要求按 `(provider, accountId)` 聚合最近 7 天每天最新快照。现有索引 `idx_lookup ON (provider, account_id, metric_id, source_instance_id, observed_at)` 中 `metric_id` 和 `source_instance_id` 在 `observed_at` 之前，趋势查询的 `WHERE observed_at >= ?` 条件无法高效利用该索引后缀。
- **影响**：数据量大时查询退化为部分扫描。plan 风险回退提到「`(provider, accountId, observedAt)` 复合索引；若已有则直接用」，但实际**没有**这样的索引。
- **建议**：plan 步骤 4 明确包含新增索引 `CREATE INDEX IF NOT EXISTS idx_trend ON observations(provider, account_id, observed_at)`，并计入 migration 步骤。
- **置信度**：高（已验证 observation-store.ts 索引定义）
- **优先级**：HIGH

---

## 中低优先级问题（MEDIUM / LOW）

### T005_spec_f001 — rail 固定 264px 与 grid 布局的具体装配方式未明确

- **位置**：`spec.md` 范围第 3 条；`plan.md` 步骤 5
- **现象**：spec 说 rail「紧邻 `.overview-grid`」，plan 说「rail 固定 264px 作为 grid 第二列」。但 `.overview-grid` 本身是 T004 定义的卡片网格容器——rail 是作为 `.overview-grid` 同级兄弟（在 `.scroll-inner` 的 flex 中并列），还是作为 `.overview-grid` 的额外 grid column？
- **影响**：两种实现的 CSS 和 DOM 结构完全不同，实现者需要猜测。
- **建议**：明确 rail 为 `.scroll-inner` 内 `.overview-grid` 的同级兄弟元素，由 `@container` 断点控制 `display` 显隐，不在 `.overview-grid` 的 grid 内。
- **置信度**：中
- **优先级**：MEDIUM

### T005_plan_f001 — 懒查缓存仅靠 plan 文字，无明确实现模式

- **位置**：`plan.md` 步骤 5 vs `spec.md` 验收标准第 3 条
- **现象**：spec 要求「首次展开触发懒查，收起再展开不重复请求」。plan 未说明缓存机制（`useRef` 缓存、`useSWR`、还是 `useEffect` + 条件判断）。T006 plan 同样涉及懒查缓存（步骤 6），两处应保持一致的缓存模式。
- **影响**：实现者可能各自采用不同模式，增加认知负担。
- **建议**：plan 中明确缓存策略，如「用 `useRef<Map>` 缓存已查结果，展开时先查缓存再决定是否发 IPC」。T005/T006 统一。
- **置信度**：中
- **优先级**：MEDIUM

### T006_spec_f001 — `observedAt` / `observed_at` 命名不一致

- **位置**：`spec.md` 范围第 1 条 vs `observation-store.ts:38`
- **现象**：spec 写「每天最新一条 observation 的 `used / limit`（或 `percent`），返回 7 点时序；数据缺失日期填 null」，描述中用 camelCase `observedAt`；实际表列为 `observed_at`（snake_case）。`MetricRecord` 用 camelCase `resetAt`，`Observation` schema 用 `observed_at`。
- **影响**：不影响功能，但可能导致实现者在接口层混淆命名约定。
- **建议**：spec 中明确引用表列名时用 `observed_at`（snake_case），引用 `MetricRecord` 字段时用 `resetAt`（camelCase），注明映射关系。
- **置信度**：中
- **优先级**：LOW

### T006_plan_f001 — 步骤 4 过于密集，含 4 个模块改动

- **位置**：`plan.md` 步骤 4
- **现象**：单步覆盖 `observation-store.ts`（查询）、`ipc/`（handler）、`preload/route_api.ts`（白名单+分权）、`usageboard-web.ts`（web 端点），共 4 个模块。
- **影响**：步骤粒度过大，红绿循环不清晰——无法单独验证「IPC handler 通过但 web 端点未加」等部分完成状态。
- **建议**：拆为 4a（store 查询+单测）、4b（IPC handler）、4c（preload 白名单+分权）、4d（web 端点），各步可独立验证。
- **置信度**：中
- **优先级**：LOW

### T004_spec_f001 — 规划四档宽度验证但 plan 只覆盖三档断点

- **位置**：`plan.md` 步骤 4 验证 vs `spec.md` 验收标准
- **现象**：plan 步骤 4 验证写「472/780/1024/1440 四档宽度下列数分别为 1/2/多列」，但 `@container` 断点只有两道分界线（1024、640）。780px 与 640px 落在同一区间，测 780 只验证了区间内行为，不能独立证明断点切换正确。
- **影响**：不严重，但 472/640/1024/1440 四档更能覆盖边界。
- **建议**：验证宽度改为 472（单列下界）、640（断点精确值）、1024（断点精确值）、1440（多列），比 780 更有针对性。
- **置信度**：中
- **优先级**：LOW

---

## 改进建议

1. **T004+T005+T006 统一术语**：「rail」「banner」「sparkline」三个新 UI 概念首次引入，建议在 `docs/blueprint/domain.md` 或 spec 的术语表中统一定义，避免后续讨论歧义。
2. **T005 脱敏处理**：spec 约束提到脱敏开关，plan 风险有占位方案，但步骤中未体现——建议步骤 3/4 显式加「脱敏态：账号 label 序号占位」的实现子步。
3. **T006 IPC 白名单**：spec 明确约束「查询走现有 IPC 白名单」，plan 风险提到但步骤 4 的「preload 白名单 + route capability 放行 usage/agent」过于简略。建议展开 preload 变更的具体文件和字段，与 T001 已建立的分权模式对齐。
4. **跨 task 冲突检查**：T005 和 T006 都改动 `PopupView.tsx` / `ProviderAccountRow.tsx`。虽然 spec 说「可独立排期」，但 plan 应标注具体改哪些文件，便于并行开发时避免冲突。

---

## 不确定项 / 可能误报

1. **T004 mirror container-type 隔离**：plan 说「确认 mirror 不继承 container-type」，mirror 的 CSS 类名（`.content-mirror` / `.collapsed-mirror`）为推测——未在 `use-popup-height-report.ts` 中找到这两个类名的硬编码，实际类名需查看 `PopupView.tsx` 渲染部分确认。若 mirror 在 `.scroll-inner` 内部，`container-type: inline-size` 确实会被继承，需显式 `container-type: normal`。置信度中。
2. **T006 点数不足的阈值**：spec 说「<2 点显示占位」，但 sparkline 最少只需 1 个有效点即可渲染一个圆点。是否有产品理由要求至少 2 点？可能是「折线至少需要 2 点才有意义」的合理约束，建议 spec 补充原因。
3. **T005 horizon 7d 硬编码**：`collect_upcoming_resets` 默认 horizon 为 7 天，但参数化了 `horizonMs`——未来扩展（如用户自定义 horizon）已预留接口，当前 spec 不要求，属合理设计。
