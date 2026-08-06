# 待办与不办总账

项目里「已知、还欠着」的事只在本文件登记：未修 bug、review 遗留、技术债、该做未做的需求，以及用户已确认暂搁的事项。分两节：「待办」放未闭环、待启动条目；「不办」放用户显式确认暂搁的条目。

- 三态划分：未闭环（「待办」节，`- 处理：未开`） / 已闭环（迁 `docs/archive/pending.md`） / 暂搁（「不办」节，`- 处理：不办` + `- 暂搁`）。
- 「不办」不等于闭环：条目整条留本文件「不办」节，不迁 archive；以后决定复活时移回「待办」节（`- 处理` 改回 `未开`、删 `- 暂搁`、保留原 `pNNN`）。
- 所有条目统一使用 `pNNN`，当前主总账（含「待办」「不办」两节）与归档总账共享一条递增序列，历史编号不复用。
- 新增条目前运行 `scripts/pending.py next`；更新已有条目或迁入归档时保留原编号。

## 待办

两种字段模板，按条目性质选一种；`- 处理` 字段未闭环写「未开」，闭环写 `{tid}` 或外部动作说明。

- 普通（需求 / 遗留 / 技术债）：`- 来源` / `- 内容` / `- 处理`。`- 来源` 写清出处：finding_id、原 tid、用户提出，或技术债自查。
- bug：`- 现象` / `- 影响` / `- 根因` / `- 测试缺口` / `- 线索` / `- 处理`。bug 由 `task-bug` 登记并完成根因与补测分析。

已验证的技术发现不属于待办，写 `docs/findings.md`。

### p054 本地默认 `pnpm test:e2e:web` 必挂 account_error_badge（需 MOCK_FIXTURE=synthetic）

- 来源：2026-08-05 /goal 全量 e2e 验证
- 内容：`pnpm test:e2e:web` 默认走 real fixture（responses.json），KIMI 三实例 state 无 item 级 error，`account_error_badge.spec.ts` 断言 `.error-badge` 必失败；`MOCK_FIXTURE=synthetic pnpm test:e2e:web`（CI smoke，docs/guides/testing.md:80 文档化）48 全绿。测试本身非回归（fe80caa2 未触该路径），属本地默认 fixture 与 synthetic-only 测试的配置分叉：daily 命令默认跑 real 却含 synthetic-only 用例。候选修法：该 spec 在非 synthetic fixture 下条件 skip，或 webServer 恒设 MOCK_FIXTURE=synthetic。
- 处理：未开

### p055 工作台 WorkspaceView.tsx / workspace.css 超行数阈值待拆分

- 来源：t224 code reviewer（round 1/2 提示，未进 finding 表）
- 内容：`src/renderer/components/workspace/WorkspaceView.tsx` 629 行、`src/renderer/styles/workspace.css` 780 行，均超项目 400 行 minor 阈值（未达 800 important）。工作台为 t224 新建且后续 t225（面板交互）/t226（摘选）还会继续演进，建议按功能拆（如消息状态逻辑抽 hook、弹窗样式独立）。
- 处理：未开

### p056 vault/secrets-store 集成测试全量并行超时 flaky

- 来源：t227 实施观察（2026-08-06）
- 内容：`tests/integration/config/secrets-store.test.ts` 与 `tests/integration/vault/file-vault-backend.test.ts`（crypto 密集 + 文件锁/互斥）在 `pnpm test` 全量并行时随机 5s 超时（一次 0-4 个 test 失败），单独运行两文件 38 全过。与 t218 处置的定时器 flaky 类似，属集成测试并行资源竞争模式；非 t227 改动引入（vault/config 零交集）。候选修法：提高这两文件 `testTimeout`（如 15000），或全量跑时串行化 crypto 密集套件。
- 处理：未开

### p057 SessionLibrary 测试 act() 警告（异步 mock resolve 在 act 外）

- 来源：t227 test reviewer round 2（f007 minor）
- 内容：`tests/unit/renderer/components/session_library/SessionLibrary.test.tsx` 13 个用例渲染后 `getSessions`/`query` mock 的异步 resolve 落在 act 外，vitest 打印 "not wrapped in act(...)" 警告；不导致失败，纯 dev 噪声。候选修法：render 后 `await act(async () => {})` 冲刷微任务，或断言统一改用 findBy/waitFor 前先 act。
- 处理：未开

### p058 会话库 load_error 空态误报与中途分页失败无提示

- 来源：t227 code reviewer round 3（f013 minor，f012 修复残余）
- 内容：`SessionLibrary.tsx` 的 `load_error` 唯一渲染点是被 `visible_sessions.length === 0` 门控的空态分支。两个残余缺口：① 中途分页失败时部分数据照常展示且无「加载中断」标识；② `load_error=true` 且筛选匹配 0 条时，空态误报「会话列表加载失败」并隐藏「清除筛选」按钮。候选修法：空态文案区分「加载失败（all 为空）」与「无匹配（all 非空）」；中途失败时列表上方加一行提示。
- 处理：未开

### p059 会话库 SessionLibrary.tsx / session-library.css 超行数阈值待拆分

