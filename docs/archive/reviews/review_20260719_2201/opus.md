## 当前模型判断依据

可观测配置两层：`~/.claude/settings.json` 顶层 `model` 为 `opus`；同文件 `env.ANTHROPIC_MODEL` 为 `default_model`，并分别配置 `ANTHROPIC_DEFAULT_HAIKU_MODEL=default_haiku[1m]`、`ANTHROPIC_DEFAULT_SONNET_MODEL=default_sonnet[1m]`、`ANTHROPIC_DEFAULT_OPUS_MODEL=default_opus[1m]`。主会话自身可见模型标识为 `default_model`。综合判断：当前会话可确认的运行时路由标识是 `default_model`，配置偏好是 `opus`，但无法从这些可观测来源确认最终后端具体模型；不声称读取运行时内部状态。

## 审阅范围

- docs/tasks/T004_responsive_container_query/spec.md
- docs/tasks/T004_responsive_container_query/plan.md
- docs/tasks/T005_upcoming_reset_panel/spec.md
- docs/tasks/T005_upcoming_reset_panel/plan.md
- docs/tasks/T006_trend_sparkline/spec.md
- docs/tasks/T006_trend_sparkline/plan.md

对照真相源：`src/main/window/window-manager.ts`、`src/renderer/views/PopupView.tsx`、`src/renderer/components/ProviderOverview.tsx`、`src/renderer/components/ProviderAccountRow.tsx`、`src/renderer/components/UsageRows.tsx`、`src/renderer/components/UsageBarList.tsx`、`src/renderer/components/CollapsibleCard.tsx`、`src/renderer/hooks/use-popup-height-report.ts`、`src/renderer/lib/provider-usage.ts`、`src/renderer/lib/utils.ts`、`src/renderer/styles/globals.css`、`src/main/core/observation/observation-store.ts`、`docs/specs/observation-store.md`、`docs/specs/window-management.md`、`docs/specs/ipc.md`、`docs/specs/web-panel.md`、`docs/blueprint/architecture.md`、`docs/blueprint/domain.md`、`docs/blueprint/conventions.md`。

## 高优先级问题（CRITICAL / HIGH）

### T005_code_f001 — `relative_time` 用于未来 `resetAt` 会全部显示「刚刚」

- 位置：T005 spec.md L21、L33；T005 plan.md L3（行内复用现有 `relative_time`）；对照 `src/renderer/lib/utils.ts:8-23`。
- 现象：spec 把「相对时间」列为预警行时间字段首选工具，验收标准也写「相对时间」。`relative_time` 实现为 `diff = Date.now() - ts; if (diff < 0) return "刚刚"`，对所有 `ts > now`（即将重置时刻恰好是未来）一律返回「刚刚」。
- 影响：rail/banner 中每条预警的时间列都会变成「刚刚」，用户无法区分「3 小时后重置」与「6 天后重置」。直接违反验收「按时间先后排序」「一眼看到何时重置」目标。
- 建议：明确预警行只使用 `format_reset_time`（输出「今天 13:10」「5/18 21:00」），或新增 `relative_time_future` 工具处理「N 小时后/N 天后」。spec 与 plan 必须二选一并在「依赖与约束」中说明选择。
- 置信度：高。
- 优先级：HIGH。

### T005_code_f002 — 横屏 rail 与 overview 横向并排缺少容器拓扑设计

- 位置：T005 spec.md L20「紧邻 .overview-grid」、L41「T004 的 @container (min-width: 1024px) 提供 grid 布局」；T005 plan.md L5；对照 `src/renderer/views/PopupView.tsx:632-750`、`src/renderer/styles/globals.css:338-342`。
- 现象：`.scroll-inner` 是 `display:flex; flex-direction:column`。要让 rail（264px sticky）与 `.overview-grid` 横向并排，必须在其外再包一层 `display:flex|grid` 容器（如 `.overview-row`）。spec/plan 都只说「rail 作为 .overview-grid 兄弟」，但兄弟节点在 flex column 下仍纵向堆叠，rail 无法横到 overview 旁，sticky 也不会就位。
- 影响：实施时设计不可落地，开发者需自行补一层布局；多列 overview 与 rail 列宽协调（T004 用 `repeat(auto-fill, minmax(320px,1fr))`，T005 plan 风险 2 又说「rail 固定 264px 作为 grid 第二列，overview 占 1fr」）两者拓扑不一致——T004 的 auto-fill 多列与 T005 的固定两列冲突。
- 建议：T005 spec 明确：在 `.scroll-inner` 内新增 `.overview-row { display: grid; grid-template-columns: 1fr 264px; gap: 12px; }`，rail 作为第二列 sticky；T004 的 `.overview-grid` 自身继续 auto-fill，但作用域仅限 `.overview-row > :first-child`。两 task 的 grid 拓扑在 spec 中明确分层（外层 overview-row 定两列；内层 overview-grid 定卡片列数）。
- 置信度：高。
- 优先级：HIGH。

