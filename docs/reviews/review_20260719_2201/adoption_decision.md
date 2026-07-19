# 审阅结果决策

## 目录

docs/reviews/review_20260719_2201

## 报告来源

- 已读：opus.md、sonnet.md
- 缺失：current.md（不存在）、haiku.md（不存在）

## 统计

- 采纳：17 项
- 不采纳：1 项
- 待决定：2 项

> 说明：本批次审阅对象是 T004/T005/T006 的 **spec.md / plan.md 文档**（非源代码）。因此「修复说明」精确到「改哪个 task 的哪份文档、哪一段、改成什么」，落地动作是修订文档，不触发代码红/绿循环。

---

## 待决定项（请先决策）

### D1. T006 与 `domain.md §6`「不做趋势图 UI」产品边界冲突

- 来源：opus（T006_code_f003）
- 位置：T006 spec.md L4-5 / L18-21、T006 plan.md L24-29（Finalization）；对照 `docs/blueprint/domain.md:73`
- 优先级：HIGH
- 详细判断理由：`domain.md §6` 明确把「不做趋势图 UI（SQLite 留了历史数据，但第一版不出图）」列为产品边界（长期真相）。T006 直接打破该边界，而 plan Finalization 只列了改 architecture/observation-store/ipc/web-panel，**漏掉 domain.md §6 本身的修订**，也未走 decisions.md 的「替代旧决策」流程。属 CLAUDE.md 工作流硬约束违反（「长期真相延后」「未稳定方案留在 task」「blueprint 更新前置」）。
- 选项：
    - A 新开 **T006a**（独立小 task：更新 `domain.md §6` 移除该条 + `decisions.md` 新增「第一版不出图 → 改为账号展开区 sparkline 出图」决策条目），T006 改名为 T006b 实施时引用 T006a 决策编号
    - B T006 plan Finalization 增条目「`domain.md §6` 移除该条 + `decisions.md` 新增决策替代」，单 task 内同时改长期真相与实施
    - C 放弃 T006（保持 domain 现状，不做 sparkline）
- 推荐：A
- 推荐理由：符合「长期真相延后」「未稳定方案留在 task」硬约束；T006a 是纯文档小 task、独立可验证；T006b 实施时长期真相已稳定，避免单 task 同时改真相+实施的工作流违规。B 看似省事但把「改长期真相」与「实施」混在一个 commit，违反单 task 单 commit 的边界。

### D2. T004 横屏多列布局下拖拽排序策略

- 来源：sonnet（T004_code_f002）；opus（T004 plan 风险 2）已识别但把决策推到实施阶段
- 位置：T004 plan.md 风险与回退第 2 条；对照 `src/renderer/components/ProviderOverview.tsx:22-24`（`onDragOver(provider, clientY, rect)` 仅 Y 轴）
- 优先级：HIGH
- 详细判断理由：现有拖拽 `onDragOver` 只用 `clientY`，隐含单列假设。横屏多列下用户拖卡到同行另一列时，实际触发按纵向 DOM 顺序移动，视觉与语义不一致。plan「若改动过大则保留单列语义」的措辞把交互取舍推到实施阶段，应在 spec/plan 定死。
- 选项：
    - A 多列布局下**禁用拖拽**（视觉多列、拖拽关闭，hover/tooltip 提示「收窄窗口以排序」），单列下保留现有拖拽
    - B 补 `clientX` 列判定（完整多列拖拽，改动最大，需重写 hit-testing）
    - C 多列下拖拽仍按单列 DOM 语义（视觉多列、拖拽按单列，UI 不标注）
- 推荐：A
- 推荐理由：横屏定位是「管理台只读概览」（demo §1，低频重操作），排序是 popup 竖屏高频操作；A 改动最小、不破坏现有单列拖拽逻辑、避免多列 hit-testing 的复杂边界。若用户日后需要横屏排序，另开新 task 做 B。

---

## 采纳项

### A1. T005 `relative_time` 误用于未来 `resetAt`（HIGH）

- 来源：opus（T005_code_f001）
- 位置：T005 spec.md L21 / L33、T005 plan.md L3；对照 `src/renderer/lib/utils.ts:8-23`（`diff<0` 返回「刚刚」）
- 详细判断理由：预警行时间字段全是未来时刻（resetAt > now），`relative_time` 实现把所有 `ts>now` 一律返回「刚刚」，rail/banner 每行时间都变「刚刚」，无法区分「3 小时后」与「6 天后」，直接违反验收「按时间先后排序」「一眼看到何时重置」。
- 修复说明：T005 spec 范围/验收、plan 步骤 3/4 中「`relative_time`」改为「`format_reset_time`（输出『今天 HH:MM』『MM/DD HH:MM』）」；spec「依赖与约束」段补一条「不使用 `relative_time`，其对未来时间返回『刚刚』」。

