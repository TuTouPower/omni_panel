# 决策记录（ADR）

只记录已经确认、影响后续工作的非显然决策。追加新条目，不重写历史；决策被替代时，新条目通过“替代”字段引用旧编号。

条目格式：

```markdown
## NNN 标题（YYYY-MM-DD）

- 背景：为什么需要决策
- 选项：考虑过什么
- 结论：选了什么，为什么
- 替代：旧决策编号；无则写“无”
```

## 001 从 omni_powers 迁移到 repo_template 工作流（2026-07-20）

- 背景：OmniPanel 原用 omni_powers 三区工作流（`op_blueprint`/`op_execution`/`op_record`）+ 全局 skill（`/opintake` 等），与用户维护的 `repo_template` 通用仓库模板不兼容。
- 选项：A) 保留 omni_powers；B) 全量迁移到 repo_template 纯文档工作流（`AGENTS.md` + `blueprint/tasks/specs/reviews/spikes/archive`）。
- 结论：选 B。废弃 omni_powers 三区（整体归档至 `docs/archive/omni_powers_sunset/`），引入 `AGENTS.md` + `blueprint/tasks/specs/reviews/spikes/archive` 结构。task ID 从 T001 起编。本次元重构本身不挂 TNNN，由本 ADR 追溯。
- 替代：无

路径映射（供 `git log -S` 与旧路径追溯）：

- `op_blueprint/architecture.md` `domain.md` → `docs/blueprint/`
- `op_blueprint/conventions.md` → `docs/blueprint/conventions.md`（合并 template 元约定 + 项目编码约定）
- `op_blueprint/specs/*.md` → `docs/specs/`
- `op_blueprint/spec_index.md`（功能目录，2 列）→ 内容并入 `docs/specs_index.md`（状态台账，5 列）；按域分类见 `docs/blueprint/architecture.md` §4 数据流
- `op_blueprint/prd.md` → 一句话定位 + 介绍拆入 `README.md` / `AGENTS.md`；明确不做拆入 `docs/blueprint/domain.md`；原件归档
- `op_blueprint/test.md` → `{test_cmd}` / `{blackbox_cmd}` 填入 `AGENTS.md` 硬约束；测试规范并入 `docs/blueprint/conventions.md` “编码与测试”小节；详细命令清单入 `docs/guides/testing.md`；原件归档
- `op_record/decisions.md`（空）→ `docs/blueprint/decisions.md`（本文件）
- `op_record/progress.md`（空）→ `docs/handoff.md`
- `op_execution/*` + `docs/tasks/T1-T8_*` → `docs/archive/`（T1-T8 入 `archive/tasks/`）
- `docs/research/` `docs/design/` → `docs/archive/research/` `docs/archive/design/`
- T1-T8 历史提交 SHA：`5efb68a`、`30d078b`（原编号 T1..T8；`git log --grep` 仍可用原编号）

## 002 横屏响应式选 CSS 容器查询而非 @media（2026-07-20）

- 背景：T004 让 usage 窗在 472–1400px 宽度范围自适应（窄 popup / 横屏管理台 / web 浏览器）。需选响应式机制。
- 选项：A) `@media`（按窗口宽度）；B) CSS 容器查询（`container-type: inline-size` + `@container`，按容器宽度）。
- 结论：选 B。容器查询按容器宽度响应，Electron 窗口拖宽、浏览器 web 版、未来内嵌模拟框共用一套布局逻辑；`@media` 无法区分容器 vs 窗口。断点 1024/640 沿用 demo 阈值。Electron 42（Chromium 105+）满足 container queries 支持。
- 替代：无

## 003 不新增 Electron 横屏主窗，放开 usage 窗 maxWidth 承担横屏（2026-07-20）

- 背景：demo 设想新增 1440×900 Electron 横屏主窗。本项目 web 构建版（`vite.web.config.ts` → `out/web/`）已承担浏览器横屏载体。
- 选项：A) 新增 Electron 横屏主窗（demo 原版）；B) 放开 usage 窗 `maxWidth`（780→1400）+ 容器查询，同一份渲染层覆盖桌面横屏。
- 结论：选 B。再开 Electron 横屏窗与 web 版职能重叠；放开 `maxWidth` + 容器查询改动最小，web 版自动复用同一套 `@container` 断点。`maxWidth` 定 1400（不取消——避免 4K 屏拉到极宽 auto-fill 成 10+ 列 UX 恶化）。
- 替代：无

## 004 横屏多列拖拽补 clientX hit-testing（D2=B，2026-07-20）

- 背景：现有 `compute_drag_reorder` 仅 `clientY` 垂直 midpoint guard（单列假设）。横屏多列同行水平拖拽时垂直 guard 阻止 commit，视觉与语义不一致。
- 选项：A) 多列下禁用拖拽；B) 补 `clientX` 多列 hit-testing；C) 多列按单列 DOM 语义不标注。
- 结论：选 B。`compute_drag_reorder` 加 `axis: "x" | "y"` 参数（默认 "y" 向后兼容）；caller（`PopupView.handle_drag_over`）按 `drag_rect.top` vs `over_rect.top` 判定 same_row 选轴。`drag_rect` 在 `onDragStart` 捕获、`onDragEnd` 清理。已知遗留：reorder 后 `drag_rect` state 过时，多步拖拽退化垂直 guard（见 T004 task_report）。
- 替代：无

