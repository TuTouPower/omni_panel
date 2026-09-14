# Task spec

## 背景

`project_manager`（Streamlit）与 `my_life`（Python commit 统计脚本）两个仓已废弃，其能力今后并入 omni_panel。本 task 建立第 5 个面板「开发面板」的骨架（窗口 / 导航 / 托盘入口 / 路由 / 配置落点），并迁移其中「Commit 历史」能力：用 React + echarts 原生重写 commit 活动热力图，扫描根可配置，不依赖 Python / matplotlib / 外部静态 HTML。

用户裁定（2026-09-14，与 t473 一致）：Web 与桌面同权限，**Web 端可完整操作**（配置、扫描、查询），不得只读；宿主能力由宿主执行（git 扫描在宿主主进程/utility），Web 经 HTTP/bridge 发起，两端新鲜度一致。仅查仓内已有记录，不访问外部迁移仓。

本仓核实（2026-09-14）：第 5 个 route 需同步 `use-route.ts:6` 的 `VALID_ROUTES`、`PanelTitleBar` 的 `panels`/`panel_routes`、`panel-navigation.ts` 的 `PanelName`、`window-manager.ts` 的 `WINDOW_CONFIGS`/`PANEL_TITLES`、web bridge 五处。

## 契约区

### 范围

- 新增第 5 个面板 route `dev`（桌面端独立窗口；web 端可经 hash 路由 `#dev` 渲染）。
- 桌面端：`WINDOW_CONFIGS.dev` 条目 + 单例窗口控制器 + 托盘菜单「开发面板」入口。
- 面板间导航：`PanelName` 增加 `Dev`，`PanelTitleBar` 增加第 5 个互跳按钮（桌面 Button / web `<a href="#dev">`）。
- 面板配置命名空间 `AppConfiguration.devPanel`（扫描根、cutoff、是否仅当前 git 全局用户），走 config-store 持久化；schema 在 `appConfigurationSchema` 中显式声明（防 zod strip 静默丢弃，对照 t379 教训）。
- **Web 完整操作**：Web 端 dev 面板可配置扫描根/cutoff/作者过滤，可发起扫描，可查询进度/结果/错误；宿主（宿主机上的 git 扫描服务）执行实际扫描，两端读到同一新鲜度（同一 `scanned_at` / 数据版本）。补实际 HTTP/bridge/宿主通路，不能只有 mock 展示。
- commit 历史：宿主执行只读 `git log`，解析并聚合（日粒度计数 + 仓库维度），renderer 以既有 echarts 能力渲染热力图（GitHub 风格），沿用 DESIGN.md 设计 token。
- 扫描状态与新鲜度标注：显示扫描根、最近扫描时间、命中 commit 总数、扫描失败信息；两端一致。
- **git 数据契约**（明确目标，基于当前仓内记录/证据；无外部迁移仓访问）：
    - 作者/时间字段：以 `git log` 的 `%an/%ae`（author）与 `%cn/%ce`（committer）双字段呈现；统计默认按 author 计次数，committer 作为展示字段；日期以 commit author date 的时区归一（与 `git log --date=iso-strict` 一致），跨时区写入同一日期桶。
    - worktree / 重复根去重：扫描根可能互相包含或为 worktree（`.git` 为文件）；按仓库真实 git dir（`git rev-parse --git-common-dir`）去重，同一仓库只计一次，worktree 不重复计同一 commit。
    - 全局 git 身份缺失策略：`currentUserOnly=true` 且 `git config --global user.name`/`user.email` 为空时，不静默统计零条；返回可读提示并降级为「显示全部作者」或明确报错（实施期在 spec 上下文记录所选策略，两者均须两端一致）。
    - 时区：以本机时区为准，cutoff 与日桶均按本机时区；跨时区只影响边界 1 天，须在 UI 标注时区。
- 扫描并发/部分失败/资源边界：扫描为只读、可取消；一个扫描根失败不影响其他根（逐根报错并继续）；大仓库设超时上限（见未知契约 spike）；并发重复发起扫描须串行或合并（不重复跑）。

### 非范围