### T006_code_f003 — 违反 `domain.md §6 产品边界`「不做趋势图 UI」

- 位置：T006 spec.md L4-5、L18-21；T006 plan.md L24-29；对照 `docs/blueprint/domain.md:73`「不做趋势图 UI（SQLite 留了历史数据，但第一版不出图）」。
- 现象：domain.md 把「不做趋势图 UI」列为产品边界，T006 直接打破。plan Finalization 列出更新 architecture.md / observation-store.md / ipc.md / web-panel.md，但**未列入更新 domain.md §6 移除该条产品边界**，也未在 decisions.md 走「替代旧决策」流程。
- 影响：长期真相与 task 行为冲突；T006 完结后 blueprint 会出现「domain 说不出图，但代码出图了」的不一致。属工作流硬约束违反（CLAUDE.md 单 task 流程 step 8「blueprint 更新前置：review/adoption 完成、黑盒通过」+「未稳定方案留在 task」）。
- 建议：T006 plan Finalization 增条目：「`docs/blueprint/domain.md §6` 移除『不做趋势图 UI』条目」；同时在 `docs/blueprint/decisions.md` 新增条目记录「从第一版不出图 → 改为账号展开区 sparkline 出图」的决策替代。或者先开独立 task 把 domain.md §6 改了，再开 T006。
- 置信度：高。
- 优先级：HIGH。

### T006_code_f004 — 账号下多 metric 场景未定义，sparkline 数据聚合规则缺失

- 位置：T006 spec.md L18-21；T006 plan.md L5-7；对照 `docs/blueprint/domain.md:16`「一账号多条（Claude 5小时+一周=2条）」、`src/main/core/observation-store.ts:44-45` 索引 `(provider, account_id, metric_id, source_instance_id, observed_at)`。
- 现象：spec 写「按 `(provider, accountId)` 取最近 7 天、每天最新一条 observation 的 used/limit」，但 store 主键多键包含 `metric_id` 与 `source_instance_id`。同一账号下：Claude 有「5 小时」「一周」两条 metric；CPA 账号同一 `accountId` 在多 `source_instance_id` 下也可能存在。spec 没说每个账号展开区是画一条 sparkline（如何合并多 metric）、还是画 N 条（每 metric 一条）、还是按 metricLabel 分组。
- 影响：实施时开发者要自行决断；单测易写但行为与用户预期可能不符（如 Claude 账号展开后看到 1 条还是 2 条线）。`build_trend_series` 入参也含糊——若按 `(provider, accountId)` 单点输入，多 metric 数据被错误合并成一条折线（5h 用量与一周用量混算 percent 平均，失真）。
- 建议：spec 明确：每个 `(accountId, metricId)` 一条 sparkline，`query_trend_series` 增加 `metricId` 参数；`ProviderAccountRow` 展开区在 `UsageBarList` 下方按 metric 横向或纵向排列多张 sparkline。或显式声明聚合策略（按 metricId 分组、不跨 metric 合并）。
- 置信度：高。
- 优先级：HIGH。

### T004_code_f005 — `use_popup_height_report` mirror 描述与实际代码不符，回退方案不可靠

