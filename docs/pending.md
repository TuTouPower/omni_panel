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

### p040 session 轴会话 key 不含 env（t200 遗留）

- 来源：t200_code_f003
- 内容：rollup DTO 行（`tokenStatsRollupRowSchema`）不含 `env`，renderer `prepareBarDataFromDashboardRollup` 的 session_key 缩为 `${source}|${session_id}`；改前服务器含 env（`${source}|${env}|${session_id}`）。跨平台同 session_id 的会话在 session 轴会合并为一个 category。session_id 为 UUID 碰撞概率极低。补 env 会改变 `query_range_rollup` 的分组/校验语义，改动面广，暂缓。
- 处理：未开

### p041 不可折叠卡片死折叠箭头扩散到其余组件（t203 审阅建议）

- 来源：t203_code review 未进表提示 1
- 内容：t203 为 ProviderCard 引入 `collapsible={can_collapse}` 消除不可折叠卡片的死折叠箭头（no-op + aria-expanded=true）。同款模式仍存在于 `UpcomingResetCard`（onToggleExpand 未定义时渲染 no-op 箭头）、`ProviderAccountRow`（can_collapse=false 仍出箭头）、PopupView token 面板（非 live 时 onToggle no-op）。live 弹窗中这些组件恒有回调故不造成用户可见问题，但镜像树（aria-hidden）仍渲染死按钮，属 a11y/整洁度技术债。
- 处理：未开

### p042 auto_seed BUNDLED_PLUGIN_NAMES 与 connectors/ 实际连接器脱节（t203 审阅提示）

- 来源：t203_code review 未进表提示 3
- 内容：`auto_seed.spec.ts` 的 `BUNDLED_PLUGIN_NAMES` 仍是 7 条历史插件名，与 `connectors/` 下实际 16 个连接器脱节。断言用 `>=` 故仍通过，语义只剩「种子未清空既有配置」，靠 `.acc-row` "My Claude" 可见性断言兜底。属测试维护债，可考虑改为与 `discover_connector_definitions` 结果对齐或删去常量。
- 处理：未开

### p045 idx_trend 索引对 trend 查询冗余（t214 审阅建议）

- 来源：t214_code review 未进表提示
- 内容：t214 给 `query_trend_series` SQL 加 source_instance_id 后，SQLite planner 改用 idx_lookup（provider, account_id, metric_id, source_instance_id, observed_at）全覆盖，idx_trend（provider, account_id, metric_id, observed_at）对该查询不再被选用（见 d015）。idx_trend 保留无害但属冗余索引（占空间、增写入开销）。清理前须确认无其他查询路径依赖 idx_trend 的列序（如不含 source_instance_id 的等价范围查询）。
- 处理：未开

### p046 sparkline 窗口选择持久化（t208 范围外功能增强）

- 来源：t208 SPIKE 结论
- 内容：t208 sparkline 窗口选择器（1/7/30 天）仅 session 内 useState，重启回默认 7 天。config 层有 per-view 偏好字段（`collapsedAccounts` 等），可加字段持久化用户选择。属功能增强，非 bug。
- 处理：未开

### p047 trend 相关注释订正与窗口选择器测试 flaky（t208 审阅范围外）

- 来源：t208 code/test review 未进表提示
- 内容：(1) `TrendApi.get` 注释「返回长度=days、缺失日期填 null」已过时（t208 改 ≤max_points 桶、不填充）；(2) `observation-store.ts` 接口前置 docstring 与 t208 补充段表述矛盾；(3) `provider_account_row.test.tsx` 窗口选择器「切回缓存」断言用 `setTimeout(50)` 负向等待，CI flaky 风险，宜改用 `waitFor` 配合「调用次数未变」或伪时钟。
- 处理：未开

### p048 会话历史增量推送固定发往历史窗口（t210 遗留）

- 来源：t210_code_f004
- 内容：`session-history-ipc.ts` SUBSCRIBE 的 `on_update` 把增量消息发往 `history_window_controller.get_window()`（唯一历史窗口），未按「订阅方窗口」路由。当前架构下订阅只由历史窗口（t211）发起，agent route 明细表入口（t212）走 `SESSION_HISTORY_OPEN` 打开窗口而非内联订阅，故无实际推错场景。若未来某窗口在自身内嵌订阅（如明细表内联会话视图），需把订阅事件与发起窗口绑定后路由推送。
- 处理：未开

### p049 refresh-service 集成测试在整批并行下偶发超时（疑似 flaky）

- 来源：t210 黑盒顺手发现
- 内容：`tests/integration/scheduler/refresh-service.test.ts` 在整批 `pnpm test` 高并行负载下偶发失败，单文件隔离跑稳定 30/30 通过。失败形态：`preserves lastSuccess across consecutive failures` / `inserts stale observations` / `passes config.proxy.url` 5s 超时、`retries failing non-session connector 3 times` 得 4 次尝试。这些用例走真实 2s 重试定时器，负载高时循环跑不进 5s 窗口或额外触发一次。与 t210 无关（t210 未触 refresh-service）。处置方向：给这些用例提 timeout、改用伪时钟或缩小重试间隔，消除并行时序敏感。
- 处理：未开

### p050 grok 增量消息 id 从 0 重计与全量 id 冲突（t210 审阅发现，t209 域）

- 来源：t210 code review 结论提示（t209 根因，建议 follow-up）
- 内容：grok 提取器的增量 id 从 0 重计，与全量提取的 id（按行号全局计）冲突：订阅建立时全量提取得 id 如 `grok-0..N`，追加后增量第一条 id 又从 `grok-0` 起。HistoryMessage.id 用于窗口渲染 key 与分页，重复 id 会导致 React key 冲突 / 订阅去重异常。另 byte_offset 增量遇写入半行时游标越过该记录，该记录在增量通道丢失（renderer 5s 兜底可恢复）。修法：增量 id 改成全局行号（offset 对应的行索引），且半行容错（读到非法 JSON 行时回退一个行边界重读）。
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
