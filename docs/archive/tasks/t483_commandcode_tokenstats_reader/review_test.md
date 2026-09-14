# Task review t483（reviewer_focus: 测试）

- task：`t483_commandcode_tokenstats_reader`
- spec：`docs/tasks/t483_commandcode_tokenstats_reader/spec.md`
- diff_anchor：`d1e55a55de216183b7dc7b18dd119902be7a49c7`
- target：`git diff d1e55a55de216183b7dc7b18dd119902be7a49c7`
- round：1

## Findings

本轮零 finding。

独立重跑了 `commandcode-reader.test.ts`、`paths.test.ts`、`collector.test.ts` 和
`collector-state.test.ts`：4 files / 83 tests 全部通过。测试没有使用 `.skip`/`.only`
或放宽断言；reader 使用真实临时目录和 JSONL fixture，覆盖 assistant 过滤、session
header、title、directory、model、缓存归一、小时 timestamp、checkpoint/history 排除、
mtime 增量、追加重算和序列化重启收敛。collector/path/state 测试覆盖 source 注册、
平台路径、mock reader 转发、状态保存恢复与清理。

完整直接 Vitest 的结果为 `3718 tests`：`3343 passed`、`9 skipped`、`366 failed`；
失败集中在环境缺少 `better-sqlite3` native binding，未落在新增 Command Code 定向
测试。`pnpm test` 同样在依赖状态检查阶段受 non-TTY/native 环境限制，属于验证环境
阻塞，不是测试实现 finding。

## 结论

- fixture 的 usage 数值是可复算的，断言同时检查 normalized input、cache read/write、
    output、calls、record token 总量与 facts cost，能区分每轮相加和累计差分。
- 跨小时断言使用生产侧 UTC+8 hour_start 公式，而非仅检查记录数量；追加和重启测试
    比较完整 session/daily/records 结果，避免只验证新增一行。
- checkpoint、meta、根 history 和非 assistant/无 usage 的排除均由输入 fixture 反向证明。
- t484 负责的 dashboard/store 公共枚举接线留作 trust prior；t483 已覆盖其 collector
    输入与 source runtime 值，避免在两个 task 重复注册同一公共契约。

## AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|re_verified|reader fixture 断言 session/model/directory/title 和逐轮 token 汇总；83 个定向测试通过。|
|AC-002|re_verified|相邻 usage 的 output、cost、input 均包含回落，追加后的 session 汇总精确为全量逐轮和。|
|AC-003|re_verified|3 条 records 跨两个 timestamp 小时，按生产 UTC+8 hour_start 公式得到两个桶；collector 既有 records→store 路径未改写 timestamp。|
|AC-004|re_verified|真实临时 projects 目录含 checkpoint、meta、根 history、user 和无 usage 行，断言只读有效 assistant JSONL。|
|AC-005|re_verified|缓存 read 从 input 拆分，record token 总量与 input/cache 字段分别断言，避免双计。|
|AC-006|trust_prior|dashboard agent_totals/AgentFilter 属 t484；t483 的 collector mock 与状态测试确认 commandcode source 已参与采集入口。|
|AC-007|re_verified|实现 review 复核 d059 与 ADR 032；测试 fixture 将回落口径固定为可复算的逐轮值。|
|AC-008|re_verified|重复扫描返回空 delta，mtime 变更触发全 session recount，序列化 state 恢复后与 fresh scan 深比较结果一致。|
|AC-009|re_verified|facts cost 断言 .8，追加 turn 后 session/record 断言包含 .05 对应的新增数值，未出现负差分。|

coverage = 8 / 9

reviewed_scope: 8edf0f9a1d1564ba

verdict: PASS