- 位置：T004 spec.md L21、L43；T004 plan.md L2、L18-19；对照 `src/renderer/views/PopupView.tsx:793-828`、`use-popup-height-report.ts`、`popup_mirror_style`（`width: 100%`、`height: auto`）。
- 现象：spec 写「mirror 渲染在固定宽度下，不设 container」、plan 风险 1 回退「mirror 选择器显式 `container-type: normal`」、plan 步骤 2 提「`.content-mirror` / `.collapsed-mirror` 或等价选择器」。
    1. mirror 不是「固定宽度」：`popup_mirror_style.width = "100%"`，继承 `.window`（`100vh` 视口宽），随 BrowserWindow 视口宽度变化。
    2. mirror 没有独立 class，两者共用 `.window.popup-mirror`，DOM 中不存在 `.content-mirror`/`.collapsed-mirror` 选择器（只有 ref 名）。
    3. 给 `.scroll-inner` 设 `container-type: inline-size` 时，类选择器会**同时命中** live 与 mirror 内部的 `.scroll-inner`——不是「继承」问题，是「类选择器重复匹配」问题。mirror 内的 `.overview-grid` 在多列断点下也会多列，mirror 测出的 `offsetHeight` 会**变小**（多列压扁）而非变大，向主进程上报错误的 `content_height`，popup 高度被锁到错误值。
- 影响：实施后 popup 高度在窗口拉宽到 ≥1024px 时会出现非预期抖动或裁剪；plan 风险与回退用词误导开发者。
- 建议：
    - spec 改为「mirror 不进入容器查询上下文」实现方式：给 `.scroll-inner` 设 container 时限定 `:not(.popup-mirror *)` 或给 mirror 设显式 `.popup-mirror .scroll-inner { container-type: normal; }`。
    - plan 步骤 2 把 `.content-mirror`/`.collapsed-mirror` 改为 `.popup-mirror`（项目唯一既存 class），并说明回退靠 `.popup-mirror .scroll-inner` 显式覆盖。
    - spec「约束」段区分「CSS 继承」（不发生）与「类选择器重复匹配」（实际风险），避免实施者误判。
- 置信度：高。
- 优先级：HIGH。

## 中低优先级问题（MEDIUM / LOW）

### T006_code_f006 — `--accent` CSS 变量不存在

- 位置：T006 spec.md L11「本项目改用 `--accent` / `--track` CSS 变量」；对照 `src/renderer/styles/globals.css:7-26`（只有 `--blue/--green/--amber/--red/--primary/--ring/--track/--card-bg` 等，无 `--accent`）。
- 现象：spec 假设的 `--accent` 变量在主题层不存在。折线/面积/圆点按 `--accent` 上色会失效（CSS 变量未定义 → 值为空）。
- 影响：sparkline 颜色渲染异常（透明或回退到 `initial`）。
- 建议：spec 改为 `--blue`（与 `--primary` 一致的强调色）或 `--green`（与现有用量条满状态条颜色协调）。若要新增 `--accent` token，作为 T006 前置子任务先加进 globals.css 明/暗两套。
- 置信度：高。
- 优先级：MEDIUM。

### T006_code_f007 — `percent` 字段从 store 读取的写法与 schema 不符

- 位置：T006 spec.md L18「取每天最新一条 observation 的 `used / limit`（或 `percent`）」；对照 `docs/specs/observation-store.md`、`observation-store.ts:21-46` 表结构（无 `percent` 列）。
- 现象：observations 表只有 `used`、`limit`，没有 `percent`。spec「或 percent」表达含糊，会让读者以为 store 可直接返 percent。
- 影响：实施者可能错误设计 `query_trend_series` 返回字段；测试与契约不齐。
- 建议：spec 明确：store 只返 `used`/`limit`/`display_style`；`build_trend_series` 内计算 `percent = clamp(round(used/limit*100),0,100)`，`ratio` 型同样按 percent 归一（plan 风险 2 已有此意，spec 与 plan 对齐）。
- 置信度：高。
- 优先级：MEDIUM。

### T005_code_f008 — `percent` 字段计算口径未交代，与 OverviewWindow 口径关系未定

- 位置：T005 spec.md L18「返回 ... percent, status }[]」；对照 `src/renderer/lib/provider-usage.ts:382-445` `build_overview_for_group`（按 `has_valid_quota` 过滤、`sum(used)/sum(limit)`、`clamp(0,100)`）。
- 现象：spec 返回结构含 `percent`，但没说单条 metric 的 percent 怎么算（period 的 `used/limit` 直除？是否复用 `has_valid_quota` 验证？是否 clamp？`ratio` 型怎么处理？）。
- 影响：rail/banner 显示百分比与用量条百分比可能不一致；同账号多 metric 聚合时尤其易错。
- 建议：spec 明确「percent = period.used/period.limit（period.limit>0 且均 finite），按 displayStyle=`ratio` 时也输出 percent，clamp 0-100；与 OverviewWindow 同口径但不跨 metric 聚合」。
- 置信度：高。
- 优先级：MEDIUM。