## 005 账号展开区 sparkline 出图，解除「第一版不出图」边界（2026-07-20）

- 背景：`domain.md §6` 原「不做趋势图 UI（SQLite 留了历史数据，但第一版不出图）」是第一版产品边界。T006 计划在账号展开区引入近 7 天 sparkline 迷你走势，打破该边界。
- 选项：A) 新开 T007 先解除边界 + 记录决策，T006 实施；B) T006 单 task 内同时改 domain + 实施；C) 放弃 sparkline。
- 结论：选 A（审阅 adoption D1=A 决策）。`domain.md §6` 改写为「完整多维趋势仍归 TokenStats 独立窗口；账号展开区出 sparkline」。符合「长期真相延后」「单 task 单 commit」硬约束。T006 实施时引用本条。
- 替代：无（原边界追溯：`domain.md §6` 第一版 commit）

## 008 web e2e 不进 CI + webServer 顶层保留（2026-07-21）

- 背景：T010 web e2e 需本机录制 fixture（`tests/e2e/fixtures/data/` gitignore，含真实账号），CI 干净环境无 responses.json 跑不了。`playwright.config.ts` `webServer` 顶层配置致 electron/packaged project 跑时也启 vite preview（浪费，5174 空闲时不阻塞）。
- 选项：CI web e2e A) synthetic seed fixture 入库供 CI smoke；B) 跳过 web project（CI 只 vitest + packaged smoke）。webServer A) 拆 web 独立 playwright config；B) 保留顶层。
- 结论：CI 选 B（web e2e 作本地开发反馈，不作 CI 门禁；CI 由 vitest 单元/集成 + packaged smoke 覆盖产物可用性；Electron 驱动 nightly 跑）。webServer 选 B（Playwright 无 project 级 webServer，拆独立 config 增维护成本 > 节省的 vite preview 启动开销）。
- 替代：无
- 落地（T015, 2026-07-21）：CI web e2e 通道已恢复——`scripts/e2e/gen_synthetic.mjs` 从真实 responses 脱敏取 3 instance 子集 → `tests/e2e/fixtures/synthetic.json` 入库；CI `MOCK_FIXTURE=synthetic pnpm test:e2e:web` 跑 web smoke。CI 选项 B 的"不作门禁"被 synthetic fixture 取代（CI 现跑 synthetic web smoke）；webServer 保留顶层。
- 遗留：无（CI web 通道已恢复；real fixture 仍仅本地）。

## 006 dev CSP 放开 'unsafe-inline' 让 @vitejs/plugin-react preamble 能注入（2026-07-20）

- 背景：`pnpm start`（electron-vite dev）启动后 renderer 全黑。带 `ELECTRON_ENABLE_LOGGING=true` 抓 console 看到 `@vitejs/plugin-react can't detect preamble`——plugin-react 注入的 React Refresh preamble 是 inline `<script type="module">`，被 dev CSP `script-src 'self' http://localhost:5173 'unsafe-eval'`（无 `'unsafe-inline'`）拦截，所有 `.tsx` 模块加载失败。打包版（prod CSP `'self'`、无 React Refresh）不受影响。
- 选项：A) dev CSP `script-src` 加 `'unsafe-inline'`；B) 给 preamble 用 nonce/hash；C) 关闭 React Refresh（`@vitejs/plugin-react` 设 `fastRefresh:false`）。
- 结论：选 A。dev 本地无攻击面，`'unsafe-inline'` 可接受；nonce/hash 需改 plugin-react 注入方式，成本高；关 fastRefresh 丢失 HMR 体验。prod CSP 严格不变（仍 `'self'`）。CSP 构造抽到 `src/main/security/csp.ts` 纯函数 + 单测覆盖 dev/prod 两路防回退。
- 替代：无

## 007 web e2e 用 mock local-api 回放录的真实响应，不开桌面 app（2026-07-21）

- 背景：T009 改名后 e2e 仍靠 Electron 驱动（开桌面 app），平台绑定、慢、CI 重。用户要求日常 e2e 跑浏览器测网站。web SPA（`out/web`）数据全来自 local-api（端口 18263），后端必须有。
- 选项：A) Electron 后端（浏览器前端 + 真实 Electron 提供 local-api，仍开桌面 app）；B) mock local-api（录本机真实响应，Playwright chromium 纯浏览器驱动）；C) 读 config/snapshot 文件合成 mock（零 Electron 但合成逻辑要复刻 local-api）。
- 结论：选 B。A 仍开桌面 app 违背初衷；C 合成逻辑易漏字段。B 录真实响应 100% 保真，mock 回放零 Electron、跨平台、CI 友好（fixture gitignore，CI 策略另定）。
- 子决策：
    - **mock 形态**：vite preview plugin middleware（`mock_api_plugin`）内嵌回放，单 server；非 preview.proxy 双进程（省进程 + 端口管理简）。
    - **脱敏**：黑名单正则 `secret|password|token|cookie|key|bearer|credential` 递归替换字符串字段为 `***`，实测覆盖本仓库全部 secret 字段名；非白名单（白名单需逐字段列举，新增字段易漏，黑名单 + `key` 兜底更稳）。
    - **fixture 存放**：`tests/e2e/fixtures/data/` gitignore（含本机真实账号邮箱，不入库）；`pnpm e2e:gen-data` 手动录制（需 app 跑着提供 local-api）。