- 不做模型路由（见 t482）。
- 不迁移 `project_manager` 的端口 Dashboard、脚本操作区、端口自启。
- 不迁移 `my_life` 的 PNG 图表 / `report.md` / `heatmap.html` 静态产物。
- 不在本 task 内删除或归档 `project_manager` / `my_life` 仓。
- 不做面板内多配色 / 多 layout 切换。
- 不改既有四面板能力。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：桌面端能从托盘菜单打开「开发面板」独立窗口；重复点击聚焦已开窗口而非新开。
- [ ] AC-002：开发面板标题栏显示 `Omni Panel - Dev`，并含 Usage/Agent/Session/Settings/Dev 五个面板互跳入口；点击任一入口切换到对应面板窗口。
- [ ] AC-003：web 端访问 `#dev` 可渲染开发面板内容，并可**配置扫描根/cutoff/作者过滤、发起扫描、查询进度与结果**（与桌面同权限，非只读）。
- [ ] AC-004：面板顶部可按配置的扫描根执行一次扫描；完成后显示「命中 commit 总数 + 最近扫描时间」；扫描进行中显示加载态，扫描失败显示可读错误而非崩溃。
- [ ] AC-005：以配置的 cutoff 日期与「仅当前 git 全局用户 / 全部作者」开关过滤 commit；关闭「仅当前用户」时统计包含其他作者。
- [ ] AC-006：渲染热力图，单元格按当日 commit 数分档着色；悬停显示日期、当日 commit 数及仓库维度明细。
- [ ] AC-007：扫描根、cutoff、作者过滤三项可在开发面板内修改并持久化（桌面与 web 均可），重启应用后仍生效。
- [ ] AC-008：开发面板全部可见元素使用 DESIGN.md 定义的设计 token 与统一 ui 组件库（`src/renderer/components/ui/`），不出现散落字面量色值或自造组件样式。
- [ ] AC-009：扫描不修改任何被扫描仓库；扫描根不存在或不可读时跳过并报可读信息，不影响其他扫描根。
- [ ] AC-010：web 端发起的扫描由宿主执行，web 与桌面读到的同一数据新鲜度一致（同一 `scanned_at`/数据版本），web 不自行伪造扫描结果。
- [ ] AC-011：作者过滤按 author 字段（`%an/%ae`）生效，committer 仅作展示；全局 git 身份缺失时按所选策略（明确报错或降级显示全部）两端一致，不静默返回零条。
- [ ] AC-012：worktree 与相互包含的扫描根按真实 git dir 去重，同一 commit 不重复计数。
- [ ] AC-013：一个扫描根失败不阻断其他根（逐根错误可见）；并发重复发起扫描被串行/合并，不重复跑同一批。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001 / AC-002 的桌面托盘真实弹出与窗口行为属 `[deploy]` 人工签收项，自动化只覆盖「菜单项存在 + 调用 open 路径」。
- AC-011 的真实 GUI 启动下 git 可执行文件定位需真实 GUI 验证（shell 成功不代表 GUI 成功），标 `[deploy]`；逻辑层 git 身份与去重以真实临时 repo 覆盖。
- 其余 AC 可自动测试（窗口/托盘/导航单测 + 真实临时 git 仓库集成 + renderer 测试 + web e2e）。

## 上下文区

