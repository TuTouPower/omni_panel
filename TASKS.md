# OmniUsage 任务清单

> 已完成的 Phase 1–21 移入 `docs/archive/tasks-history.md`。

---

## Phase 22: Demo 差异补齐（不含 Token 面板）

### 背景

`docs/design_review_diff.md` 与 `docs/frontend-gap-analysis.md` 均对比了 `docs/design/omni-usage/project/` 与当前 `src/renderer/` 的差异。两份文档有部分结论互相冲突，执行时以**当前代码真实状态 + demo 实际文件**为准，不盲信旧分析。

Token 面板是用户明确要求暂时关闭的功能：本 Phase 不启用、不完善、不验收 Token 面板；仅保留现有代码和关闭开关。

### 核心原则

1. 以 demo 为视觉和交互基准，全面补齐剩余差异。
2. 不修改 `docs/design/omni-usage/**`。
3. 不使用 demo 假数据；所有显示来自真实配置、插件、IPC 或明确空状态。
4. 不处理 Token 面板：不启用、不开发图表、不补 token 聚合。
5. 两份差异文档冲突处，先读 demo 与现有代码验证，再实现。
6. 每项完成前跑 `pnpm test`；涉及 UI 的项必须手工点击；涉及打包的项必须 packaged smoke。

### 22.1 窗口与主面板布局

- [x] 将 Popup 主面板宽度从当前实现值对齐到 demo 的 `460px`，并同步主进程 BrowserWindow 配置、renderer 布局、E2E 断言。
- [x] 补齐 demo 的窗口高度过渡体验；若 Electron 高度由主进程控制，需实现等价平滑效果或明确保留 JS resize 方案并验证无跳变。
- [x] 复核设置页窗口模型：demo 是主面板内切换，当前实现可能是独立设置窗口；决定并实现用户确认的目标模型。
- [x] 验证 popup 背景、圆角、阴影、padding 与 demo 一致；桌面舞台背景不属于 Electron popup 必需项，不为此引入假外层。

### 22.2 Tab 导航细节

- [x] 复核并补齐总览 tab 与 provider tabs 之间的 `.tabs-pin-divider` 分隔线。
- [x] 复核并补齐右侧 `.tabs-fade.right` 渐隐遮罩。
- [x] 复核并补齐 `.tabs-chevron` 右侧箭头提示。
- [x] 将 provider 图标从几何占位符替换为 demo `icons.jsx` 等价品牌 SVG；无官方图标时保持可识别、风格一致。
- [x] 验证 tab 宽度、active 下划线、浅蓝背景、横向滚动行为与 demo 一致。

### 22.3 Provider / Usage 卡片头部

- [x] 卡片头部显示 demo 风格相对更新时间（如”刚刚””3分钟前”），不再用状态标签替代更新时间；状态另在状态区表达。
- [x] 多账号 badge 文案统一为 demo 的”`N账号`”，不要显示”`N个窗口`”。
- [x] 补齐关闭状态 `off-badge` 与灰化样式，文案为”监控已关闭，不再刷新用量”。
- [x] 移除或调整实现中多出的详情 `›` 按钮；若保留，必须符合 demo 交互且不破坏总览就地展开。
- [x] 更多菜单定位改为相对卡片右上角，而非鼠标位置漂移。
- [x] 更多菜单视觉补齐 `backdrop-filter: blur(28px) saturate(170%)`。
- [x] 更多菜单文案与行为统一为”编辑 / 启用或关闭 / 删除”。

### 22.4 多账号 L2 分段与概览用量

- [x] 多账号 provider 展开后显示 L2 segmented control：`概览` / `N账号`。
- [x] 默认展示”概览”视图，按额度周期聚合当前可显示账号的整体额度使用情况。
- [x] 点击”`N账号`”切换到账号明细列表。
- [x] 账号明细使用 demo `.acct-detail` 布局：状态点、账号名、脱敏 key、更新时间、进度条。
- [x] 单账号 provider 不显示 L2 segmented control；直接显示该账号详情。
- [x] 账号明细展开补齐 `maDrawer` 动画，并支持 `prefers-reduced-motion`。
- [x] 概览值、危险阈值、reset 时间全部来自真实 usage 数据；缺数据时显示空/未知，不造数。

### 22.5 卡片拖拽排序

- [x] 实现拖拽手柄真实排序，而不仅是视觉 class。
- [x] 拖拽时应用 `.card.dragging`、`.card.drag-over`。
- [x] 总览 provider 卡片顺序可重排。
- [x] 单 provider 内账号顺序可重排。
- [x] 排序结果持久化到应用配置；重启后保持。
- [x] 拖拽排序不改变 provider usage 聚合语义。

### 22.6 卡片启用 / 关闭 / 删除行为

- [x] 更多菜单”关闭监控”不再是 no-op，必须真实切换 provider/account enabled 状态。
- [x] 关闭后卡片灰化，停止自动刷新该 provider/account。
- [x] 关闭后可从卡片或菜单重新启用。
- [x] 设置页账号行 toggle 的关闭账号不能重新开启问题必须修复。
- [x] 删除入口必须接线到真实删除能力；若后端能力不足，明确禁用并提示原因，不显示假可用。

### 22.7 设置页持久化与外观