### A2. rail 与 overview 横向并排缺容器拓扑（HIGH）

- 来源：opus（T005_code_f002）+ sonnet（T005_spec_f001）
- 位置：T004 spec.md 范围、T005 spec.md L20 / L41
- 详细判断理由：`.scroll-inner` 是 `display:flex; flex-direction:column`（`globals.css:338-342`），rail 作为 `.overview-grid` 兄弟在 flex column 下仍纵向堆叠，sticky 不就位。T004 的 auto-fill 多列与 T005 的「固定 264px 第二列」拓扑冲突。两份报告指出同一缺口。
- 修复说明：T004 spec 范围增「`.scroll-inner`（container）→ `.overview-row`（外层；`@container (min-width:1024px)` 下 `grid-template-columns: minmax(0,1fr) 264px; gap:12px`，`<1024` 退化为单列 block）→ `.overview-grid`（卡片 auto-fill，作为 `.overview-row > :first-child`）+ `.upcoming-rail`（sticky，第二列）」分层；T005 spec 引用此拓扑，rail 为 `.overview-row` 第二列。

### A3. `use_popup_height_report` mirror 与 container-type 隔离（HIGH）

- 来源：opus（T004_code_f005）+ sonnet 不确定项 1
- 位置：T004 spec.md L21 / L43、T004 plan.md L2 / L18-19；对照 `PopupView.tsx:793-828`、`popup_mirror_style.width="100%"`
- 详细判断理由：spec/plan 把 mirror 写成「固定宽度渲染」「`.content-mirror`/`.collapsed-mirror` 选择器」均不实——mirror 实为 `.popup-mirror` 类、`width:100%` 继承视口宽。给 `.scroll-inner` 设 `container-type: inline-size` 时类选择器**同时命中** live 与 mirror 内部同名元素（类选择器重复匹配，非 CSS 继承），mirror 内 `.overview-grid` 多列后 `offsetHeight` 变小，向主进程上报错误高度，popup 在 ≥1024px 宽时高度异常。
- 修复说明：T004 spec「约束」段改写为「`.scroll-inner` 设 `container-type` 会同时命中 live 与 `.popup-mirror` 内同名元素（类选择器重复匹配，非 CSS 继承）；隔离方式：`.popup-mirror .scroll-inner { container-type: normal; }` 显式覆盖」；plan 步骤 2 把 `.content-mirror`/`.collapsed-mirror` 改为 `.popup-mirror`（项目唯一既存类），回退靠该显式覆盖。

### A4. T004 grid 640–1023 列数与 spec 验收不一致（HIGH）

- 来源：sonnet（T004_code_f001）
- 位置：T004 plan.md 步骤 4 vs spec.md 验收第 2 条
- 详细判断理由：plan 写 `repeat(auto-fill, minmax(290px,1fr))`，1023/290≈3.5→3 列，与 spec「双列」不符。
- 修复说明：plan 步骤 4 中间断点改为 `grid-template-columns: repeat(2, minmax(0,1fr))`（强制双列）；如担心 640px 处每列 320 过窄，备选 `repeat(auto-fill, minmax(360px,1fr))` 并把 spec 验收改为「640–1023 呈 2 列（1023 边缘容差）」。推荐前者，spec 验收保持「双列」。

### A5. T006 账号下多 metric sparkline 聚合规则缺失（HIGH）

- 来源：opus（T006_code_f004）
- 位置：T006 spec.md L18-21、T006 plan.md L5-7；对照 `domain.md:16`、`observation-store.ts:44-45`
- 详细判断理由：Claude 账号有「5 小时」「一周」两 metric；CPA 账号同一 accountId 跨多 `source_instance_id`。spec 按 `(provider, accountId)` 单点查询会把多 metric 错误合并成一条折线（5h 用量与一周用量混算平均，失真）。
- 修复说明：T006 spec 范围第 1 条改为「按 `(provider, accountId, metricId)` 取每天最新 observation」；明确「每个 `(accountId, metricId)` 一条 sparkline，不跨 metric 合并」；`query_trend_series` 入参加 `metricId`；`ProviderAccountRow` 展开区在 `UsageBarList` 下方按 metric **纵向排列多张** sparkline。

