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