- 来源（核实日期 2026-09-14）：`project_manager` 仓 `app/port_dashboard.py`（第 5 面板骨架参考：CSS / 表格 / expander 风格）、`app/commit_history.py`（热力图嵌入 + 刷新触发 + 锁）；`my_life` 仓 `commit_stats/generate_commit_stats.py`（`scan_roots`、cutoff `2026-03-20`、`discover_repos`、作者过滤、`build_daily_summary` / `build_repo_summary`、`render_heatmap_html` 数据结构）。**注：以上外部迁移仓内容为历史记录引用，本 task 不访问外部仓，仅以仓内已有记录作为设计参考；迁移期存在漂移，本 task 以「可配置」取代硬编码并给默认值。**
- 迁移期漂移：`commit_history.py` 文案写扫描 `~/testuser_ubuntu ~/archive /mnt/d/Kar/Code`，而脚本内 `scan_roots` 为 `/home/testuser/testuser_ubuntu`、`/home/testuser/archive`、`/mnt/d/Kar/Code/omni_pot`、`/mnt/d/Kar/Code/omni_usage`；两仓均废弃，本 task 以「可配置」取代硬编码。
- 全局 git 身份缺失策略：本 task 定为「返回可读提示并按当前用户过滤降级为显示全部作者（在结果中标明降级）」；该策略为明确目标契约，写入最终 spec，不需再问用户。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实大仓库（数十万 commit）的绝对耗时/内存：以 spike 测目标规模并给超时上限（见未知契约），不在单测断言绝对性能。
- macOS 真实托盘弹出与真实 GUI git 定位：`[deploy]` 人工签收。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 主进程 git 扫描：单元 / 集成测试在 `os.tmpdir()` 下用真实 `git init` + 多次 commit 构造 fixture 仓库（真实 git，不用 mock），断言扫描结果、作者过滤（author vs committer）、cutoff 过滤、worktree/重复根去重、缺失根跳过。
- 配置持久化：复用 config-store 既有测试形态（真实读写 + zod 校验）。
- 窗口与路由：沿用 `agent-window-controller` / `window-manager` 既有单测形态（fake window 注入）；`panel-navigation` 与 `PanelTitleBar` 以 renderer 单测覆盖。
- 热力图：断言数据 → option 的纯函数映射，不依赖真实 canvas 渲染。
- e2e：web 端 `#dev` 渲染 + web 配置/扫描发起 + 真实 HTTP 通路（宿主扫描以临时 git 仓库）。
- 宿主 git 定位：以 `execFile("git", ["--version"])` 的真实调用断言宿主侧可用（GUI 场景标 deploy）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 交互式登录 shell 的 PATH（`/opt/homebrew/bin` 等）在 GUI 启动的 Electron 主进程可能不完整，`git` 可执行文件定位方式：`UNVERIFIED-SPIKE`，实施时用 `execFile("git", ["--version"])` 在真实 GUI 下验证，shell 成功不代表 GUI 成功；结论回填后删除标记。
- 大仓库（数十万 commit）下 `git log --numstat` 的耗时与内存表现：`UNVERIFIED-SPIKE`，实施时先测目标扫描根实际规模，超时上限依结果设定；结论回填后删除标记。

### 风险与回退

- 风险：扫描根覆盖大量仓库导致耗时长、阻塞主进程。回退：扫描 `await` 让出事件循环（对齐 t256 形态）；必要时后续 task 下沉 utilityProcess。
- 风险：新增第 5 个 route 需同步 preload 分权矩阵、`WINDOW_CONFIGS`、`PANEL_TITLES`、`use-route.VALID_ROUTES`、web bridge 五处，漏一处白屏。回退：以单测枚举全部 route 断言不缺失。
- 风险：web 发起扫描的宿主通路若仅 mock 展示会假装可用。回退：必须补真实 HTTP/bridge/宿主通路后方可收尾；未接通则本轮标未满足，不伪 PASS。
- 回退：纯新增能力，出问题整体回退该 commit，不影响既有四面板。

### 依赖与约束

- 依赖：无前置 task（t482 依赖本 task 的面板骨架）。
- 平台：扫描与窗口能力宿主侧执行（Electron 主进程/utility）；web 端经 HTTP/bridge 发起，权限与桌面一致。
- 默认配置：`devPanel.scanRoots` 默认 `["~/kar/code"]`（展开为当前用户主目录）；`devPanel.commitCutoff` 默认 `2026-03-20`；`devPanel.currentUserOnly` 默认 `true`（作者匹配 author field，与旧脚本一致）。
- 安全：扫描为只读 git 命令，不写被扫描仓库；扫描根来自本地配置，不接受网络输入；无新增认证（t473 基线）。
- 界面规范：以 `DESIGN.md` 为唯一设计真相源，只消费其 token 与 `src/renderer/components/ui/` 组件；本 task 不改 `DESIGN.md` 数值。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：§2 目录结构新增 `src/main/core/dev-panel/`，§5 跨模块契约新增 dev 面板 IPC/HTTP 通道组与 `devPanel` 配置。
- `docs/blueprint/domain.md`：新增「开发面板」术语与 git 活动扫描不变量（author/committer、时区、worktree 去重）。
- `docs/blueprint/decisions.md`：全局 git 身份缺失策略与 web 同权限操作决策。
- `docs/specs_index.md` + `docs/specs/dev-panel.md`：新增 dev 面板 spec。
