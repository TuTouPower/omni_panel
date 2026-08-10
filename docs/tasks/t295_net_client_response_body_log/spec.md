# Task spec

## 背景

来源：Grok 全仓评审（2026-08-11）Issue 4。`src/main/core/connector/net-client.ts` JSON 解析失败时把完整响应体写入日志（`JSON parse failed for ...: ${text}`）。上游错误页/HTML 拦截页/类 JSON token 响应可含凭据、会话片段或 PII；scrubber 只脱敏已注册 vault 值，响应体不在其列。OAuth helper 已正确避免打 body（`oauth_helpers.ts` 120-123），connector HTTP 未对齐。

## 契约区

### 范围

- JSON 解析失败与 ≥400 响应日志改记 status、origin/path、content-type、body 长度（可选固定小红片段），不打全 body
- debug 级 ≥400 body 截断日志（`body_text.slice(0, 200)`）一并收敛（Issue 13 同文件同模式）

### 非范围

- 日志体系整体改造
- 响应体脱敏注册机制新增

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：JSON 解析失败日志不含响应体原文（单测断言日志不含 body 内容）
- [ ] AC-002：日志保留可诊断信息：status、请求 path、content-type、body 长度
- [ ] AC-003：debug 级 ≥400 日志不再输出 body 片段（长度或 hash 替代）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：捕获 logger 输出断言 body 不落日志。

## 上下文区

- 来源：Grok 全仓评审 Issue 4/13（net-client.ts:321/278）

### 测试策略

- 单测：构造含敏感串的失败响应，断言日志输出不含该串且含诊断字段
