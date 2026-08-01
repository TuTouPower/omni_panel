# Task review t174（reviewer_focus: 代码）

- task：`t174_stale_copy_keep_data_time`
- spec：`docs/tasks/t174_stale_copy_keep_data_time/spec.md`
- diff_anchor：`5c48c6c6858d1eb82d25b649da91c0dd5d03e497`
- target：`git diff 5c48c6c6858d1eb82d25b649da91c0dd5d03e497`
- round：1
- reviewed_at：2026-08-01 08:34 UTC+8

## Findings

### t174_code_f001 - prune 同 ts 保护过宽，latest 语义与幸存行选择不一致

- 严重度：minor
- 锚点：行为缺陷（边缘、无数据丢失）——stale 副本保留原 `observed_at` 后，原观测与副本同时间戳。`prune` 的「保留每键最新行」保护子查询用 `observed_at = MAX(...)`，同 ts 下原观测与 stale 副本**全部命中**被视为最新行，永远不会因超阈值被删。同 ts 行随每次失败-恢复循环累积，prune 对该键失效。
- 位置：`src/main/core/observation/observation-store.ts:193-200`（`prune_stmt`）
- 问题：本 task 把 `get_latest` / `list_latest_by_provider` / `list_by_instance` 三处 latest 查询全部加了 `stale DESC` tie-breaker（`observation-store.ts:161-190`），使「最新观测」选择唯一确定（同 ts 优先 stale 副本）。但 `prune_stmt` 的 MAX 保护未同步同一规则：同 ts 时它把所有等值行当最新保留，与 latest 查询认定的唯一最新行（stale 副本）不一致。复现：account A 上次成功观测 ts=T；失败一轮插入同 ts 副本；随后恢复，新观测 ts=T2 正常插入。prune(`older_than_ms = T+1`) 后，ts=T 的原观测与旧 stale 副本均不满足 `observed_at < T+1` 的删除条件中「非最新行」的例外（MAX=T2 时二者本可被删，但二者 ts=T≠MAX，可被删——该场景正常）；真正的边缘是连续失败期间该键 MAX 恒为 T：prune 阈值超过 T 时，MAX 保护把原观测+副本同 ts 全留下，同 ts 行永不清理。数据不丢（latest 查询 tie-breaker 仍取 stale 副本），但行累积且 prune 语义与「最新观测唯一」不变量不一致。spec 未知契约区已核实「`list_latest_by_provider` 同 ts 全部命中」并据此改了该查询，prune 是同一多义模式的漏网点，但无数据丢失路径，不构成 blocking。
- 建议：prune 保护子查询改为与 latest 查询一致的确定性选择（如 `ROW_NUMBER() OVER (PARTITION BY 键 ORDER BY observed_at DESC, stale DESC) = 1`），使幸存行与 latest 查询认定的最新行重合；可在后续清理 task 中连同补「同 ts 原观测+副本下 prune 保留 stale 副本」用例。

## 结论

- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大（降级规则，不进表）：`tests/integration/scheduler/refresh-service.test.ts` 1610 行（≥1200 阈值，本 task 净增 2 行），测试源码已达 important 档行数；属历史累积，本 task 仅两处断言改写，未继续堆大实质内容，仅提示。
    - 复杂度：无新增函数，无命中项。
    - 范围外观察：`ProviderCard.tsx:151` 卡片头部相对时间仍取 connector 级 `group.updatedAt`（部分失败下被成功账号拉高）。spec 范围限定「账号行/卡片行」的 stale 相对时间，卡片头部时间不在 AC1/AC2 字面范围，仅提示，不进表。
- AC 覆盖核对：AC1（副本保留原 observed_at + 账号行取 per-账号 observedAt）已实现并测；AC2（徽标不变、恢复后取新 ts）渲染逻辑未动徽标分支，恢复路径副本被 dedupe 清除、`get_latest` 取新观测，已实现；AC3（latest 查询 tie-breaker + insert 前清同键旧副本 + 趋势 per-day 去重）已实现并测。三处 latest 查询与 dedupe 均已覆盖。
- 总体判断：AC1/AC2/AC3 均有实现与测试；无 critical/important，f001 为 prune 同 ts 边缘的 minor 一致性问题，不阻断。
- 系统性 follow-up：无

verdict: PASS