### T005_code_f009 — 边界 `resetAt === now` / `resetAt < now` 未定义

- 位置：T005 spec.md L18「过滤 `resetAt` 在 `now ~ now+horizon` 内」；T005 plan.md L5 测试列表「空、null resetAt、>7d 过滤、升序、同账号多 metric」。
- 现象：闭区间还是开区间未说；`resetAt < now`（刚刚过期的重置时刻）如何处理未说。plan 测试清单也没覆盖这两个边界。
- 影响：边界附近行为不确定；刚过期项是否出现在「即将重置」列表有歧义。
- 建议：spec 写明区间（建议半开 `(now, now+horizon]`，`resetAt <= now` 视为已重置跳过）；plan 步骤 1 测试用例补「边界值 resetAt = now」「resetAt = now+horizon」「resetAt < now」三项。
- 置信度：高。
- 优先级：MEDIUM。

### T004_code_f010 — ProviderOverview 现为 fragment，T005/T004 协作假设不足

- 位置：T004 plan.md L3「ProviderOverview.tsx 外层包一层 `.overview-grid`，移除 `<>` fragment」；对照 `src/renderer/components/ProviderOverview.tsx:64-98`（当前返回 `<>{visibleProviders.map(...)}</>`）。
- 现象：T004 plan 假设包一层 div 即可。但 ProviderOverview 当前把 drag/drop handlers 挂在每个 ProviderCard 上，外层包 div 后这些 handler 仍在；外层 div 进入 flex grid，多列拖拽需补 clientX（T004 plan 风险 2 已识别）。但 plan 没提到：ProviderCard 之间间距现在靠 `.scroll-inner { gap: 12px }`（flex column）；改为 `.overview-grid { display:grid; gap:12px }` 后视觉效果可保持，但 ProviderCard 自身 `width:100%` 假设可能不再成立（grid item 默认 stretch，OK），需视觉快照验证。
- 影响：风险等级低，主要提醒测试覆盖。
- 建议：plan 步骤 3 补「视觉快照对比单列布局前/后等价」；T004 plan 已有的风险 2 回退保留。
- 置信度：中。
- 优先级：LOW。

### T005_code_f011 — plan 提到「use_plugins 的 groups」措辞不准

- 位置：T005 plan.md L5「从 `use_plugins` 的 groups 算 `upcomingItems`」；对照 `src/renderer/views/PopupView.tsx:62`（`use_plugins` 返 `{plugins, loading, error, refreshAll, reload}`，无 groups）、PopupView.tsx:251（`providerGroups` 由 `useMemo` 派生自 `plugins`）。
- 现象：plan 写法让人以为 `use_plugins` 直接返回 groups。实际 `providerGroups` 是 PopupView 内部派生。`collect_upcoming_resets` 应接收 `providerGroups`（已聚合），不是直接碰 `use_plugins`。
- 影响：低，意图可推断，但措辞会让初实施者走弯路。
- 建议：plan 改为「从 `providerGroups`（PopupView 已聚合）派生 upcomingItems」。
- 置信度：高。
- 优先级：LOW。

### T004_code_f012 — `maxWidth` 取消或上调到 1400 没有给上限决策

- 位置：T004 spec.md L17「取消或上调至 1400」、L33「可拖宽至 1400px」；对照 `src/main/window/window-manager.ts:39` `maxWidth: 780`。
- 现象：spec 给了 1400 与「取消」两选项未决；若取消，多 monitor 场景（4K 屏宽 3840）下窗口拉到极宽，ProviderOverview auto-fill 会变 N 列（每列 ~320px，10+ 列），UX 恶化。
- 影响：设计决策遗留。
- 建议：spec 定为「上调至 1400」，写明理由「覆盖 1080p / 1440p 单屏横屏，留出 rail 264px + overview 多列空间，与 demo 阈值 1024 一致」；避免「取消」。
- 置信度：中。
- 优先级：LOW。

### T006_code_f013 — `observations` 表索引覆盖验证未列入步骤