- 替代：无（A/C 否决理由见上）
- 遗留：CI fixture 策略（T013）、webServer 顶层污染（T013）、trend query 覆盖（T011）。

## 009 墓碑仅抑制自动 seed，不抑制用户主动添加（2026-07-26）

- 背景：t038 引入 `removedConnectorIds` 墓碑防止删除账号后重启 auto-seed 复活。但添加账号对话框原先从 `connector:list`（只遍历 `config.plugins`）解析 auth，墓碑内 vendor 不在 `config.plugins` → 找不到 → 回落通用 apikey 表单，用户无法重新添加 grok/exa/opencode_go/cpa（删除全部实例后）。
- 选项：A) 去掉墓碑机制（回退 t038，删除后重启复活）；B) auto-seed 时忽略墓碑（同 A 效果）；C) 保留墓碑仅抑制自动 seed，添加流程另走 manifest catalog 通道（与 `config.plugins` 解耦）。
- 结论：选 C。墓碑的目的是"删除后不自动复活"，不应波及"用户主动添加"。新增 `connector:catalog` IPC 从 manifest 出目录（不读 config/墓碑），`AddAccountDialog` 优先按 catalog 解析 auth；`config:createInstance` 按 manifest_id 建实例时清对应墓碑 id。A/B 破坏 t038 的删除语义。
- 替代：无
- 遗留：无。

## 010 overview-grid 减列保信息，替代 320px 下限与强制两列（2026-07-29）

- 背景：t161 修「竖屏 4 列下展开的多账号卡片箭头溢出」时，最初把下限从 320px 提到 420px；后因 f2c1c705 的 `display: none` 隐藏 `.rel-time` 在 3~4 列布局中误伤大量卡片，被用户否决。用户明确要求"信息不丢，放不下就减少列数"。
- 选项：A) 保留 320px 下限 + 640–1023 强制两列 + 在窄卡处隐藏部分头部信息；B) 用单一 `auto-fill` 规则并提高下限，让容器不足时自动减列，头部信息完整保留。
- 结论：选 B。`.overview-grid` 改为 `repeat(auto-fill, minmax(420px, 1fr))`，删除 `@container (min-width: 1024px)` 与 `@container (max-width: 1023px) and (min-width: 640px)` 断点及 640–1023 强制两列；删除 `.rel-time { display: none }` 隐藏规则。`420px` 覆盖最宽头部形态（长名称 + l2seg + rel-time + tools）+ padding；更极端情况由 `.card-name` 省略号兜底。
- 替代：002（仍保留容器查询机制本身，但断点数值与断点数量被本条取代；003 的 maxWidth=1400 不变）。
- 落地：t161。

## 011 TokenStats dashboard 聚合层：session-hour 粒度 + 会话级重建 + 后台回填（2026-08-03）

- 背景：t192 之前 dashboard query 的 hour/heatmap/范围 rollup 每次切换都全表扫描 `token_stats_records`，历史数据增长后查询时聚合成本持续上升（t190 已把结果跨进程传输消除，读取规模未解耦）。需建立可由原始数据重建的增量聚合层与 data version。
- 选项：聚合粒度 A) 复用 day/session 表；B) hour 聚合（不含 session）；C) per-session-hour 聚合。回填策略 a) 启动同步全量；b) 后台回填 + 旧路径 fallback。
- 结论：粒度选 C（per source/env/session_id/本地整点小时/model/directory/agent）——唯一能精确重建 dashboard 全维度（含 distinct session 计数、hour 粒度、project 维度）的最小粒度；A 缺 hour 粒度、B 缺 session 维度致 sessions 计数跨小时重复。s008 实测：C 行数随 session×hour×model 组合增长，message 密度扩大 100 倍行数不变。回填选 b：同步全量阻塞启动；后台回填 + records fallback 保证回填完成前 dashboard 可用，中断可重跑幂等收敛。
- 关键子决策：
    - **会话级重建而非行级 UPSERT**：`directory` 可空，SQLite 视 NULL 唯一键互异，行级 ON CONFLICT 永不命中会叠重复行；upsert 批次对每个被触碰 session DELETE + 从 records 全量重建。
    - **records 为真相源**：聚合表可随时 DELETE + 重建，不回滚用户原始记录；聚合损坏/版本不兼容时重跑 backfill 恢复。
    - **data version 只随 records 批次推进**：records 是 dashboard 数据源，sessions/daily 不推进；空批次不推进；失败事务回滚不推进。版本不依赖 renderer 本地时间。
- 替代：无
- 落地：t192（migration v6 + `token_stats_hour_rollup` + `query_dashboard` 窗口拆分读取）。
- 遗留：`query_dashboard` 聚合/records 双轨重复（p031）；AC2 多 session 未受影响行、AC3 失败回滚、AC4 竞态、AC5 查询计划、AC1 重启就绪等子句级补测（p032-p037）。

## 013 会话历史消息区采用手动动态高度虚拟列表（2026-08-06）