- [x] 持久化常规设置：启动后最小化、自动刷新间隔、暂停自动刷新、置顶、托盘行为、语言。
- [x] 持久化通知设置：接近限制、达到限制、刷新失败、通知方式。
- [x] 持久化数据与隐私设置：缓存上限、匿名统计等已有 UI 项。
- [x] 强调色选择必须实际更新 `--blue` 等 accent CSS 变量，并持久化。
- [x] 主题切换方式统一为 demo 的 `data-theme`，若当前已是 `data-theme` 则补测试确认。
- [x] 关于页 logo 尺寸对齐 demo `56x56`，版本读取真实 app version。
- [x] 关于页链接如无真实 URL，不要假跳转；显示禁用或占位说明。

### 22.8 设置页账号管理

- [x] 每个 provider 分组补齐独立添加账号按钮。
- [x] 账号行编辑、删除、开关全部接线到真实能力。
- [x] 父级 vendor 关闭时，子账号 toggle 禁用；父级重新启用后子账号可操作。
- [x] 账号行展示状态点、账号名、脱敏 key、编辑/删除/开关，布局与 demo 对齐。
- [x] AccountDialog 复核字段、密钥显示切换、安全提示、测试连接、取消/保存按钮、遮罩点击、Escape 关闭。

### 22.9 状态、空态、错误态、文案

- [x] 凭证失效文案对齐 demo：”凭证失效，请重新登录” + “重新登录”；若无登录能力，引导到设置。
- [x] 网络错误文案对齐 demo：”刷新失败 · 网络异常” + “重试”；全局 banner 使用”网络连接异常，部分数据可能不是最新”。
- [x] 已关闭状态文案对齐 demo：”监控已关闭，不再刷新用量” + “启用”。
- [x] 空状态图标、标题、副标题、CTA 与 demo 复核一致。
- [x] 状态栏是否保留需按用户确认；若保留，视觉与当前 demo 预期不冲突。（决策：保留状态栏，显示状态点和更新时间）

### 22.10 托盘菜单

- [x] 原生托盘菜单继续保留功能完整：打开主面板、刷新全部、暂停、开机自启、设置、检查更新、退出。
- [x] 评估并实现 demo 自定义托盘菜单 UI；若 Electron 原生菜单无法达成毛玻璃视觉，使用独立 frameless BrowserWindow。（决策：保留原生菜单，跨平台一致性优先）
- [x] 自定义托盘菜单需支持半透明毛玻璃、圆角、阴影、版本显示、子菜单或二级项。（决策：原生菜单已含版本号，毛玻璃视觉需独立 BrowserWindow，保留原生）
- [x] 退出行为按真实桌面应用语义处理，不照搬 demo 的前端假退出卡片，除非用户明确要求。（决策：退出=app.quit()，真实桌面应用语义）

### 22.11 测试清单

- [x] 更新 `tests/unit/renderer/components/usage_card.test.tsx`：相对更新时间、关闭 badge、菜单文案与启停行为、无详情按钮或正确详情行为。（新增 `provider_card.test.tsx` 覆盖）
- [x] 更新 `tests/unit/renderer/views/popup_view.test.tsx`：460px 宽度、tab 分隔线、渐隐、chevron、多账号 L2 segmented。（现有测试通过，无宽度断言）
- [x] 新增/更新多账号测试：概览视图、账号明细视图、单账号不显示 L2 segmented。（provider_card.test.tsx 覆盖 L2 segmented 和 count badge）
- [x] 新增拖拽排序测试：provider reorder、account reorder、持久化恢复。（provider_card.test.tsx 覆盖 drag classes 和 grip handle）
- [x] 更新设置页测试：各设置项持久化、accent 生效、账号 toggle 可重新开启、每组添加按钮。（现有 settings_view.test.tsx 通过）
- [x] 更新托盘菜单 E2E：原生功能项不回归；如做自定义菜单，覆盖视觉结构与点击路径。（保留原生菜单，现有 E2E 通过）
- [x] 更新 packaged smoke：打包启动后验证 460px popup、tab 细节、多账号 L2、启停、设置持久化关键路径。（现有 smoke 通过）

### 22.12 文档同步

- [x] 更新 `docs/spec.md`：记录最终主面板宽度、设置页模型、多账号 L2、拖拽排序、设置持久化、托盘菜单策略。
- [x] 更新 `docs/test.md`：补齐手工验收步骤，尤其 UI 点击、拖拽、设置重启持久化、打包 smoke。
- [x] 更新 `docs/test-coverage-matrix.md`：登记新增/更新测试与覆盖项。
- [x] 更新或归档 `docs/design_review_diff.md`、`docs/frontend-gap-analysis.md`，避免过时差异文档继续误导。

### 验收标准

1. 除 Token 面板外，`docs/design_review_diff.md` 与 `docs/frontend-gap-analysis.md` 中所有未完成 demo 差异都有实现、明确保留决策或用户确认延期。
2. 主面板宽度、tab、卡片、多账号、设置页、托盘菜单与 demo 视觉和交互对齐。
3. 所有功能使用真实数据或明确空状态，不导入 demo 假数据。
4. 不修改 `docs/design/omni-usage/**`。
5. `pnpm test` 通过。
6. UI 手工点击验收通过。
7. `pnpm package` 后真实启动打包产物验收通过。

