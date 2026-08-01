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

### p021 e2e gen-synthetic 重生成会抹掉手工 synthetic fixture 条目（2026-08-01）

- 来源：t181 review f001 / test_f001
- 内容：t181 为让 6 处条件 skip 用例在 synthetic 下可跑，手工给 `synthetic.json` 注入 KIMI items `error`（HTTP 401）并补 opencode_go connector（2 workspace）。`gen_synthetic.mjs`（`e2e:gen-synthetic`）不产生这两类条目，重跑生成会静默覆盖，导致 account_error_badge / opencode_go_usage 在 CI 变红。需把「KIMI failed connector 注入 item.error + 补 opencode_go connector」固化进 gen_synthetic.mjs（或加持久化合并逻辑）。
- 处理：未开

### p022 synthetic fixture trend key 与 renderer period.id 不一致致 sparkline 恒空（2026-08-01）

- 来源：t181 review 未进表提示（pre-existing 系统性 fixture 不一致）
- 现象：synthetic e2e 下 sparkline 恒空。原描述称 gen_synthetic 取 `it.id.split(":").slice(-1)[0]` 截短 metricId 做 trend key，但 2026-08-02 复核 `scripts/e2e/gen_synthetic.mjs` trend 拷贝段（:60-64）实际直接拷贝 real key 仅 redact email，未截短 metricId——描述与现状不符，根因待重新复现。
- 影响：synthetic e2e 的 sparkline 相关断言退化（空序列）；real fixture 同机制疑受 metric_id 匹配影响。
- 根因：待确认（mock_server query 精确匹配 vs renderer 传完整 period.id；real server query_trend_series 的 metric_id 匹配口径；或 real responses 本身缺 trend 条目）。
- 测试缺口：无 synthetic 断言 sparkline 非空。
- 线索：`mock_server.mjs:49`、`ProviderAccountRow.tsx:88-98`、`gen_synthetic.mjs:60-64` trend 拷贝段。
- 处理：未开（描述已过时，需 task-bug 重新复现根因后立项）

### p025 reviewer prompt 模板要求 `overall:` 但 check_review_status.py 认 `verdict:`（2026-08-02）

- 来源：t187 收尾自查（task-run Step 7）
- 内容：`task-run` skill 的 review 指示与 reviewer 习惯写「overall: PASS/FAIL」，但 `scripts/check_review_status.py:29` 的 `VERDICT_RE = ^verdict: (PASS|FAIL)$` 只认 `verdict:`。reviewer 若只写 `overall:` → check 返回 `overall=INCOMPLETE`，需手工在 review 报告补 `verdict:` 行。t187 Round 1/2 即踩此坑（手工补正）。两处应统一：要么脚本兼容 `overall:`，要么 skill prompt 模板与 reviewer 指示统一要求 `verdict:`。
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
