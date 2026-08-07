# Spike report

## 问题

collector 扫描结果中是否已持有可用的 session_id → 路径映射可直接落索引（spec t254 未知契约项）。若能复用，索引层不必再由 locator 扫描自建。

## 成功判据

- 确认 collector 扫描产物结构（是否含 session_id→file 映射）。
- 确认该映射的可访问性与可靠性：主进程 locator 能否直接读，反转后是否有歧义。

## 尝试

代码核查（`src/main/core/token-stats/`）：

- `manager.ts`：collector 经 `utilityProcess.fork(collector.js)` 运行（utility 进程，与主进程 IPC 通信，非主进程内）。
- `collector.ts`：`read_source` 内 `scan_session_jsonls` / `scan_kimi_wire_jsonls` / `scan_grok_updates` 返回 `new_state`（含 `SessionScanState.files: Map<file_path, {session_id, facts}>`）；`save_state` 经 `scan-state.ts` 持久化到 `<dataRoot>/token-stats-scan-state.json`。
- `scan-state.ts`：`SerializedScanBucket.files: Record<file_path, {session_id, facts}>`——磁盘上同样是 file→session_id 方向。
- `claude-reader.ts` `SessionScanState` 注释：files = 「Files that yielded usage data → resolved session id」。claude_code 一个会话跨多 jsonl（主 transcript `<id>.jsonl` + `<id>/subagents/agent-*.jsonl`，records 都带父 sessionId）。

## 证据

- `SessionScanState.files` 与 `SerializedScanBucket.files` 键为 file_path、值为 `{session_id, facts}`——**反向映射**（file→session），需反转才能得 session_id→path。
- claude_code 同一 session_id 可映射多个文件（主 transcript + subagents），反转后歧义；且 files 只含「有 usage 数据」的文件，parse 失败 / 空 session 的文件不在其中。
- collector 进程内存态主进程不可直接访问；磁盘 JSON 可读，但格式与 facts 结构耦合 collector 内部。

## 结论

collector 扫描**持有** file→session_id 映射且已持久化，但直接复用为 locator 索引有两处障碍：(1) 反向 + subagent 多文件歧义，需额外选主 transcript 逻辑；(2) 只覆盖「有 usage 数据」的会话，冷启动时未含全部会话文件。故索引层采用 **locator 扫描结果自建持久索引**（本 task 主方案）：新增 `session_id(+env) → file_path/extractor_kind` 持久表，locator 冷定位先查索引，命中即免扫描；未命中回退现有扫描并回填索引。collector scan-state 不作索引源（避免耦合），但 collector 扫描新会话时可通过已有事件链路触发索引更新（AC3）。

## 是否采纳

- 决定：否（不直接复用 collector 映射；采纳 locator 自建索引）
- 理由：反转歧义 + 覆盖不全，复用成本高于自建；自建索引语义与 locator 一致（含 extractor_kind、非 usage 文件）。
- 后续 task：t254