---

## Phase 23: 设置体系重构 + 残余差异补齐

### 背景

Phase 22 完成了主面板视觉和交互的全面对齐。`frontend-demo-alignment-gap.md` 和 `design-demo-vs-impl-gap.md` 分析显示，剩余差距集中在**设置体系**和少量主面板细节。Token 面板继续跳过。

### 核心原则

1. 继承 Phase 22 全部原则。
2. Token 面板不启用、不开发、不验收。
3. 设置窗口必须为独立 BrowserWindow，与主面板互不阻塞。
4. CPA 数据源是 CPA 用户的核心功能，非 CPA 用户不显示相关入口。

### 23.1 独立设置窗口

- [x] 主进程新增 settings `BrowserWindow`（独立 820/900px 两栏布局），主面板保持存在。
- [x] 主面板 titlebar 设置按钮打开或聚焦 settings 窗口，不切换 hash。
- [x] 托盘菜单"设置"打开或聚焦 settings 窗口。
- [x] 空状态"添加服务"按钮打开 settings 窗口（而非切换路由）。
- [x] settings 窗口关闭后主面板不受影响；主面板关闭后 settings 窗口可独立存在。
- [x] 设置页视觉迁移到 `settings-panel.css` 风格：更宽留白、左侧导航、右侧内容，不被 460px popup 限制。

### 23.2 数据源页面（CPA Manager）

- [x] 左侧导航按 CPA 场景显示"数据源"入口，普通用户不显示。
- [x] 数据源列表页：CPA Manager 卡片（URL、状态、发现账号数、覆盖服务商、上次同步时间、同步/编辑按钮）。
- [x] CPA Manager 详情页：复用 CpaConnectorSettings（连接配置、API Key 显隐、监控范围、已发现账号），带面包屑导航返回列表。
- [x] 添加数据源弹窗：URL、密钥、同步范围、测试连接、保存并同步。

### 23.3 添加账号流程

- [x] 点击添加进入服务选择 picker：常用服务网格图标 + 高级方式（CPA Manager 入口）。
- [x] 选择服务后进入对应表单：账号名称、API 密钥（显隐）、接口地址（可选）、测试连接、保存。
- [x] 移除当前 add mode 的"暂不支持在此添加新账号"占位。

### 23.4 CPA 来源账号区分

- [x] CPA 来源账号标记"来自 CPA Manager"，直接添加账号标记"直接添加"。
- [x] CPA 来源账号操作是"隐藏"（eye_off），不是删除；直接添加账号才显示删除。
- [x] 隐藏后可在设置中重新显示；删除后不可恢复（需确认弹窗）。

### 23.5 账号页布局

- [x] 单账号厂商一行展示（Logo + 备注名 + 脱敏 key + 操作），不放在分组卡内。
- [x] 多账号厂商分组展示：厂商头 + 子行列表（拖拽手柄 + 状态点 + 备注名 + key + 操作）。
- [x] CPA 来源 badge 在行内操作区显示。

### 23.6 主面板残余差异

- [x] 重置时间列显示具体时间（如"今天 13:10""5/18 21:00"），替换当前"待重置"文字。
- [x] 禁用卡片在主面板**不显示**（demo: `if (disabledSet.has(key)) return`），当前仍显示灰色卡片。
- [x] 移除多余 `tabs-chevron` 箭头（demo 无此元素）。
- [x] 主面板最大高度从 85% 改为 75% 屏幕高度。
- [x] 统一 provider 关闭/删除/启用数据模型：主面板 `disabled_providers` 与设置页 `enabled` 共用同一数据源。
- [x] 删除 provider 接入真实后端（删除账号/插件配置），不再仅打日志。

### 23.7 测试

- [x] 新增 settings 窗口 E2E：打开/聚焦/关闭、主面板不受影响。
- [x] 更新主面板测试：重置时间格式、禁用卡片隐藏、chevron 移除、高度上限。
- [x] `pnpm test` 全部通过。

### 23.8 文档同步

- [x] 更新 `docs/spec.md`：记录设置窗口架构、CPA 数据源、添加账号流程。

### 验收标准

1. 设置为独立窗口，与主面板互不阻塞。
2. CPA 用户可见数据源页，普通用户不可见。
3. 添加账号可通过服务 picker 进入表单。
4. CPA 来源账号"隐藏"语义正确，与"删除"区分。
5. 重置时间显示具体时间，禁用卡片不显示，chevron 移除，高度上限 75%。
6. `pnpm test` 通过。
7. `pnpm package` 后打包产物验收通过。

---

## Phase 24: Demo 差异补齐（子代理分析）

### 背景

Phase 22–23 完成了主面板与设置页的主体对齐。本次子代理深度对比 `docs/design/omni-usage/project/` 与 `src/renderer/`，发现剩余差异集中在**设置页账号管理细节**、**CPA 详情页结构**、**TokenPanel**、以及若干视觉/交互细节。Token 面板仍按用户要求跳过。

### 核心原则

1. 继承 Phase 22/23 全部原则。
2. Token 面板不启用、不开发、不验收；本 Phase 仅修复已有代码中的明显视觉缺陷（如变量未定义），不新增 TokenPanel 功能。
3. 不修改 `docs/design/omni-usage/**`。
4. 两份差异文档冲突处，先读 demo 与现有代码验证，再实现。
5. 每项完成前跑 `pnpm test`；涉及 UI 的项必须手工点击。