### A6. T006 `--accent` CSS 变量不存在（MEDIUM）

- 来源：opus（T006_code_f006）
- 位置：T006 spec.md L11；对照 `globals.css:7-26`（无 `--accent`）
- 详细判断理由：spec 假设的 `--accent` 在主题层不存在，按其上色会失效（透明或 `initial`）。
- 修复说明：T006 spec「配色不照搬 demo」段 `--accent`/`--track` 改为 `--blue`（强调色，与 `--primary` 一致）/`--track`；sparkline 折线/面积/圆点统一用 `--blue`。

### A7. T006 store 无 `percent` 列（MEDIUM）

- 来源：opus（T006_code_f007）
- 位置：T006 spec.md L18；对照 `observation-store.ts:21-46`（仅 `used`/`limit`）
- 详细判断理由：spec「或 percent」措辞含糊，store 实际无 percent 列，易误导查询层设计。
- 修复说明：T006 spec 范围第 1 条改为「store 只返 `used`/`limit`/`display_style`（无 `percent` 列）；`build_trend_series` 内 `percent = clamp(round(used/limit*100),0,100)`，`ratio` 型同样按 percent 归一」。

### A8. T005 `percent` 计算口径未交代（MEDIUM）

- 来源：opus（T005_code_f008）
- 位置：T005 spec.md L18；对照 `provider-usage.ts:382-445`（`build_overview_for_group`）
- 详细判断理由：spec 返回结构含 `percent` 但未定义算法，rail 显示与用量条可能不一致。
- 修复说明：T005 spec 范围 `collect_upcoming_resets` 返回字段补「`percent = period.used/period.limit`（`period.limit>0` 且均 finite），`ratio` 型也输出 percent，`clamp(0,100)`；与 `OverviewWindow` 同口径但**不跨 metric 聚合**」。

### A9. T005 `resetAt` 边界未定义（MEDIUM）

- 来源：opus（T005_code_f009）
- 位置：T005 spec.md L18、T005 plan.md L1（测试清单）
- 详细判断理由：闭/开区间、`resetAt<=now`（刚过期）处理未说，plan 测试也没覆盖。
- 修复说明：T005 spec 范围「过滤 resetAt 在 now~now+horizon 内」改为半开区间 `(now, now+horizon]`，`resetAt<=now` 视为已重置跳过；plan 步骤 1 测试用例补三项：`resetAt=now`（跳过）、`resetAt=now+horizon`（收）、`resetAt<now`（跳过）。

### A10. T006 `observed_at` / `observedAt` 命名不一致（LOW）

- 来源：sonnet（T006_spec_f001）
- 位置：T006 spec.md 范围第 1 条；对照 `observation-store.ts:38`（`observed_at`）
- 详细判断理由：spec 用 camelCase `observedAt`，表列是 snake_case `observed_at`，易致接口层混淆。
- 修复说明：T006 spec 注明「表列 `observed_at`（snake_case）映射到 `MetricRecord.observedAt`/`resetAt`（camelCase），查询层做命名转换」。

### A11. T006 plan 步骤 4 粒度过大（LOW）

- 来源：sonnet（T006_plan_f001）
- 位置：T006 plan.md 步骤 4
- 详细判断理由：单步覆盖 store/ipc/preload/web 四模块，红绿循环不清晰，无法独立验证部分完成。
- 修复说明：plan 步骤 4 拆为：4a store 查询+单测；4b IPC handler；4c preload 白名单 + route capability（对照 T001 分权模式，展开具体文件 `preload/index.ts` / `preload/route_api.ts` 与字段）；4d web `/v1/trend` 端点（`usageboard-web.ts` + `local-api/server.ts`）。各步独立验证。

### A12. T004 `ProviderOverview` fragment 改 grid 视觉等价验证（LOW）

- 来源：opus（T004_code_f010）
- 位置：T004 plan.md 步骤 3；对照 `ProviderOverview.tsx:64-98`（现 `<>{map}</>`）
- 详细判断理由：fragment → `.overview-grid` 后间距由 `.scroll-inner{gap:12px}` 改为 `.overview-grid{gap:12px}`，ProviderCard `width:100%` 在 grid item 下默认 stretch，需视觉验证等价。
- 修复说明：plan 步骤 3 补「视觉快照对比：单列布局前（fragment）/ 后（`.overview-grid` 1fr）像素级等价；grid item stretch 行为验证」。

