# Task spec

## 背景

`project_manager`（Streamlit）与 `my_life`（Python commit 统计脚本）两个仓已废弃，其能力今后并入 omni_panel。本 task 建立第 5 个面板「开发面板」的骨架（窗口 / 导航 / 托盘入口 / 路由 / 配置落点），并迁移其中「Commit 历史」能力：用 React + echarts 原生重写 commit 活动热力图，扫描根可配置，不依赖 Python / matplotlib / 外部静态 HTML。

## 契约区

### 范围

- 新增第 5 个面板 route `dev`（桌面端独立窗口；web 端可经 hash 路由渲染）。
- 桌面端：`WINDOW_CONFIGS.dev` 条目 + 单例窗口控制器 + 托盘菜单「开发面板」入口。
- 面板间导航：`PanelName` 增加 `Dev`，`PanelTitleBar` 增加第 5 个互跳按钮（桌面 Button / web `<a href="#dev">`）。
- 面板配置命名空间 `AppConfiguration.devPanel`（扫描根、cutoff、是否仅当前 git 全局用户），走 config-store 持久化。
- commit 历史：主进程执行只读 `git log`，解析并聚合（日粒度计数 + 仓库维度），renderer 以既有 echarts 能力渲染热力图（GitHub 风格），沿用 DESIGN.md 设计 token。
- 扫描状态与新鲜度标注：显示扫描根、最近扫描时间、命中 commit 总数、扫描失败信息。

### 非范围

- 不做模型路由（见 t482）。
- 不迁移 `project_manager` 的端口 Dashboard、脚本操作区、端口自启。
- 不迁移 `my_life` 的 PNG 图表 / `report.md` / `heatmap.html` 静态产物。
- 不在本 task 内删除或归档 `project_manager` / `my_life` 仓。
- 不做面板内多配色 / 多 layout 切换（旧 `heatmap.html` 的 green/blue/red/orange/purple 与 classic/compact/calendar 切换不迁，统一单一形态）。
- 不改 web 端能力面（web 下 dev 面板只读渲染，不做写操作）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：桌面端能从托盘菜单打开「开发面板」独立窗口；重复点击聚焦已开窗口而非新开。
- [ ] AC-002：开发面板标题栏显示 `Omni Panel - Dev`，并含 Usage/Agent/Session/Settings/Dev 五个面板互跳入口；点击任一入口切换到对应面板窗口。
- [ ] AC-003：web 端访问 `#dev` 可渲染开发面板内容；web 下不提供写操作入口。
- [ ] AC-004：面板顶部可按配置的扫描根执行一次扫描；完成后显示「命中 commit 总数 + 最近扫描时间」；扫描进行中显示加载态，扫描失败显示可读错误而非崩溃。
- [ ] AC-005：以配置的 cutoff 日期与「仅当前 git 全局用户 / 全部作者」开关过滤 commit；关闭「仅当前用户」时统计包含其他作者。
- [ ] AC-006：渲染热力图，单元格按当日 commit 数分档着色；悬停显示日期、当日 commit 数及仓库维度明细。
- [ ] AC-007：扫描根、cutoff、作者过滤三项可在开发面板内修改并持久化，重启应用后仍生效。
- [ ] AC-008：开发面板全部可见元素使用 DESIGN.md 定义的设计 token 与统一 ui 组件库（`src/renderer/components/ui/`），不出现散落字面量色值或自造组件样式。
- [ ] AC-009：扫描不修改任何被扫描仓库；扫描根不存在或不可读时跳过并报可读信息，不影响其他扫描根。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（窗口创建 / 托盘入口 / 导航项以单元测试覆盖；扫描聚合以真实临时 git 仓库集成测试覆盖；热力图与配置持久化以 renderer 测试 + web e2e 覆盖）。
- AC-001 / AC-002 的 macOS 托盘真实弹出行为属 `[deploy]` 人工签收项，自动化只覆盖「菜单项存在 + 调用 open 路径」。

## 上下文区