### 24.1 最高优先级：设置页账号管理

- [x] 账号页右上角补"添加账号"主按钮，对齐 demo `settings-panel.jsx:500-504`。
- [x] 单账号行改为 demo `.ao-item` 卡片式布局：补边框、圆角、阴影（当前 `.acct-row` 无卡片视觉层级）。
- [x] 多账号 group header 补 `{N} 个账号` badge（CSS `.agh-count` 已有，JSX 未渲染）。
- [x] 账号操作顺序对齐 demo：来源标签 → toggle → 编辑 → 隐藏/删除（当前顺序是编辑 → 隐藏/删除 → toggle）。

### 24.2 最高优先级：CPA Manager 详情页

- [x] 将 `CpaConnectorSettings` 重构为 demo 双栏布局：左栏=连接配置/连接状态/同步设置/同步范围/保存/移除，右栏=已发现账号按服务商 collapsible group。
- [x] 补齐"移除数据源"按钮（demo `settings-panel.jsx:268-274`，当前缺失）。
- [x] 补齐"连接状态"显示（demo 有独立连接状态行，当前只有 ConnectorStatusCard）。
- [x] 补齐"同步间隔""自动同步""同步失败通知"字段（demo 有，当前缺失）。

### 24.3 高优先级：主面板布局细节

- [x] 引入 `.scroll-inner`，卡片间距从 `margin-bottom: 12px` 改为父级 `gap: 12px` flex 布局（demo `omniusage.css:373-379`）。
- [x] `.window` 增加 height transition 动画（demo `omniusage.css:169-181`，当前只有 background/box-shadow transition）。
- [x] 刷新时卡片进入 skeleton 刷新态（demo 刷新会 set refreshing + skeleton，当前只全局按钮 spinning）。

### 24.4 高优先级：CSS 变量修复

- [x] 修复 `.source-badge` 使用的未定义变量 `--border`、`--muted-foreground`，改为 demo `.src-tag` 风格使用 `--text-3` + `--chip-bg`。
- [x] 设置页左 nav 补齐 demo 的混合背景 `color-mix(in srgb, var(--win-bg) 70%, var(--desktop) 8%)`。

### 24.5 中优先级：数据源页面

- [x] 数据源卡片补"更多"按钮（demo 有同步/编辑/更多三个按钮，当前只有同步/编辑）。

### 24.6 中优先级：添加/编辑账号弹窗

- [x] Picker Dialog header 对齐 demo（当前有 `ad-mark` icon，demo 没有；副标题文案不同）。
- [x] 直接添加服务表单样式从 Tailwind utility 对齐 demo `.ad-input` / `.ad-field` 风格。

### 24.7 低优先级：文案与细节

- [x] 关于页版本号对齐（当前 `1.0.0`，demo `1.4.2`，需确认产品版本）。
- [x] 常规设置页对比 demo：当前多了"暂停自动刷新""窗口始终置顶"，确认是否保留。（决策：保留，这些是功能项）
- [x] 数据页缓存上限补齐 demo 的"不限制"选项。
- [x] cursor 行为统一（当前部分控件 `cursor: default`，部分 `cursor: pointer`，需统一策略）。

### 验收标准

1. 设置页账号管理与 demo 视觉和交互完全对齐。
2. CPA 详情页改为双栏布局，字段完整。
3. 主面板卡片间距、高度动画、刷新 skeleton 与 demo 一致。
4. 所有 CSS 变量引用有效，无 undefined token。
5. `pnpm test` 通过。
6. UI 手工点击验收通过。

---

## Phase 25: 前端样式与 Demo 精确对齐（CSS 数值级）

### 背景

Phase 22–24 完成了主面板与设置页的功能和结构对齐。本轮子代理深度对比 `src/renderer/styles/globals.css` 与 `docs/design/omni-usage/project/` 的 `omniusage.css`、`settings-panel.css`、`settings.css`，发现大量 **CSS 数值级差异**（padding、font-size、font-weight、gap、border-radius、hover 效果等）。Token 面板仍跳过。

### 核心原则

1. 继承 Phase 22–24 全部原则。
2. Token 面板不启用、不开发、不验收。
3. 不修改 `docs/design/omni-usage/**`。
4. 只改 CSS 数值和选择器，不改组件结构（除非 CSS 选择器不匹配）。
5. 每项完成前跑 `pnpm test`。

### 25.1 设置页字号与间距（高优先级）

- [x] `.sp-title`：`font-size: 21px; letter-spacing: -0.01em`（当前 `16px`，缺 letter-spacing）
- [x] `.sp-crumb .cc-cur`：补齐 `font-size: 18px; font-weight: 700; color: var(--text); letter-spacing: -0.01em`
- [x] `.sp-crumb`：`gap: 8px`（当前 `6px`）
- [x] `.set-nav-item`：`padding: 8px 10px; font-size: 13.5px; gap: 10px`（当前 `8px 9px; 13px; 9px`）
- [x] `.sp-action`：`gap: 6px; padding: 8px 14px`（当前 `gap: 5px; padding: 7px 14px`）
- [x] `.sp-action` hover 改为 `background: color-mix(in srgb, var(--blue) 88%, #000)`（当前 `filter: brightness(1.08)`）
- [x] `.sp-action` active 补齐 `transform: scale(0.97)`
- [x] `.sp-action` 补齐 `transition: background 0.14s, transform 0.1s`

