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

## p075 web e2e session_panel 4 用例既有失败（MOCK_FIXTURE=synthetic 下）

- 来源：t249 黑盒
- 现象：`pnpm test:e2e:web`（`MOCK_FIXTURE=synthetic`）下 `session_panel.spec.ts` 4 用例失败：t228「会话库搜索/筛选/排序/预览/并排打开闭环」等「9 个会话」计数（页面显示「统计不可用」）+ t237 三个虚拟列表用例等 `.lib-card` 标题「大会话虚拟列表」hover 超时。
- 影响：web e2e 非全绿；会话库统计与虚拟列表路径无 e2e 保障。
- 根因：`MOCK_FIXTURE=synthetic` 时 mock 全量 `/v1/*` 走 `synthetic.json`，该 fixture 不含「9 个会话」统计聚合与「大会话虚拟列表」会话标题（t237 经 `page.route` 注入 `LARGE_SESSION` 但会话库卡片未找到标题对应卡片）；主仓基线（未改代码）同样 4 failed，确认为存量 fixture/测试问题。
- 测试缺口：synthetic fixture 未覆盖会话库统计端点与虚拟列表会话标题。
- 线索：`tests/e2e/fixtures/synthetic.json` 端点数 64，无 `/v1/sessionStats` 类统计端点；`scripts/e2e/session_fixture.mjs` 生成脚本亦无「大会话虚拟列表」。
- 处理：未开

## p076 会话索引落盘 O(N²) 全量写（首开批量性能权衡）

- 来源：t254 code review f002（minor）
- 内容：`session-locator.ts` 的 `persist_index_entry` 每次 miss 都 `save_session_index` 全量序列化 + 同步写盘。首次打开面板批量 resolve（约 50 可见会话）且索引冷时每个 miss 一次全量写，索引增长到 N 条为 O(N²) 序列化 + 同步 I/O。活跃会话（mtime 高频变化）每次打开也走 miss → 全目录扫描 + 全量写。
- 权衡：首开批 50 会话、每次 ~10KB JSON、50 次总 <500KB 顺序写，现代 SSD 无感；主瓶颈仍是全目录扫描（t254 已消除命中路径）。同步接口（resolve 同步返回）下做批间合并需引入异步落盘 + flush 等待，破坏现有「resolve 后立即断言索引文件存在」的测试语义，收益有限。
- 处理：未开

## p077 electron e2e plugin_config CPA 保存偶发失败（完整套件下）

- 来源：t254 黑盒
- 现象：完整 `pnpm test:e2e:electron` 时 `plugin_config.spec.ts:91`「CPA settings persist after app restart without exposing the secret」偶发失败（endpoint 读回 synthetic 默认 17863 而非保存的 cpa.example.test）；单独跑该 spec 稳定 4 passed。
- 影响：electron e2e 完整套件偶发非全绿；CPA 配置持久化路径无稳定 e2e 保障。
- 根因：疑似测试间 electron 进程/端口残留——前一测试的 app 未完全退出时 plugin_config 重启读取用户数据竞态；主仓基线（未改代码）完整 e2e 35 passed，单独跑也过，非 t254 引入（t254 改会话定位不涉 CPA 配置）。
- 测试缺口：无（测试隔离问题，非断言缺失）。
- 线索：失败仅出现在完整套件（多 spec 串行）下，单独 spec 恒过；重启相关测试（secrets_persistence 等）前置。
- 处理：未开

## 不办

用户已显式确认暂搁的条目——「以后再说」，不是闭环。`task-from-pending` / `task-bug` 不自动捞本节；`repo-hygiene` 不迁 archive。

字段复用上方普通 / bug 模板，追加必填项：

- `- 暂搁：YYYY-MM-DD 决定不办的理由`：写清为什么现在不动（风险可控、排期靠后、等外部依赖等）。
- `- 处理` 固定写「不办」。

以下 9 条自 `docs/legacy_backlog.md`「暂不建 task（附理由）」节迁入（2026-07-31 对齐模板时迁移）；2026-08-01 复核后 8 条复活回「待办」节，1 条（p008）保留，2026-08-07 用户要求归档迁出。

统一几个面板的设计语言，主题色 强调色 背景色 辅助色 字体等等。
