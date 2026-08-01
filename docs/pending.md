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

### p016 t174 minor 遗留：prune 同 ts 保护过宽 + AccountUsageRow observedAt 路径无测试（2026-08-01）

- 来源：t174_code_f001 / t174_test_f001
- 内容：t174_code_f001——`observation-store.ts` 的 `prune_stmt`（:193-200）MAX 保护子查询未同步 `stale DESC` tie-breaker；stale 副本保留原 `observed_at` 后原观测与副本同时间戳，同 ts 下全部命中「保留每键最新行」保护，prune 对该键失效，同 ts 行随失败-恢复循环累积（数据不丢，latest 查询仍唯一）。t174_test_f001——`UsageRows.tsx` 的 `AccountUsageRow` 做了对称的 observedAt 优先取数改动，但 `usage_rows.test.tsx` 无用例断言该路径。
- 处理：未开

### p007 write_front_matter / rebuild_indexes 原子写恢复（2026-07-26 暂搁，2026-08-01 改写）

- 来源：t063/t068 遗留改写。t063（8eaf1892）曾为权威 task JSON 实现 tmp+fsync+os.replace 原子写（防掉电损坏）；t169 模板化重写后 `scripts/task.py` 全仓 `os.replace` 命中为 0，`write_front_matter`（task.py:387）直接 `write_text` 写**权威 front matter**，`rebuild_indexes`（task.py:835）直接写派生索引 JSON，原子性丢失。task.md front matter 是状态权威（CLAUDE.md 明文「只经 task.py 修改」），中断写损坏影响比旧 JSON 更重。原「mock os.replace 失败路径测试」目标代码已消失，故改写为恢复原子写。
- 内容：`write_front_matter` + `rebuild_indexes` 恢复 tmp+fsync+os.replace 原子写；在 `tests/repo_template/` 补失败路径/中断恢复测试（pytest 基建已就绪，197 用例；`test_task_save.py` 测了内容正确性未测原子性）。
- 处理：未开（A 组——防数据损坏，优先级最高；t063 想做而当时无 Python 框架，现已就绪）

### p006 完整 rendererIndexPath 白名单（2026-07-26 暂搁，2026-08-01 复核阻塞解除）

- 来源：t062 遗留
- 内容：完整的 rendererIndexPath 白名单。现状：**t067 已落地**——`set_renderer_index_path`（helpers.ts:19-29）+ file:// 精确 pathname 比对（helpers.ts:39-43），接线于 main/index.ts:122-126，测试 helpers.test.ts:12-39（拒绝同名异路径）。仅剩未初始化时 `endsWith` fallback（helpers.ts:44，测试环境专用）。
- 处理：未开（A 组——几乎完成，极小收尾；补未初始化路径的严格校验即可闭环）

### p001 16 个 connector 删内联 helper 改 ctx.status（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t088/t066 遗留
- 内容：16 个 connector（connectors/_/connector.ts）删除重复内联 helper，统一改 `ctx.status`。现状：`ctx.status` 机制就绪（host-io.ts:26-30，for*pct/for_ratio/for_balance，t066 产物）但 **0/16 已迁移**；重复 helper 大量存在——`is_record`×9、`to_number`×13、`parse_limit`×5、status_for*_/classify_status 阈值 helper 出现于 14 个文件。均为单次 fetch 后用内联阈值函数算 status，无内联轮询状态机，迁移是纯机械替换。
- 处理：未开（A 组——机械迁移 + 统一阈值语义，架构收益明确；风险在 vm 沙箱脚本与宿主阈值的取值一致性，需逐 connector 对照）

### p004 e2e 断言真实刷新（当前死等 1000ms）（2026-07-26 暂搁，2026-08-01 复核阻塞解除）

- 来源：t070 遗留
- 内容：e2e 断言真实刷新，替换当前死等 1000ms。现状：**阻塞已解除**——刷新按钮 `.spinning` class（PopupView.tsx:537）由 `refreshing` state 驱动，复位于 refreshAll().finally()（PopupView.tsx:374-388）；`popup_refresh_state_reset.spec.ts:56-72` 已示范「等刷新后 collapse 按钮可见」的免死等断言模式。仍死等两处：`scheduler.spec.ts:43`（waitForTimeout(1000)）、`tray_menu_actions.spec.ts:44-47`（点击后仅断言按钮可见）。
- 处理：未开（A 组——有现成稳定信号与断言先例，替换两处死等）