- 位置：T006 plan.md L4（查询语义）、L14-15（风险与回退「(provider, accountId, observedAt) 复合索引」）；对照 `observation-store.ts:44-45` 现有索引 `idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)`。
- 现象：现有索引已覆盖 `(provider, account_id, ..., observed_at)` 前缀，`(provider, account_id, observed_at)` 查询可走该索引；但 plan 风险 1 回退说「若已有则直接用」，没要求先验证。另外若 T006 f004 改为按 metricId 查询（推荐），现有索引完全匹配，无需新建。
- 影响：开发者可能误添冗余索引。
- 建议：plan 步骤 1 增「核对 `idx_lookup` 已覆盖 (provider, account_id, metric_id, source_instance_id, observed_at)，无需新建索引」；移除风险 1 中「复合索引」回退。
- 置信度：中。
- 优先级：LOW。

### T004_code_f014 — 视觉快照四档宽度测试与既有快照关系未交代

- 位置：T004 plan.md L5「补充视觉快照（Playwright `test:visual`）覆盖四档宽度」；对照 `docs/blueprint/conventions.md:113`（测试规范）。
- 现象：既有 PopupView 快照可能在某档宽度下因多列布局而大量失效，plan 没说明是否替换基线、是否需要重生成。
- 影响：实施时易把「快照失效」误判为「回归失败」。
- 建议：plan 步骤 5 补「既有快照在 472 基线宽度下重测；新增 780/1024/1440 三档独立快照；旧基线不删除」。
- 置信度：中。
- 优先级：LOW。

## 改进建议

1. **跨 task 拓扑协议**：T004 与 T005 都改 `.scroll-inner` 内布局，应在其中一个 spec（推荐 T004，因为 T005 显式声明依赖 T004）写明 `.scroll-inner` 内的分层：`.scroll-inner`（container） → `.overview-row`（外层两列 grid，仅 ≥1024 生效） → `.overview-grid`（卡片 auto-fill）+ `.upcoming-rail`（sticky 264px）。两个 task 共享此拓扑约定。
2. **T006 决策流程**：T006 因冲突 domain.md 产品边界，建议先开 T006a「更新 domain.md §6 + decisions.md 决策条目」作为 T006 的前置 task，T006b 实施时引用 T006a 的决策编号。否则单 task 内同时改长期真相与实施会违反「长期真相延后」原则。
3. **断点数值表统一**：T004（1024/640）、T005（1024）、T006（无断点需求）三 task 都涉及响应式，建议 T004 spec 在「范围」段单列断点常量表（`BREAKPOINT_WIDE=1024`、`BREAKPOINT_MID=640`），其他 task 引用而非各自重声明。
4. **CSS 变量审计**：T006 f006 反映 spec 写 token 不实。建议 T004/T005/T006 实施前由实施者一次性核对 globals.css 的 token 列表（`--blue`/`--primary`/`--track`/`--green`/`--amber`/`--red`/...），spec 内引用前先确认存在。
5. **测试边界清单标准化**：T005/T006 plan 测试用例清单都漏边界（resetAt=now、空输入、resetAt<now、metric 空数组等）。可在 task 模板里要求「时序/过滤函数单测必须覆盖 `<`、`=`、`>` 三档边界」。

## 不确定项 / 可能误报

- **T005 f002 rail 拓扑缺口**：若实施者已默认知晓「兄弟节点在 flex column 下仍纵向堆叠」，可能直接补一层 flex row——但 spec/plan 没写，仍按缺口标。如果项目另有约定（如 ProviderOverview 改造时包外层 `.overview-row`）在别处文档化，本条可降级为 LOW。
- **T004 f005 mirror 行为**：mirror 内多列触发后 `offsetHeight` 变小的推断基于「ProviderCard 在多列下高度近等、单列时累加高度更大」的常识；若卡片内 `.overview-grid` 有 `align-items: stretch` 导致单列/多列总高度差很小，实际抖动可能轻微。建议实施时实测而非仅推理。
- **T006 f003 domain.md 冲突**：若 domain.md §6 的「不做趋势图 UI」已被其他未读到的 task/commit 移除，本条误报。本次审阅范围不含 domain.md 全量历史追溯，置信度标高但需 owner 复核。
- **T006 f004 多 metric 聚合**：若项目实际使用中 Claude 多 metric 场景在账号展开区已分条展示（UsageBarList 中每条 period 一行），sparkline 按每条 period 一条画是自然延伸；本条仍标 HIGH 是因 spec 没明说，而非实现必然错。