- 背景：SessionPane 消息区原全量 DOM 渲染，已加载消息数无界增长；单条消息含 react-markdown 解析，重渲染成本随消息数线性上升，多面板/长会话场景卡顿明显。
- 选项：A) 引入第三方虚拟列表库（如 react-window、react-virtualized）；B) 自研轻量动态高度虚拟列表。
- 结论：选 B。消息高度由 markdown 内容决定，定高假设不成立；自研方案用 ResizeObserver 测量已渲染行高、未测量行用估计高度 80px，索引计算抽成纯函数便于单测；prepend 时以旧首条消息为锚点做滚动补偿，测量完成后再校正估计误差；保留现有分页协议与加载 older 语义不变。
- 替代：无
- 落地：t237（`VirtualMessageList` + `compute_message_offsets` / `compute_visible_window` + `PaneMessageRow` / `MarkdownMessage` / `SessionCard` / `SessionRow` memo 化）。

## 012 TokenStats dashboard 查询隔离到 utilityProcess query worker（2026-08-03）

- 背景：t192 把 dashboard 读取切到聚合层，但 `query_dashboard` 仍是主进程内 better-sqlite3 同步聚合，窗口大时 IPC/本地请求排队（t189 基线）。要把重读迁出主进程事件循环，须选隔离执行端并确认只读并发语义。
- 选项：执行端 A) worker_threads；B) utilityProcess。只读访问形态 a) 复用主进程 store（同连接）；b) worker 独立 readonly 连接。
- 结论：执行端选 B，只读选 b。worker_threads 同进程线程，native 崩溃带崩整个 Electron，不满足「执行端异常退出不崩主进程」；utilityProcess 独立 OS 进程、异常退出不影响主进程且支持受控重启，打包路径有 collector 先例（manager.ts `resolve_collector_path` 处理 asar unpacked）。只读选 b 的 WAL 并发语义由 s009 实测背书：readonly 连接读已提交数据、写提交后新只读连接立即可见、写事务未提交时读旧快照不阻塞、close/reopen 无锁残留、`readonly:true` 拒绝写入。
- 关键子决策：
    - **并发上限 1 active + 1 queued**：超出即 superseded 受控拒绝，快速连续切换不无限排队；单请求 10s 超时。
    - **崩溃受控重启**：exit 后 restart_delay 重启；间隙内新请求即时 spawn，restart timer 以 `!child` 判空不双 fork（t193 code f001 修复）。
    - **优雅关闭**：`stop()` 先 `postMessage({type:"close"})` 让 worker 释放只读连接再 `kill()`。
    - **权限边界**：worker 只接收 `db_path` + 已校验 query + status 快照，不获得 vault/connector secret 或任意文件访问（AC7）。
- 替代：worker_threads（否决理由见上）；readonly 复用主进程连接（同进程，失去隔离意义）。
- 落地：t193（query-worker.js + query-dispatcher + store readonly 支持 + IPC/local-api 路由 + packaged smoke AC6）。
- 遗留：无。

## 014 DESIGN.md 为设计真相源 + Tailwind v4 CSS-first token 层（2026-08-09）

- 背景：全窗口统一设计语言，仓库根 DESIGN.md 定稿（Google design.md 格式）。此前三套色板/字体栈并存、手写 BEM 数千行。t268 建立 token 基础设施供后续窗口迁移（t270-273）。
- 选项：token 同步 A) 手工维护 CSS 变量；B) `designmd export --format css-tailwind` 脚本生成 + drift check。
- 结论：选 B。导出是唯一同步方式（脚本执行 + drift check 测试门禁，手工改动导出区即失败），禁止手工改写导出区。Tailwind v4 CSS-first：`@theme` 块承载全部 token，组件用工具类（`bg-surface` 等）消费。
- 关键子决策：
    - **明暗翻转**：`@custom-variant dark`（data-theme/.dark + 后代匹配）→ 语义变量 dark 下覆盖 -dark 值，组件无需写 `dark:` 变体。
    - **accent 单变量派生**：`--accent` 单一变量，五档预设（blue/purple/teal/orange/red）+ 自定义 hex；strong/container/ring 经 `color-mix()` 派生；预设 hex→accent key、自定义→base、非法/缺失→blue。切换写同一组变量即时生效，重启从 config.accentColor 恢复（theme.ts apply_accent）。
    - **兼容桥**：现存三套强调色入口（--blue/--primary/--ring 等）→ 统一 accent 变量，未迁移窗口随全局 accent 联动；桥接代码集中一处，删除归 t272/t273。
    - **字体**：自带 Inter Variable + JetBrains Mono（woff2 + @font-face），CJK 回退系统栈。
- 替代：手工 CSS 变量（无 drift 门禁，易失同步）；全量迁移窗口后再建 token（迁移无 token 可取）。
- 落地：t268（designmd.ts + globals.css token 层 + theme.ts accent + 兼容桥 + 字体 + drift 门禁）。
- 遗留：无。

## 015 自定义字号类一律用 `text-[length:var(--text-*)]` 显式形式（2026-08-11）

- 背景：tailwind-merge 的 `text-*` 冲突组同时承载 font-size 与 text-color 两个子组；对不在内置 scale 中的自定义字号 token（`text-body-md` 等，来自 `--text-*` 主题变量），twMerge 会归入 text-color 子组，与同组 `text-[var(--color-*)]` 颜色任意值冲突合并、后者被丢弃（d032）。t283 实测复现（对比度从 3.13 跌至 2.65），t298 修 Button。
- 选项：A) 自定义字号继续用裸类名（遇 cn() 组合才冲突）；B) 一律显式 `text-[length:var(--text-*)]`。
- 结论：选 B。显式 `length` 明确归入 font-size 子组，不与颜色冲突，且未来任何组件并入 cn() 都不踩坑。纯 className 字面量虽不经 twMerge 无冲突，但统一形式防退化。
- 落地：t298（Button）+ t302（全仓 ui/会话侧组件 59 文件统一）。
- 遗留：`text-label-sm` 无 `--text-label-sm` token，Tailwind 不生成字号类（存量失效），登记 p127。