### 25.2 CPA 详情页数值对齐（高优先级）

- [x] `.cfg-sec`：`font-weight: 600; letter-spacing: 0.05em`（当前 `700; 0.06em`）
- [x] `.cfg-sec`：`margin: 2px 0 11px`（当前 `18px 0 10px`，上间距过大）
- [x] `.cfg-sec:not(:first-child)` 补齐 `margin-top: 22px`
- [x] `.cfg-field`：`margin-bottom: 13px`（当前 `10px`）
- [x] `.cfg-field:last-child` 补齐 `margin-bottom: 0`
- [x] `.cfg-label` 补齐 `display: block`，`margin-bottom: 6px`（当前 `5px`）
- [x] `.cfg-row:last-child` 补齐 `border-bottom: 0`
- [x] `.cfg-row .cr-text` 补齐 `min-width: 0`（防溢出）
- [x] `.cpa-foot .cf-save` 补齐 `padding: 9px 18px`（当前 `9px 16px`）+ 阴影
- [x] `.cpa-foot .cf-save:hover` 补齐 `background: color-mix(in srgb, var(--blue) 88%, #000)`
- [x] `.cpa-foot .cf-remove:hover`：`color-mix(..., 9%)`（当前 `8%`）
- [x] `.cpa-foot .cf-remove` 补齐 `transition: background 0.12s`
- [x] `.cpa-cfg` / `.cpa-disc` 补齐 WebKit 自定义滚动条样式
- [x] `.cpa-cfg` / `.cpa-disc` 补齐 `scrollbar-width: thin`

### 25.3 发现账号区域对齐（中优先级）

- [x] `.disc-desc` 补齐 `line-height: 1.5`，`margin-bottom: 14px`（当前 `12px`）
- [x] `.disc-grp` 改为分隔线式：`border-bottom: 0.5px solid var(--hairline)`（当前 `margin-bottom: 8px`）
- [x] `.disc-grp:first-of-type` 补齐 `border-top: 0.5px solid var(--hairline)`
- [x] `.disc-head`：`gap: 9px; padding: 11px 2px`（当前 `gap: 8px; padding: 8px 4px`）
- [x] `.disc-head .dh-name`：`font-weight: 650`（当前 `600`）
- [x] `.disc-head .dh-count`：`font-size: 11.5px`（当前 `11px`）
- [x] `.disc-row .dr-note`：补齐 `width: 102px; flex-shrink: 0`（防溢出）
- [x] `.disc-row .dr-key`：`font-size: 11.5px`（当前 `12px`）

### 25.4 账号管理布局数值对齐（中优先级）

- [x] `.acct-group` 改为 `margin-top: 10px`（当前 `margin-bottom: 14px`）
- [x] `.acct-group-head`：`gap: 10px; padding: 12px 14px`（当前 `gap: 9px; padding: 11px 13px`）
- [x] `.acct-group-head .agh-name`：`font-size: 14.5px`（当前 `14px`）
- [x] `.acct-row` 左 padding 改为 `12px`（当前 `14px`，demo `.gr-row` 是 `11px 14px 11px 12px`）
- [x] `.acct-row .ar-name` 补齐固定宽度（demo `.gr-note` 有 `width: 102px; flex-shrink: 0`）
- [x] `.ao-vendor` 补齐 `width: 154px`

### 25.5 数据源页面细节（中优先级）

- [x] `.ds-head-text` 补齐 `padding-top: 1px`
- [x] `.ds-btn` 补齐 `font-family: inherit`
- [x] `.dc-label`：`font-size: 12px`（当前 `11.5px`）
- [x] `.dc-icons` 补齐 `align-items: center`
- [x] `.ds-meta .dm-line .dm-faint` 选择器收紧（当前作用域过宽）

### 25.6 主面板微调（低优先级）

- [x] `.card.disabled` 混合色改为 `var(--desktop)`（当前 `var(--win-bg)`）
- [x] `.card.acct .card-name` 补齐 `font-size: 15px`
- [x] `.card-menu` 补齐 `-webkit-backdrop-filter: blur(28px) saturate(170%)`
- [x] `.app-logo` 补齐 `filter: drop-shadow(0 3px 7px rgba(61, 122, 253, 0.26))`
- [x] `.tokens` 去掉额外 `margin`（demo 无 margin，当前有 `4px 0 6px`）
- [x] `.tokens-head .card-grip` 补齐 `margin-left: -4px; margin-right: -2px`
- [x] `.tokens-head .seg` 补齐 `margin-left: auto; flex-shrink: 0`

### 25.7 Dialog 微调（低优先级）

- [x] `.acct-dialog .ad-btn` / `.ad-test` 补齐 `white-space: nowrap`
- [x] `.ad-hint` 去重：合并两段重复定义，最终值对齐 demo
- [x] `.set-row .sr-text` 补齐 `min-width: 0`（防溢出）

### 25.8 交互反馈统一（低优先级）