### A13. T005 plan 「`use_plugins` 的 groups」措辞不准（LOW）

- 来源：opus（T005_code_f011）
- 位置：T005 plan.md 步骤 5；对照 `PopupView.tsx:62`（`use_plugins` 不返 groups）、`PopupView.tsx:251`（`providerGroups` 由 `useMemo` 派生）
- 详细判断理由：措辞让人以为 `use_plugins` 直接返 groups，实际 `providerGroups` 是 PopupView 内部派生。
- 修复说明：plan 步骤 5 改为「从 `providerGroups`（PopupView 内 `useMemo` 派生自 `plugins`，`PopupView.tsx:251`）算 upcomingItems，传给 `collect_upcoming_resets`」。

### A14. T004 `maxWidth` 上限决策遗留（LOW）

- 来源：opus（T004_code_f012）
- 位置：T004 spec.md L17 / L33
- 详细判断理由：spec 给「取消」与「1400」两选项未决；取消则 4K 屏拉到极宽，auto-fill 变 10+ 列 UX 恶化。
- 修复说明：T004 spec 范围「放开 maxWidth 上限（取消或上调至 1400）」定为「上调至 **1400**」（不取消），理由补「覆盖 1080p/1440p 单屏横屏，留出 rail 264px + overview 多列空间，避免 4K 屏 N 列恶化」。

### A15. T004 视觉快照四档宽度选择（LOW）

- 来源：opus（T004_code_f014）+ sonnet（T004_spec_f001）
- 位置：T004 plan.md 步骤 5
- 详细判断理由：plan 写 472/780/1024/1440，但 780 与 640 同区间，780 不能独立证明断点切换；既有快照与新增快照关系未交代。
- 修复说明：plan 步骤 5 验证宽度改为 **472/640/1024/1440**（640/1024 取断点精确值）；补「既有快照在 472 基线重测，新增 640/1024/1440 三档独立快照，旧基线不删除」。

### A16. T006 趋势查询索引缺失（HIGH）

- 来源：sonnet（T006_code_f001）；opus（T006_code_f013）部分反驳
- 位置：T006 plan.md 步骤 4 / 风险 1；对照 `observation-store.ts:44-45`
- 详细判断理由：现有 `idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)` 中 `metric_id`/`source_instance_id` 在 `observed_at` 之前，`WHERE observed_at>=?` 无法走该索引的范围扫描（中间列缺失阻断）。sonnet 技术判断正确，opus f013「现有索引够」误判。采纳 A5（按 metricId 查询）后，`idx_trend(provider, account_id, metric_id, observed_at)` 仍需新建。
- 修复说明：T006 plan 步骤 4a 明确「新增 `CREATE INDEX IF NOT EXISTS idx_trend ON observations(provider, account_id, metric_id, observed_at)`，纳入 store migration」；风险 1 回退改为「核对 `idx_lookup` 与 `idx_trend` 覆盖；按 metricId 查询时 `idx_trend` 完全匹配，无需其他索引」。

### A17. T006 懒查缓存实现模式未明确（MEDIUM）

- 来源：sonnet（T005_plan_f001 错置到 T005，实际属于 T006）
- 位置：T006 plan.md 步骤 6；T006 spec.md 验收第 3 条
- 详细判断理由：T006 spec 要求「首次展开触发懒查，收起再展开不重复请求」，plan 未说缓存模式。
- 修复说明：T006 plan 步骤 6 明确「懒查缓存用 `useRef<Map<string, TrendPoint[]>>`，key = `${provider}:${accountId}:${metricId}`；展开时先查缓存命中则不发 IPC，未命中调 `trend:get` 后写回；失败不写缓存以允许重试」。

---

## 不采纳项

### N1. sonnet T005_plan_f001（懒查缓存）误置 T005

- 来源：sonnet（T005_plan_f001）
- 位置：T005 plan.md 步骤 5 vs T005 spec.md 验收第 3 条
- 详细判断理由：sonnet 把 T006 的懒查验收安到 T005 上。T005 spec 验收第 3 条实际是「竖屏（<1024px）：banner 手风琴，收起时显示『即将重置 N 项』，展开后行列表与 rail 同构」，无懒查需求；rail/banner 数据随 `providerGroups` 一次算出，不存在懒查。懒查问题对 T006 有效，已单列为采纳项 A17。本条对 T005 误报，不采纳。