## 016 平台感知路径层：env 分离 local|wsl、host×env 纯函数（2026-08-11）

- 背景：collector 路径构建硬编码 Windows 宿主假设：`TokenStatsEnv` 只有 `win|wsl`，`win_home: homedir()` 在 Linux/WSL 返回 POSIX home 后与反斜杠字面量拼接出坏路径，wsl 源 UNC 在 Linux 内不可达，`wsl_user` 探测失败静默返回空（p132：Linux/macOS/WSL 宿主全源采集 0 且无可见告警）。路径构建散落在 collector/reader 各 builder 中，无统一平台层。
- 选项：A) 继续枚举 `win|wsl`，各 builder 内加 `process.platform` 判断；B) env 重构为 `local|wsl`（`local` = 本机宿主，`win` 语义并入），路径解析抽成 `(host, env, cfg) -> path|null` 纯函数（新 `paths.ts`）。
- 结论：选 B。env 语义从「OS 猜测」变为「数据所在环境」，`local` 源对任意宿主返回本机路径（`homedir()` 只服务 local），`wsl` 源仅 `host === "windows"` 且 `wsl_user` 非空才构造 UNC（否则 `null` 跳过该源）。host 由 `process.platform` 映射（win32→windows / darwin→macos / 其余→linux，d033 spike 验证）。DB 迁移 v7 把历史 `env='win'` 行改写为 `env='local'`（幂等 UPDATE）。平台假设从业务代码消失，t309/t310 复用路径层。
- 替代：无

## 017 平台感知路径层在 session-history 的应用（2026-08-11）