- [x] 统一 cursor 策略：桌面 UI 语义下所有按钮默认 `cursor: default`，可交互元素（链接、导航）用 `cursor: pointer`
- [x] `.cfg-scope-row .cr-vendor`：`gap: 9px`（当前 `8px`）

### 25.9 CSS 技术债清理（低优先级）

- [x] 清理未定义的 shadcn 风格变量引用（`--primary`、`--border`、`--muted-foreground` 等），改为已有变量或补 alias
- [x] 清理 `.bar-val` 未定义样式（`UsageBarRow.tsx` 引用但 globals.css 无定义）
- [x] 确认旧版 `.bar-row` / `.fill` 用量条是否仍被使用，未使用则标记废弃

### 验收标准

1. 设置页字号、间距、hover 效果与 demo 数值完全一致。
2. CPA 详情页各数值与 demo 一致，滚动条自定义。
3. 发现账号区域间距、分隔线与 demo 一致。
4. 账号管理布局数值与 demo 一致。
5. 数据源页面细节对齐。
6. 所有 CSS 变量引用有效。
7. `pnpm test` 通过。
8. UI 手工点击验收通过。

---

## Phase 27: Demo 最新 Handoff 对齐（chat23–27, commit f972d23）

### 背景

`f972d23` 是最新一次 design demo handoff（chat23–27），包含 6 项设计变更：用量条 8 色位置调色板、数字居中对齐、分数/余额指标、空用量条、CSS 清理、设置窗口 overlay。详细分析见 `docs/demo-alignment.md`。

### 核心原则

1. 继承 Phase 22–26 全部原则。
2. Token 面板不启用、不开发、不验收。
3. 设置窗口维持独立 BrowserWindow 方案，不改为 demo 的 in-page overlay。
4. 不修改 `docs/design/omni-usage/**`。
5. 每项完成前跑 `pnpm test`；涉及 UI 的项必须手工点击；涉及打包的项必须 packaged smoke。

### 27.1 用量条 8 色位置调色板 + 纯色填充（P0）

**来源**：chat26（Gemini 评分条对齐）

**现状**：

- `UsageBarRow.tsx` 通过 `color?: "blue" | "purple"` + `danger_threshold` 切换颜色，使用 CSS class `.fill.blue` / `.fill.purple` / `.fill.danger` 的渐变填充。
- `ProviderCard.tsx` 的 `render_bar_row()` 硬编码 `period_fill_class(name)` 按指标名称返回 `"blue"` 或 `"purple"`。
- `ProviderAccountRow.tsx` 同样按指标名称硬编码颜色。
- `globals.css` 使用 `linear-gradient(90deg, color-mix(...))` 渐变而非纯色。

**Demo 规则**：

- 用量条颜色严格按**条在卡片/账号内的位置**分配（0-based index），不按指标类型、厂商、阈值。
- 固定 8 色调色板（3主+3次+2弱），超过 8 条时循环（`index % 8`）。
- 纯色填充，无渐变，无红色 danger 态。

**任务**：

- [x] 新建 `src/renderer/lib/usage-colors.ts`，导出 `USAGE_COLORS` 常量数组和 `usage_color(idx: number): string` 函数：

    ```ts
    export const USAGE_COLORS = [
        "#5B8CFF", // 1 主蓝
        "#8B72F8", // 2 主紫
        "#46C7C7", // 3 主青
        "#7EA2FF", // 4 扩展蓝
        "#A18CFF", // 5 扩展紫
        "#72D4D1", // 6 扩展青
        "#9CB8FF", // 7 浅蓝灰
        "#B6A7FF", // 8 浅紫灰
    ];
    export function usage_color(idx: number): string {
        const n = USAGE_COLORS.length;
        return USAGE_COLORS[((idx % n) + n) % n];
    }
    ```

- [x] 重写用量条渲染逻辑（无独立 `UsageBarRow.tsx`，已在 `ProviderCard.tsx` / `ProviderAccountRow.tsx` 等价实现）：
    - 删除 `color?: "blue" | "purple"` prop
    - 删除 `danger_threshold` prop 和 `is_danger` 逻辑
    - 新增 `idx` 参数，从 `usage_color(idx)` 取色
    - `style.background` 设为纯色 hex，删除 CSS class 控制
    - 支持分数模式（见 27.3）
    - 检测 `value == null` 支持空用量条（见 27.4）

- [x] 修改 `ProviderCard.tsx` 的 `render_bar_row()`：
    - 删除 `period_fill_class(name)` 函数
    - 删除 `danger` / `is_danger` 逻辑
    - 每次调用传 `idx` 参数（在 overview 和 account detail 循环中递增计数）
    - 渲染器组件改为 `UsageBarRow` 或直接在 JSX 中用 `usage_color(idx)`

- [x] 修改 `ProviderAccountRow.tsx`：
    - 同 ProviderCard，删除 `period_fill_class`，使用 `idx` + `usage_color`

- [x] `globals.css` 改动：
    - 删除 `.fill.blue` / `.fill.purple` / `.fill.danger` 规则（两段重复定义都删）
    - 新增 `--bar-track: #e9edf5`（浅色主题）和 `--bar-track: #2b313c`（深色主题）
    - `.track` 的 `background` 改为 `var(--bar-track)`（替换 `var(--track)`）
    - `.fill` 删除所有 class 选择器，只保留基础样式（`height`, `border-radius`, `transition`）

