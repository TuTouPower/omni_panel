# Task review t484（reviewer_focus: 测试）

- task：`t484_commandcode_session_history`
- spec：`docs/tasks/t484_commandcode_session_history/spec.md`
- diff_anchor：`b5d4949f6125fdeed0a789b217983a76b6ba2b54`
- target：`git diff b5d4949f6125fdeed0a789b217983a76b6ba2b54`
- round：1

## Findings

本轮零 finding。

独立重跑了 Command Code extractor、resume、locator、subscription、IPC、Web bridge、
SessionPane、panels wiring、palette 和 token-stats reader 相关集合。新增边界测试没有
使用 `.skip`/`.only` 或放宽断言；fixture 使用临时 projects 目录，不读取真实用户会话。
测试同时验证了全量/增量结果、合法消息 id、首末 user、真实 watcher 追加、缓存替换、固定
host argv、Web HTTP bridge 和桌面 IPC commandcode extractor kind。

最终受影响定向集合为新增/修改路径通过；SessionPane 测试保留仓库既有 React `act` warning，
不影响断言。LocalAPI 真实集成测试在 setup 阶段需要 `better-sqlite3` native binding，
当前环境无法加载；同一原因也造成全量直接 Vitest 的 SQLite failures。`pnpm test` 更早在
无 TTY 的 pnpm 依赖状态检查阶段中止，未进入 Vitest。

## 结论

- AC-001～004 与 AC-008 有真实临时文件 fixture 和逐项行为断言。
- AC-007 经过生产 `subscribe` + watcher 路径，不是只直接调用 extractor。
- AC-009～010 覆盖 host executor、桌面 IPC、Web LocalAPI 请求和 messagesUpdated 路由；
    真实 SQLite-backed HTTP server 复验留给具备 native binding 的环境。
- 没有发现恒真断言、隐式 skip、只测 mock 不测生产桥接或为掩盖失败而改写既有测试的问题。

## AC 复验方式

|AC|类别|证据|
|---|---|---|
|AC-001|re_verified|`commandcode-extractor.test.ts` 全量 fixture 断言 user/assistant 文本、过滤块、顺序、timestamp。|
|AC-002|re_verified|追加 JSONL 后增量结果只含新消息且 id 从旧合法计数继续。|
|AC-003|re_verified|首/末摘要测试含 tool-source user 干扰并断言真人文本。|
|AC-004|re_verified|locator 临时目录 exact filename/missing/traversal 测试通过。|
|AC-005|re_verified|Command Code wiring、palette、schema 和 TokenStatsView 接线测试通过。|
|AC-006|re_verified|独立 panels wiring 断言 display/slug/abbrev/logo/accent/resume。|
|AC-007|re_verified|subscription-service Command Code watcher 真实追加回调测试通过。|
|AC-008|re_verified|边界类别分别有测试：半行多字节、非法 JSON、未知块、重写、畸形 timestamp。|
|AC-009|re_verified|resume executor、IPC handler、Web resume、SessionPane host click 测试通过。|
|AC-010|re_verified|IPC/Web commandcode subscribe 以及共享 messagesUpdated 分发测试通过；LocalAPI 集成被环境 native binding 阻塞。|

coverage = 10 / 10

reviewed_scope: 606f3224c61cdee9

verdict: PASS