- 背景：ADR 016（t308）建了 token-stats 平台感知路径层（host×env 纯函数）。session-history 系统（session-locator/subscription-service/session-path-index）与 collector 同源路径 bug：`win_home: homedir()` 在 Linux/WSL 返回 POSIX home 后与 `\` 字面量/UNC 拼接失效，Windows 宿主行为与 t308 前一致。
- 选项：A) locator 保留自己的 win/wsl 分支继续手拼路径；B) locator 改走 t308 路径层，`LocatorPaths` 增必填 host/homedir 由调用方注入。
- 结论：选 B。locator 复用 t308 路径层 builder（新增 `locator_source_path` 纯映射），env 对齐 `local|wsl`；`locator_paths_key` 签名扩展为 host/homedir/win_home/wsl_distro/wsl_user 五段，`SESSION_INDEX_VERSION` bump 2 整体丢弃旧索引重建（防 win env 死条目膨胀）。WSL 用户名探测仍留在 locator（路径层视其为输入），探测失败（空串）wsl 源返回 null。
- 替代：无

## 018 cacheMaxMb=0 语义 = 不限制（2026-08-15）

- 背景：settings data_section「不限制」选项保存 `cacheMaxMb: 0`，而 config schema 原 `min(1)` 拒绝 0，致「不限制」无法持久化、observation-retention 把 0 视为不限制的分支成死代码，且下次启动 load 校验失败走备份恢复（p158）。
- 结论：`cacheMaxMb: 0` 合法且语义为「不限制」。schema `min(0)`（不放开负数）；retention `retention_params` 对 `cache_max_mb<=0` 返回无行数预算（仅日期阈值），与 `undefined` 等同。
- 落地：t398（config types schema 放宽 + retention 0 分支测试）；retention 空窗口推进见 AC-003（p159）。
- 替代：无

## 019 CLI 帮助单一真相源在 scripts/cli_help.mjs（2026-08-16）

- 背景：launcher（`scripts/omni_panel.mjs`）与主进程（`src/main`）各内联一份 CLI 帮助，四入口（无参/`--help`/`help`/`--cli help`）输出不一致（漏 `--gui` 等）。
- 选项：A) 源放 `scripts/cli_help.mjs`，主进程 import 靠 electron-vite 构建期内联；B) 源放 `src/`，launcher 构建期复制/软链；C) 两处内联 + 单测锁一致性。
- 结论：选 A（s029/d038 验证：主进程 import 外部 `.mjs` 会被 rollup/esbuild 内联进 `out/main`，打包 `files` 仅 `out/**` 时运行时不依赖 `scripts/`）。launcher 运行时 import 同文件。`help` 子命令由 launcher 直打帮助，不再注入 `--cli`；`--cli help` 兼容路径仍进主进程但打印同一常量。
- 落地：t400。
- 替代：无

## 020 会话库内容搜索冷缓存：renderer 分块多次 searchContent（2026-08-16）

- 背景：内容搜索冷缓存对全部候选 `extract_full`，4000 会话首次 45s+，UI 仅「搜索中…」无进度；用户中断看到中间态误判结果不全（p186）。
- 选项：A) renderer 分页多次 `searchContent`（`offset`/`limit` + `progress`）；B) 主进程进度事件 + web SSE/NDJSON。
- 结论：选 A（s030/d039）。可选字段省略时行为与旧全量一次调用兼容；本批只 resolve/extract 候选 slice；renderer 默认 limit=64 循环合并 sessions 并展示「已扫描 N/M」。不引入新 IPC channel/SSE。keyword 匹配语义不变；extract_cache 磁盘持久化另议。
- 落地：t404。
- 替代：无

## 021 面板背景两级（window/card），raised 仅交互态（2026-08-16）

- 背景：会话窗口实测卡片用 `surface-raised`（#262b34）比窗口亮两档；侧栏用无 token 依据的 `color-mix(window 70%, surface 8%)`，与 DESIGN Colors 节两级体系偏离，多窗口层次混乱。
- 选项：A) 继续三档（window / 混色侧栏 / raised 卡片）；B) 回归 DESIGN：window/card 两级，raised 只做 hover/选中块/徽章。
- 结论：选 B。窗口/侧栏/主区 = `surface-window`；内容卡片 = `surface-card`；禁止面板级无依据 color-mix 底色；`surface-raised` 保留交互态。token 数值不改。
- 落地：t406；权威规则见 `docs/specs/surface_token_unify.md` 与 DESIGN.md Colors。
- 替代：无

## 022 废除 env local：平台标签 win|wsl|linux|mac（2026-08-23）

- 背景：ADR 016（t308）把 `win` 并入 `local`（= 进程所在 OS 的数据），结果 WSL 宿主上 `local` 只有 Linux home，与用户「win / wsl 两地盘」心智冲突，且 WSL 网页版搜不到 Windows 侧 Kimi（p204）。
- 选项：A) 保留 `local` + 文档澄清；B) 废除 `local`，env 改为平台标签 `win|wsl|linux|mac`（按 agent 数据所在平台标注），存量一次性迁移。
- 结论：选 B。`TokenStatsEnv` 四值化；collector 平台源按宿主派生（key 与平台一致：`*_win`/`*_linux`/`*_mac`，任一宿主只一个平台变体参与采集）；迁移 v8 按 directory 形态分类存量行（盘符形→win、`/Users/`→mac、其余 POSIX→linux、NULL/孤儿→宿主 platform 默认，d048/s032 实测本机库验证），buckets 由 daily 整体重建、hour_rollup 清空走异步回填；ADR 016 的「local = 进程所在 OS」语义废止，016 的路径层纯函数结构保留。破坏性升级不留 local 兼容读写（一次性迁移除外）。连接器 observation `source: "local"` 是另一概念不受影响。
- 落地：t437；为 t438（WSL 宿主采集 Windows agent 为 env=win）铺路。
- 替代：无

## 023 WSL/Linux 宿主零配置自动发现 Windows home 采 win 源（2026-08-23）

- 背景：ADR 022 把 env 改成平台标签后，WSL 宿主上 Windows 侧 agent 数据（p204 场景）需要标 `win` 采集；若要求用户手填 `/mnt/c/Users/<u>` 路径则与「Windows 宿主自动采 wsl」不对称，且用户名不可假设。
- 选项：A) 配置项手填 Windows home；B) 零配置自动发现（`/mnt/c/Users` 枚举 + agent 标记目录识别，回退 `powershell.exe $env:USERPROFILE`）；C) 两端都要显式开关。
- 结论：选 B（s033/d049 本机实测验证发现规则）。显式 `win_home_wsl` 字符串优先，`""` = 禁用哨兵（对齐 `wsl_user` 空串语义）；缺省惰性发现。发现失败不抛——win 源 `unavailable`；失败结果短窗负缓存（collector 按轮、locator 60s）重探自愈，成功结果进程内缓存。多候选取舍与回退经 `on_decision` 留痕。不默认提供 UI 关闭开关（遗留 p206 决策）。
- 落地：t438；路径纯逻辑在 `token-stats/win-home-discovery.ts`（注入式 deps，测试全桩），collector 与 session-locator 各自缓存调用。
- 替代：无

## 024 z-index 只写 `z-[var(--z-*)]` 任意值，禁裸层级类（2026-09-05）

- 背景：Tailwind v4 不由 `--z-*` 生成裸 `z-*` 工具类，`z-menu/z-sticky/z-scrim/z-context/z-modal` 在构建产物中零规则，引用点静默回到 `z-index:auto` 被后续内容盖住（p218 症状C；t415 只查裸数字、未正向验证，曾假绿）。
- 选项：A) 自定义 `@utility z-menu` 等补齐裸类；B) 统一改任意值写法 + 门禁。
- 结论：选 B。五层语义与数值不变（见 DESIGN.md 层级节）；源码一律 `z-[var(--z-*)]`；`tests/unit/renderer/styles/layer_class_gate.test.ts` 正向门禁（字符串字面量扫裸类 + 四位点 pin + token 存在 + 检测器自检）。
- 落地：t452。
- 替代：无

## 025 antigravity 会话进列表但用量记 0＋标未知、代理面板不接（2026-09-11）

- 背景：s035 硬结论——antigravity 本地明文层无 token 计数，会话面板列表又复用 `token_stats_sessions` 做发现，导致 agy 会话不可见（p226）；直接填 0 会造假（t448 前车之鉴）。
- 选项：A) 会话发现进库 + tokens 记 0 + UI 标未知；B) 反推 protobuf usageMetadata 做真用量；C) 独立发现通道不进 sessions 表。
- 结论：选 A。collector `antigravity_index` 只产 sessions（`calls`=索引 `step_count`、tokens 全 0）；会话库卡片/列表/预览/同屏统一显示“未知”；dashboard 全域派生自 records（agy 无 records）故代理面板天然无泄漏，`AgentFilter`/agent 枚举一律不动。B 脆弱另起 spike，C 双源合并成本更高。
- 落地：t470；规格见 `docs/specs/antigravity-session-history-extractor.md`「会话发现进列表」。
- 替代：无

## 026 同功能多入口统一：Web 同权限无认证 + 写入口冲突/失败策略（2026-09-14）

- 背景：d058 审计发现同一业务能力在桌面 IPC / LocalAPI(Web) / CLI 各写一份且已漂移，原计划对敏感接口（`/v1/secrets`、`/v1/config`）加 token 认证、并让 Web 降级只读。用户 2026-09-14 裁定反转部分方向并明确写入口语义。
- 选项：权限 A) Web 敏感接口纳入 token 认证、Web 降只读；B) Web 与桌面完全同权限、均不认证，宿主能力由宿主执行。配置写入 a) 仅 save 串行；b) 排队覆盖「读最新→计算→提交」+ 逐入口冲突策略。模型路由失败 a) 写失败即中止不改动；b) 部分成功 + 分类报告 + 快照 + 不自动回滚。导入 secret a) 一律 replace-all；b) 按 `secrets` 字段三态处理。
- 结论：
    - **权限选 B**：本应用为受信内网自用工具，Web 与桌面同权限、都不需要认证；无认证不等于取消入参校验、进程隔离、日志脱敏与破坏性操作二次确认。t473 由「敏感接口鉴权」改造为「两端同权限、无认证契约对齐」；若新增鉴权将被视为违背本决策。
    - **配置写入选 b**：普通 save 保持 `saveIfBaseMatches`（base 不匹配报 `CONFLICT`）；导入/复制/新建/CLI import 为用户显式整体操作，允许覆盖但必须串行且排队覆盖「读最新→计算→提交」（禁止基于临界区外旧快照覆盖）；auto-seed/prune 基于最新状态增量应用。实现由 config store 的 `run_serialized` 统一承载。单次导入内部 `config↔vault` 一致性归 t472，跨入口并发交错归 t479。
    - **模型路由选 b**：多渠道保存部分失败时停止后续写入，逐渠道报告成功/失败/未执行，保留修改前 `models`/`model_mapping`/`priority` 快照，不自动回滚；`HTTP 200 + success:false` 判失败；两端一致。
    - **导入 secret 选 b**：文件无 `secrets` 字段→保留仍存活实例的原密钥并清理悬空密钥；有非空 `secrets`→整体替换；`secrets: {}`→清空。被过滤的未知 manifest 实例其密钥随清理删除。
- 影响：t472/t473/t474/t476/t478/t479/t480/t481/t482 的 spec 据此修订基线（见各 `docs/tasks/*/spec.md` 背景节）。Command Code 上游 token 语义经 2026-09-14 复核修正 d059（`usage` 为每轮用量、非累计，逐轮相加归因），t483 据此实现。
- 落地：t471-t484 批次（文档修订，2026-09-14）。
- t473 落地：桌面 `CONFIG_GET_SECRETS` / `CONFIG_SAVE_SECRETS` 删除 `#setting` 路由限制，仅保留合法 renderer sender 校验；LocalAPI 的用户业务端点继续位于 ingest token 门禁之前。
- 替代：无