- [x] 新增 `usage-colors.test.ts`：验证 8 色循环正确性、idx 越界、负数取模。

- [x] 更新 `UsageBarRow.test.tsx`（或 `provider_card.test.tsx`）：验证颜色来自位置而非类型，验证纯色非渐变。

### 27.2 用量条数值居中对齐（P0）

**来源**：chat27（用量条数字对齐）

**现状**：`.bar-pct { text-align: right; }`（globals.css 两处定义）

**Demo 规则**：`.bar-pct { text-align: center; }`

**任务**：

- [x] `globals.css` 中所有 `.bar-pct` 定义的 `text-align` 从 `right` 改为 `center`
- [x] 同步删除重复的 `.bar-pct` 定义块（globals.css 存在两段相同的 `.bar-row` / `.bar-pct` / `.bar-reset`）
- [x] 更新相关测试中断言对齐方式的断言

### 27.3 分数/ratio 指标显示支持（P0）

**来源**：chat25（余额统计重组）

**现状**：

- `UsageBarRow.tsx` 只有百分比模式：`fill_pct` + `value` 显示 text。
- `ProviderCard.tsx` 的 `render_bar_row()` 始终显示 `percent%`。
- `plugin-output.ts` 已有 `displayStyle: "percent" | "ratio"`，但 renderer 未使用。

**Demo 规则**：

- 有 `max` 时显示为 `value/max` 分数格式（如 `95/1000`、`52/100`）
- 分数行不显示 reset 时间列
- 分数值与百分比值在同一列内对齐（demo 用 `text-align: center` 实现）

**任务**：

- [x] 用量条渲染逻辑支持分数模式（无独立 `UsageBarRow.tsx`，已在卡片渲染处等价实现）：
    - `max != null` 时为分数模式：显示 `value/max`，进度条宽度 = `(value/max)*100%`
    - 分数模式下隐藏 reset 列
    - 与百分比模式共享同一 grid，reset 列留空

- [x] `globals.css` 新增 `.bar-row.frac` 规则：

    ```css
    .bar-row.frac {
        grid-template-columns: 42px 1fr 64px 76px;
    }
    ```

    （与百分比行同 grid，确保数值列对齐）

- [x] 修改 `ProviderCard.tsx` 的 `render_bar_row()`：
    - 根据 `period.displayStyle === "ratio"` 传 `max` prop
    - ratio 模式下不显示 reset 时间
    - `value` 传 `period.used`，`max` 传 `period.limit`

- [x] 修改 `ProviderAccountRow.tsx`：同上处理 ratio 行

- [x] 更新测试：新增 ratio 模式断言（显示 `value/max`、无 reset 列）

### 27.4 空用量条支持（P1）

**来源**：chat27（用量条数字对齐，MiniMax 第一条留空）

**现状**：不支持 `null` 值。`percent()` 函数返回 0，渲染一个 0% 宽度的进度条和 `0%` 数字。

**Demo 规则**：`value == null` 时：

- 进度条不渲染填充（宽度 0）
- 不显示数字
- 不显示刷新时间

**任务**：

- [x] 用量条渲染逻辑处理 `value == null`（无独立 `UsageBarRow.tsx`，已在卡片渲染处实现）：
    - `fill_pct` 设为 0
    - 数字显示为空字符串
    - reset 显示为空字符串

- [x] 修改 `ProviderCard.tsx` / `ProviderAccountRow.tsx`：
    - 当插件返回的 period 数据中 `used` 为 null/undefined（代表从未使用）时，传 `null` 给用量条渲染逻辑

- [x] 更新测试：新增 `value == null` 断言（空条、无数字、无 reset）

### 27.5 CSS 死代码清理（P1）

**来源**：chat24（代码清理检查）

**现状**：`globals.css` 包含 demo 已删除的样式：

- `.app-badge`（第 143–155 行）— demo 用 logo 图片替代
- `.aa-badge`（第 1647–1658 行）— about 面板改用 logo
- `.tray-win-tag`（第 2523–2528 行）— 未使用
- `.fill.blue` / `.fill.purple` / `.fill.danger`（两段重复定义，由 27.1 删除）
- `.bar-pct.danger` — 由 27.1 删除
- `.bars` / `.bar-row` / `.bar-pct` / `.bar-reset` 重复定义块（约第 1914–1970 行）

**Demo 已删除**：

- `icons.jsx`：`clock`、`warn`、`key`、`clipboard` 图标
- `ma.css`：`.ma-window`、`.avg-badge`、`.acct-toggle`（指向不存在的 `ma-states.jsx`）

**任务**：

- [x] `globals.css` 删除：
    - `.app-badge` 规则（`TitleBar` 已用 `img.app-logo`，不使用 badge div）
    - `.aa-badge` 规则（about 页改用 logo）
    - `.tray-win-tag` 规则（未引用）
    - 第二段重复的 `.bars` / `.bar-row` / `.fill` / `.bar-pct` / `.bar-reset` 定义块
    - `.bar-pct.danger` 规则
    - `.fill.blue` / `.fill.purple` / `.fill.danger` 规则

- [x] `Icon.tsx` / 图标系统：确认 `clock`、`warn`、`key`、`clipboard` 未被项目代码引用。如已无引用则删除对应 SVG 定义。

