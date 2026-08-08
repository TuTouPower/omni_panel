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

## p088 typecheck TS4111：local-api/server.ts 索引签名属性需 bracket 访问（2026-08-08）

- 来源：技术债自查（t261 实施期发现）
- 内容：`src/main/core/local-api/server.ts:323-325` 三处对索引签名类型属性用点号访问 `source` / `env` / `session_id`，TS4111 要求 `['source']` 等 bracket 形式。主仓与 worktree 均复现，`pnpm typecheck` 失败；文件不在 t261 diff 内，锚点 commit 已存在。
- 处理：未开

## p089 popup_view_height.test.tsx 批量运行 2 条 act 警告（2026-08-08）

- 来源：技术债自查（t261 实施期批量跑 popup_view 8 文件发现；锚点基线复跑确认 pre-existing）
- 内容：批量运行 `tests/unit/renderer/views/popup_view_height.test.tsx` 出现 2 条「update not wrapped in act」警告，测试仍通过但疑似掩盖时序问题（疑似假绿）。单文件运行是否复现未单独验证；根因暂未定位。
- 处理：未开

## p090 web e2e session_panel 既有失败：搜索统计行 + virtual list 大会话卡片（2026-08-08）

- 现象：`tests/e2e/web/session_panel.spec.ts` 搜索闭环用例断言 `9 个会话` 统计行未出现（fixture 无 `GET /v1/sessionStats`，统计显示「统计不可用」）；virtual list 三例（加载多页/向上翻页/大纲跳转）在会话库找不到「大会话虚拟列表」卡片。
- 影响：web e2e 会话面板关键路径部分失败，AC 验收被阻塞。
- 根因：未定位。t263 改动（web shim open 写 loc、searchContent signal、query source/env 400、服务端断连 abort）与这些用例数据流无交集；t263 主仓基线（无 t263 改动）同用例同样失败，确证既有问题。
- 测试缺口：e2e 断言依赖 fixture 统计端点与「大会话」卡片注入（`setup_large_session_routes`），需要 fixture 或 mock 对齐。
- 线索：fixture `synthetic.json` 无 `GET /v1/sessionStats`；virtual list 卡片依赖 `page.route("**/v1/sessions")` 合并 LARGE_SESSION，可能会话库 lazy load（t248）后加载时序或路由拦截变化。
- 处理：未开

## 不办

用户已显式确认暂搁的条目——「以后再说」，不是闭环。`task-from-pending` / `task-bug` 不自动捞本节；`repo-hygiene` 不迁 archive。

字段复用上方普通 / bug 模板，追加必填项：

- `- 暂搁：YYYY-MM-DD 决定不办的理由`：写清为什么现在不动（风险可控、排期靠后、等外部依赖等）。
- `- 处理` 固定写「不办」。

以下 9 条自 `docs/legacy_backlog.md`「暂不建 task（附理由）」节迁入（2026-07-31 对齐模板时迁移）；2026-08-01 复核后 8 条复活回「待办」节，1 条（p008）保留，2026-08-07 用户要求归档迁出。

统一几个面板的设计语言，主题色 强调色 背景色 辅助色 字体等等。