- 来源（核实日期 2026-09-14）：`project_manager` 仓 `app/port_dashboard.py`（第 5 面板骨架参考：CSS / 表格 / expander 风格）、`app/commit_history.py`（热力图嵌入 + 刷新触发 + 锁）；`my_life` 仓 `commit_stats/generate_commit_stats.py`（`scan_roots`、cutoff `2026-03-20`、`discover_repos`、作者过滤、`build_daily_summary` / `build_repo_summary`、`render_heatmap_html` 数据结构）。
- 迁移期漂移：`commit_history.py` 文案写扫描 `~/testuser_ubuntu ~/archive /mnt/d/Kar/Code`，而脚本内 `scan_roots` 为 `/home/testuser/testuser_ubuntu`、`/home/testuser/archive`、`/mnt/d/Kar/Code/omni_pot`、`/mnt/d/Kar/Code/omni_usage`；两仓均废弃，本 task 以「可配置」取代硬编码，默认值见「依赖与约束」。

### 有意不测

无

### 测试策略

- 主进程 git 扫描：单元 / 集成测试在 `os.tmpdir()` 下用真实 `git init` + 多次 commit 构造 fixture 仓库（真实 git，不用 mock），断言扫描结果、作者过滤、cutoff 过滤、缺失根跳过。
- 配置持久化：复用 config-store 既有测试形态（真实读写 + zod 校验）。
- 窗口与路由：沿用 `agent-window-controller` / `window-manager` 既有单测形态（fake window 注入）；`panel-navigation` 与 `PanelTitleBar` 以 renderer 单测覆盖。
- 热力图：断言数据 → option 的纯函数映射，不依赖真实 canvas 渲染。
- e2e：web 端 `#dev` 渲染 + mock 扫描数据路径。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 交互式登录 shell 的 PATH（`/opt/homebrew/bin` 等）在 GUI 启动的 Electron 主进程可能不完整，`git` 可执行文件定位方式：`UNVERIFIED-BLOCKING`，实施时用 `execFile("git", ["--version"])` 实跑确认。
- 大仓库（数十万 commit）下 `git log --numstat` 的耗时与内存表现：`UNVERIFIED-SPIKE`，实施时先测目标扫描根实际规模，超时上限依结果设定。

### 风险与回退

- 风险：扫描根覆盖大量仓库导致耗时长、阻塞主进程。回退：扫描 `await` 让出事件循环（对齐 t256 形态）；必要时后续 task 下沉 utilityProcess。
- 风险：新增第 5 个 route 需同步 preload 分权矩阵、`WINDOW_CONFIGS`、`PANEL_TITLES`、`use-route.VALID_ROUTES`、web bridge 五处，漏一处白屏。回退：以单测枚举全部 route 断言不缺失。
- 回退：纯新增能力，出问题整体回退该 commit，不影响既有四面板。

### 依赖与约束

- 依赖：无前置 task（t482 依赖本 task 的面板骨架）。
- 平台：扫描与窗口能力为桌面端（Electron）；web 端仅渲染。
- 默认配置：`devPanel.scanRoots` 默认 `["~/kar/code"]`（展开为当前用户主目录）；`devPanel.commitCutoff` 默认 `2026-03-20`；`devPanel.currentUserOnly` 默认 `true`（作者匹配 `git config --global user.name` / `user.email`，与旧脚本一致）。
- 安全：扫描为只读 git 命令，不写被扫描仓库；扫描根来自本地配置，不接受网络输入。
- 界面规范：以 `DESIGN.md` 为唯一设计真相源，只消费其 token 与 `src/renderer/components/ui/` 组件；本 task 不改 `DESIGN.md` 数值，需要新形态时先走设计变更再实现（对齐 AGENTS.md 门禁）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：§2 目录结构新增 `src/main/core/dev-panel/`，§5 跨模块契约新增 dev 面板 IPC 通道组与 `devPanel` 配置。
- `docs/blueprint/domain.md`：新增「开发面板」术语与 git 活动扫描不变量。
- `docs/specs_index.md` + `docs/specs/dev-panel.md`：新增 dev 面板 spec。
