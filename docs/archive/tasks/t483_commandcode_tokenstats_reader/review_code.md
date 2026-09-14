# Task review t483（reviewer_focus: 代码）

- task：`t483_commandcode_tokenstats_reader`
- spec：`docs/tasks/t483_commandcode_tokenstats_reader/spec.md`
- diff_anchor：`d1e55a55de216183b7dc7b18dd119902be7a49c7`
- target：`git diff d1e55a55de216183b7dc7b18dd119902be7a49c7`
- round：1

## Findings

本轮零 finding。

独立检查了正确性、契约边界、增量状态、健壮性、资源访问、架构可维护性、测试与文档七个视角。reader 只读取本地 Linux/macOS projects 目录，按首个 session header、assistant role、有效 timestamp 和 usage 过滤；checkpoint/history 不会进入文件发现。每轮 input/output/cache/cost 直接累加，input 与 cache read 分开保存以重建原始 input，回落值不会触发累计差分或负增量。文件变更、删除、同一 session 多文件和序列化 scan-state 均通过 session 完整重算保持幂等。

公共 `commandcode` source/agent union、store schema 的公开枚举和 dashboard AgentFilter 由 t484 负责，t483 中的临时类型 cast 与 task split 一致，不构成本 task finding。cost 目前保留在 reader facts/state 供口径验收；既有 token-stats 公共 upsert schema 没有 cost 字段，属于 t483 spec 约定的采集侧边界。全量 SQLite 失败来自执行环境缺少 `better-sqlite3` native binding，未落在本 diff 的 reader/collector 逻辑。

## 结论

- `commandcode_projects_path` 仅为 linux/mac 返回 `~/.commandcode/projects`；collector 只为本机平台注册 commandcode source，Windows/WSL 未扩展超出范围的路径。
- `commandcode-reader` 读取 session id/cwd/title，忽略非 assistant、无 usage、无 timestamp 和 checkpoint/history；未知字段/坏行跳过，不阻断同一文件其余消息。
- 每条 usage 的 raw input 被拆为 `input - cacheRead` 与独立 `cacheRead`，输出、写缓存和 cost 逐轮累加；记录 timestamp 保留到 store 后续小时聚合。
- mtime state 对未变文件复用 facts，对 changed/removed 文件按 session 重新汇总；collector 的 save/load、截断回滚和 reset 路径都纳入 commandcode state。
- ADR 032 与任务实施笔记记录了 d059 的每轮值证据、t483/t484 边界和已知环境阻塞。

## AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|re_verified|Command Code fixture 含 session header、cwd、model 和 3 条 assistant usage；reader test 断言 session、model/directory、title、逐轮 token 总和与 agent/source 值。|
|AC-002|re_verified|fixture 中 input 100→90→80、output 40→10→30、cost .4→.1→.3；断言追加汇总为原值逐轮相加，不做差分。|
|AC-003|re_verified|每条 record 保留 message timestamp；测试按 token-stats UTC+8 小时桶公式断言跨小时记录分离，collector 将 records 交给既有 store 聚合链。|
|AC-004|re_verified|reader fixture 同时包含 user、无 usage assistant、checkpoint 文件、meta 文件和项目根 history；只产生 3 条主 session assistant records。|
|AC-005|re_verified|reader 将 cacheRead 从 raw input 中拆出并在 record/daily/session 汇总中单独保存；token 总量断言为 352，未重复计算 cache。|
|AC-006|trust_prior|公共 dashboard agent_totals、AgentFilter 和 source/agent union 明确由链式 t484 接线；t483 collector 已提供 source/agent runtime 值并进入既有 records 汇总入口。|
|AC-007|re_verified|`docs/findings/d059_commandcode_session_jsonl_format.md` 已作为来源，`docs/blueprint/decisions.md` ADR 032 固定 output/cost 回落与 input 每轮相加口径。|
|AC-008|re_verified|测试覆盖重复扫描空 delta、追加消息重算、序列化 scan-state 后 unchanged scan 以及重启后与 fresh full scan 收敛。|
|AC-009|re_verified|facts 保留 cost_usd，并断言 .4+.1+.3=.8；追加 .05 后 token/session 结果按精确逐轮和重算，无负值。|

coverage = 8 / 9

reviewed_scope: 8edf0f9a1d1564ba

verdict: PASS