## 027 连接器身份与本机路径分离（2026-09-14）

- 背景：连接器配置原以 `executablePath` 同时承担本机文件定位和连接器身份，移动安装目录或跨平台导入会导致实例失配；同一 manifest 的多实例还可能被错误合并。
- 结论：`ConnectorConfiguration.manifestId` 是必填的平台无关定义身份；`executablePath` 只保存当前机器的解析缓存。迁移仅回填/刷新这两个字段，`instanceId`、`stateId`、启用态、参数、端点、刷新间隔和 vault 归属保持不变。auto-seed 按 manifestId 匹配并逐实例更新路径；无法解析的孤儿按逐条脱敏日志加摘要清理。
- 落地：t471。
- 替代：无

## 028 配置传输 canonical v2 与 secret 三态（2026-09-14）

- 背景：桌面 IPC、LocalAPI/Web 与 CLI 各自实现配置导入导出，桌面 wrapper、Web 裸配置与 CLI 逐 key merge 互不兼容；导入失败还可能留下 config 与 vault 不一致状态。
- 选项：格式 A) 保留三套 wrapper/裸配置兼容路径；B) 统一 `{formatVersion:2, exportedAt, appVersion, config, secrets?}`，入口只做文件/HTTP 外壳。secret 导入 A) 一律 replace-all；B) 按 `secrets` 字段三态处理。
- 结论：选 B。所有入口走共享 transfer 模块；只接受 canonical v2，校验失败零副作用；`secrets` 缺失=保留活动实例并清理悬空密钥，存在=整体替换，`{}`=清空。未知 manifest 跳过并报告，路径按本机 definition 重算。写入前生成 config `.bak` 与加密 vault 快照，失败恢复一致前态。
- 落地：t472（`config-transfer.ts`、IPC/LocalAPI/CLI 接线与回归测试）。
- 替代：桌面 v1 wrapper、LocalAPI/CLI 裸 config 导入路径。