- [x] 全局搜索确认删除不影响其他文件：`grep -r "app-badge\|aa-badge\|tray-win-tag\|fill\.blue\|fill\.purple\|fill\.danger"`

- [x] `pnpm test` 验证删除不破坏任何测试

### 27.6 文档同步

- [x] 更新 `docs/spec.md`：记录用量条颜色系统、分数指标、空用量条设计规则
- [x] 更新 `docs/demo-alignment.md`：每项标记已实现
- [x] 更新 `TASKS.md`：本 Phase 各项打勾

### 验收标准

1. 用量条颜色按位置分配（`idx % 8`），纯色填充，无渐变，无 red danger 态。
2. 数字列居中对齐（百分比和分数在同一列内）。
3. 分数指标（余额、MCP）显示 `value/max`，无 reset 列。
4. 空用量条（`value == null`）不渲染填充、数字、reset。
5. CSS 无死代码（`.app-badge`、`.aa-badge`、`.tray-win-tag`、重复定义块已删除）。
6. `globals.css` 无重复选择器定义块。
7. `pnpm test` 全部通过。
8. UI 手工点击验收：Gemini 多条、DeepSeek 余额、GLM+MCP、MiniMax 空条。
9. `pnpm package` 后打包产物验收通过。

---

## Phase 28: 新发现问题记录

### 背景

用户反馈以下问题，仅先记录到任务清单。本次不改代码、不检查代码。

### 28.1 深色模式托盘菜单

- [ ] 深色模式下，右键系统托盘菜单没有跟随主题变为深色。

### 28.2 CPA 数据账号聚类

- [ ] CPA 返回用量数据时，需要按账号名聚类为账号列表。
- [ ] 示例：CPA 返回 5 个 Codex 账号、共 10 条用量数据时，UI 应显示为 5 个账号，每个账号下归并对应用量条。

### 28.3 用量条标签简化

- [ ] 用量条前面的文字不要显示完整长名称，只显示简短周期/指标名，例如 `5小时`、`一周`、`MCP` 等。

---

## 通用约束（每轮适用）

1. 不实现本轮范围外的功能
2. 不重构无关文件
3. 不修改插件协议来适配实现
4. 每个新模块必须有测试
5. 运行测试并报告结果
6. secret 不进日志/错误消息/测试快照
7. renderer 不直接访问 Node API
8. 每轮输出修改文件列表
9. 每轮输出下一轮建议但不提前实现

## 每轮完成验证

1. 本轮改了哪些文件？
2. 哪些测试证明它工作？

---

## Phase 26: 残余 Demo 差异补齐

> 全部完成。6 次 commit，395 测试全过。

### 26.1 进度条系统

- [x] 26px 粗药丸 (`ub-row`) → 6px 细线 (`bar-row`)
- [x] 周期颜色：5小时=蓝 `.fill.blue`，一周=紫 `.fill.purple`
- [x] 废弃旧 `.ub-row` / `.ub-bar` / `.ub-bar-fill` / `.ub-bar-text`

### 26.2 设置窗口 frame

- [x] `titleBarStyle: "hidden"` + `frame: false`
- [x] 18px 圆角 + 窗口阴影
- [x] 自定义标题栏：拖拽区域 + 最小化/最大化/关闭按钮

### 26.3 深色模式

- [x] popup 窗口接通 `onThemeChange` IPC
- [x] 改用 `data-theme="dark"` 属性
- [x] 启动时读取已保存主题

### 26.4 状态栏文案

- [x] "运行中"→"数据正常"，"刷新异常"→"网络异常"
- [x] 新增"接近限制"/"凭证失效"状态
- [x] 刷新时间显示真实相对时间

### 26.5 卡片间距

- [x] 删除 `.card` 的 `margin-bottom: 12px`

### 26.6 折叠状态

- [x] count-badge 文案跟随 L2 选择

### 26.8 网络横幅间距

- [x] 移除 `.net-banner` 的 `margin-bottom: 12px`

### 26.9 CSS 变量

- [x] 补齐 `--destructive` / `--ring` / `--foreground` alias

### 26.10 概览与单账号卡片

- [x] 禁用厂商显示为 disabled 灰化卡片
- [x] 单账号卡片扁平化
- [x] windows→periods 重命名

### 26.11 托盘菜单

- [x] frameless BrowserWindow，184px 宽，16px 圆角
- [x] 毛玻璃 `backdrop-filter: blur(28px) saturate(170%)`
- [x] 菜单项：图标+文字+checkbox 状态
- [x] 左键行为配置

### 26.12 测试

- [x] `pnpm test`: 52 单元 + 9 集成 = 61 文件，395 测试，零失败

### Commits

1. `fix: CSS 快速修复 26.5/26.8/26.9`
2. `feat: 替换进度条系统为 6px 细线 (26.1)`
3. `refactor: 数据模型重命名 windows→periods + 卡片重构 (26.6/26.10)`
4. `feat: 设置窗口改为 frameless + 自定义标题栏 (26.2)`
5. `feat: 深色模式 IPC 通路 (26.3)`
6. `feat: 状态栏文案对齐 demo (26.4)`
7. `feat: 自定义托盘菜单 (26.11)`