### p003 migration 测试改 import 生产迁移入口（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t069 遗留
- 内容：migration 测试改为 import 生产迁移入口。现状：`tests/unit/observation_store_migration.test.ts:26,30,40` 仍手写 `NEW_COLUMN_SQL` + `PRAGMA table_info`；生产迁移在 observation-store.ts:119-133 内联于 `create_observation_store`，未导出独立函数。需先抽取导出迁移函数（小幅 API 暴露，防手写 PRAGMA 与生产漂移）。
- 处理：未开（A 组——成本低；抽导出迁移函数 + 改测试 import）

### p009 拆 PopupView.tsx（869行）与 popup_view.test.tsx（1519行）（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t153 f002/f003
- 内容：拆分 `PopupView.tsx`（实测 869 行）与 `popup_view.test.tsx`（实测 1519 行，项目最大测试文件）。t044/t125/t126 有拆分先例。
- 处理：未开（A 组——纯移动重构，降低最大文件维护负担；等下次大改面板时一并做）

### p005 setupFiles 拆 renderer-only（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t071 遗留
- 内容：setupFiles 拆分 renderer-only 部分。现状：vitest.config.mts:16-17 全局 `environment: "jsdom"` + 唯一 `setupFiles: ["./tests/smoke/setup.ts"]`；setup.ts 全为 renderer 专用（import jest-dom、`window.usageboard` mock、beforeEach 注入 `#root` DOM）。node 类测试（paths.test.ts 等）也跑 jsdom 被注入该 mock。vitest.contract_live.config.mts:13 有 node env 先例，但主套件未拆。
- 处理：未开（B 组——隔离性不纯但无实际 bug；与 p002 测试架构改进同批推进）

### p002 测试架构改进（I19/I21/I22/I23）（2026-07-26 暂搁，2026-08-01 复核修正记录）

- 来源：t064 遗留
- 内容：测试架构改进，拆解为四路：I19/I21/I22 分别对应 p003（migration 测试 import 生产入口）、p004（e2e 断言真实刷新）、p005（setupFiles 拆 renderer-only），随各自条目推进；I23（取消条件 skip）独立处理。**记录修正**：原条目称「I23 已确认无残留 skip」失实——2026-08-01 复核仍有 5 处条件 skip（tests/e2e/web/{account_error_badge,opencode_go_usage,multi_account,settings_provider_accounts,popup_card_states}.spec.ts），依赖 synthetic/real fixture。
- 处理：未开（B 组——I19/I21/I22 与 p003/p004/p005 合并；I23 需 real fixture 或显式判定 skip 策略，先补齐现状记录再决定是否复活）

## 不办

用户已显式确认暂搁的条目——「以后再说」，不是闭环。`pending-to-task` / `task-bug` 不自动捞本节；`repo-hygiene` 不迁 archive。

字段复用上方普通 / bug 模板，追加必填项：

- `- 暂搁：YYYY-MM-DD 决定不办的理由`：写清为什么现在不动（风险可控、排期靠后、等外部依赖等）。
- `- 处理` 固定写「不办」。

以下 9 条自 `docs/legacy_backlog.md`「暂不建 task（附理由）」节迁入（2026-07-31 对齐模板时迁移）；2026-08-01 复核后 8 条复活回「待办」节，1 条保留。

### p008 taskkill 按路径（PowerShell）（2026-07-26 暂搁，2026-08-01 复核）

- 来源：t074 遗留
- 内容：taskkill 改为按路径（PowerShell）
- 暂搁：2026-08-01 复核——t065 已把误杀范围从「所有 electron.exe」收窄为只杀 `OmniPanel.exe`（package-and-run.ts:18 按镜像名），撞名面极小；按路径实现需 PowerShell + 遍历进程路径，Windows 特定重构，边际收益低。等下次动打包脚本再一并做
- 处理：不办