- 来源：t227 code reviewer round 1/2/3 连续提示（未进 finding 表）
- 内容：`src/renderer/components/session-library/SessionLibrary.tsx` 645 行、`src/renderer/styles/session-library.css` 725 行，均超项目 400 行 minor 阈值（未达 800 important），round 1-3 持续净增。建议按功能拆（SessionCard/SessionRow/预览抽屉抽独立组件文件、CSS 按区块拆）。
- 处理：未开

### p060 柱状图小时/天粒度按钮在 7d/30d 预设下点击无效（回归）

- 现象：代理面板柱状图时间轴的「小时/天」粒度按钮，在 7d/30d 预设下点击无响应（显示恒为「天」）；24h 预设下点「天」按钮样式也不随点击变化。期望：24h 强制小时粒度，7d/30d 可选择小时或天，自定义范围可自由切换。
- 影响：粒度切换在常用 7d/30d 视图完全失效，用户无法按小时查看一周/一月的分布。
- 根因：t191（commit 96cbf532）引入 `effective_granularity(preset, custom, gran)`（`src/renderer/views/TokenStatsView.tsx`），`preset` 非 24h 时恒返回 `"day"`、24h 恒返回 `"hour"`，且粒度 Segmented 的 `value={effective_gran}`、onChange 只 `setGran`。7d/30d 下 `effective_gran` 强制 `"day"`，`gran` state 的「小时」选择被覆盖，控件假死；24h 下点「天」仅改 `gran`，UI 仍显示 hour，点击无视觉反馈。t191 之前 `value={gran}` 原生生效，可自由切换。属于产品缺陷 + 回归。t183（24h preset 走 hour 桶聚合）依赖 24h 强制 hour；t184（24h 只走 rollup）不依赖 gran 覆盖，修复时须保持 24h 锁定小时，仅放开 7d/30d 的 `effective_gran` 约束。
- 测试缺口：`tests/unit/renderer/views/token_stats_view.test.tsx` 无断言覆盖预设下粒度按钮的行为；`effective_granularity` 为视图内纯函数未导出未单测，7d/30d 下点「小时」后的 UI/查询 gran 行为无任何断言。补测：点击 7d/30d「小时」后断言 Segmented 高亮与 `getDashboard` 请求 `gran="hour"`；24h 下断言恒 hour；自定义范围断言可切换。
- 线索：`.scratch/task-bug-gran-24h7d/`（回归定位笔记）；根因定位见 commit 96cbf532 引入 `effective_granularity`。
- 处理：未开

### p061 代理面板模型下拉未应用模型映射（alias）

- 现象：代理面板右上角「模型筛选」下拉列出的是原始模型名（如 `claude-3-5-sonnet-20241022`），而柱状图、donut、会话表同窗口都显示映射后的别名（如 `Sonnet`）。期望：下拉选项显示文本应用同样的 modelAliases 映射。
- 影响：用户在下拉里看不到与图表一致的模型名，筛选时难以对照；alias 用户日常操作体验不一致。
- 根因：后端 `dashboard.models` 由 `token-stats-store.ts` 的 `SELECT DISTINCT model ... ORDER BY model`（`window_models` 临时表）直接取原始名，未过 `model_resolver`（alias 在 TopN 聚合前的 `model_token_totals`/`model_call_totals` 中已合并）。前端 `TokenStatsView.tsx` 的 `modelOptions` 直接用 `dashboard.models` 渲染下拉，未套 `modelAliases`。属产品缺陷。注意：后端 `build_dashboard_conditions` 的 model 筛选是原始名精确匹配（`model = @model`），所以下拉 value 必须保留原始名、只映射显示文本，否则筛选失效。
- 测试缺口：`tests/unit/renderer/views/token_stats_view.test.tsx` 的模型筛选测试（t204/t206）只断言 option 文本等于原始名（`sonnet`），未覆盖配置了 modelAliases 时下拉显示映射名；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 未断言 `dashboard.models` 的 alias 映射。补测：后端测试断言配置 model_aliases 后 `models` 返回映射名；前端测试断言带 modelAliases 时下拉显示别名且选中后查询仍发原始名。
- 线索：`.scratch/task-bug-model-dropdown/`（映射链路分析）。
- 处理：未开

## 不办

用户已显式确认暂搁的条目——「以后再说」，不是闭环。`task-from-pending` / `task-bug` 不自动捞本节；`repo-hygiene` 不迁 archive。

字段复用上方普通 / bug 模板，追加必填项：

- `- 暂搁：YYYY-MM-DD 决定不办的理由`：写清为什么现在不动（风险可控、排期靠后、等外部依赖等）。
- `- 处理` 固定写「不办」。

以下 9 条自 `docs/legacy_backlog.md`「暂不建 task（附理由）」节迁入（2026-07-31 对齐模板时迁移）；2026-08-01 复核后 8 条复活回「待办」节，1 条保留。

### p008 taskkill 按路径（PowerShell）（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t074 遗留
- 内容：taskkill 改为按路径（PowerShell）
- 暂搁：2026-08-01 复核——t065 已把误杀范围从「所有 electron.exe」收窄为只杀 `OmniPanel.exe`（package-and-run.ts:18 按镜像名），撞名面极小；按路径实现需 PowerShell + 遍历进程路径，Windows 特定重构，边际收益低。等下次动打包脚本再一并做
- 处理：不办