## 030 开发面板 Git 扫描由宿主统一执行（2026-09-15）

- 背景：开发面板需要把桌面与 Web 的 commit 历史统计统一起来，同时避免浏览器自行读取本机仓库或各入口结果漂移。
- 结论：`AppConfiguration.devPanel` 保存扫描根、cutoff 和 author 过滤；桌面 IPC 与 LocalAPI/Web bridge 共享主进程 `DevPanelScanManager`。Git 只读命令使用无 shell `execFile`，按真实 `git-common-dir` 去重，结果携带 `scanned_at` 与单调 `data_version`。全局 Git 身份缺失时显示 warning 并降级为全部作者；committer 仅展示，不参与 author 过滤。
- 替代：浏览器直接扫描、每个入口各自实现 Git 聚合、以及依赖外部迁移仓的静态热力图。

## 031 开发面板模型路由由宿主统一执行（2026-09-15）

- 背景：New API 模型路由需要读取用户外部 YAML、持有 session 凭证并同时服务桌面与 Web；将逻辑放入 renderer 会泄漏凭证并造成入口语义漂移。
- 结论：由 `DevPanelModelRoutingManager` 在主进程统一解析配置、拉取渠道、计算 slot 映射、串行写入和模型自检。IPC 与 LocalAPI/bridge 只传公开模型、渠道变更和快照标识；session 只留在宿主。保存先保留 `models`/`model_mapping`/`priority` 快照，遇到首个失败停止后续写入、返回 success/failed/skipped，不自动回滚；两端统一要求显式确认。
- 限制：New API 真实版本和真实模型回复保留 `[deploy]` 人工复核；s038 只验证无凭证本地适配边界。
- 落地：t482。
- 替代：renderer/browser 直接读取 YAML 或持有 token；桌面/Web 各自维护一套路由算法。

## 032 Command Code 用量按每轮独立值归因（2026-09-15）

- 背景：Command Code 的 `projects/<encoded-cwd>/<session-id>.jsonl` 同时包含会话与 assistant 用量；上游样本曾被误判为累计值，直接做相邻行差分会把 output/cost 回落误归零。
- 结论：reader 只消费 `type:"message"` 且 `message.role=="assistant"` 的 usage；`inputTokens`、`outputTokens`、`cacheWriteTokens` 与 `costUsd` 按每轮原值直接相加，不做累计差分。`cacheReadTokens` 按每轮拆为独立 `cache_read_tokens`，`input_tokens=inputTokens-cacheReadTokens`，由总 token 表达式恢复原始 input，避免缓存双计。每条明细保留 message 时间戳，dashboard 小时聚合据此分桶。
- 证据：d059/s037 的 2026-09-14 复核中，output 在 193/202、cost 在 199/202 会话出现回落；input 的少量小幅回落按每轮原值计入。版本或字段语义变化时重新复核 d059。
- 落地：t483 reader/collector/scan-state；t484 负责共享 public source/agent 枚举、历史提取与两面板接线。
- 替代：按累计值做相邻行差分。

## 029 自启与暂停态由主进程单一来源维护（2026-09-14）

- 背景：设置页只写 `launchAtLogin`，tray/CLI 各自直接改 OS 登录项；tray 另存本地暂停布尔值，无法反映 CLI/Web 的暂停。
- 结论：`launchAtLogin` 是唯一配置真相，主进程启动和配置保存都按该值双向应用 OS 登录项；tray/CLI/Web 自启操作经主进程更新 config 与 OS。暂停原因集合归 orchestrator，入口只调用 `suspend/resume` 并读取 `get_pause_state()`；LocalAPI 通过 `/v1/control/status` 与 SSE 广播同一状态。
- 平台：Linux 或无 `setLoginItemSettings` 的环境明确返回能力不可用，不引入新的 Linux 自启动实现。
- 落地：t474。
- 替代：tray 本地 `is_paused`、CLI 独立 `setLoginItemSettings`、仅开启不关闭 OS 登录项的回退逻辑。

## 033 Command Code 会话历史由宿主固定 resume（2026-09-14）

- 背景：Command Code 会话 JSONL 需要进入统一 session-history；桌面 renderer 与 Web
  renderer 目前只能复制续接命令，Web 在非安全上下文还可能没有 clipboard。任意模板
  直接交给 shell 又会把 session id 变成命令注入边界。
- 结论：`commandcode` 作为独立 `HistorySource`/`ExtractorKind`，复用 locator、query、
  watcher 和两端事件桥。面板 resume 只接受已定位的 linux/mac Command Code session，
  由宿主无 shell 地 `spawn("cmd", ["--resume", session_id])`；IPC/LocalAPI 不接受
  任意命令字符串，Web 不降级为 clipboard。
- 边界：Command Code JSONL 的增量游标记录文件快照，截断或同尺寸重写触发全量 cache
  替换；user 仅接受 `message.meta.source === "user"`，工具与 thinking 内容永不展示。
- 落地：t484；规格见 `docs/specs/session-library.md` 与
  `docs/specs/resume_command_template.md`。
- 替代：renderer/browser 直接执行模板、Web 禁用 resume、或把 Command Code 混入
  其他 agent 的默认映射。
