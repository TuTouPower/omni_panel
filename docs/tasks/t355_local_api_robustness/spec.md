# Task spec

## 背景

local-api 服务端多处健壮性缺口：(1) 413 超限后 `req.pause()` 未 resume/destroy，keep-alive 连接悬死；(2) 同一 subscriber_id 重复 subscribe 覆盖订阅表但未注销旧 watcher，旧 on_update 错路由推送且 watcher 泄漏；(3) handle_request 全局 catch 无 headers-sent 防护；(4) serve_static 对畸形 percent 编码抛 URIError 回 500；(5) serve_static 非 .html 资产不设缓存头，每次全量读盘。

## 契约区

### 范围

- 413 后 `req.resume()` 丢弃剩余数据或响应后 `res.destroy()`。
- subscribe 前若存在旧 sub 先 `service.unsubscribe` 旧 loc，或对重复 id 返回 409。
- handle_request catch 内先判 `res.headersSent`，已发送则 `res.destroy()`。
- serve_static 的 decode 包 try/catch，失败回 400。
- 非 .html 资产加 `Cache-Control: public, max-age=31536000, immutable`。

### 非范围

- 不改 SSE/订阅语义。

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

- [ ] AC-001：413 超限后连接被正确消费或关闭，keep-alive 连接不悬死。
- [ ] AC-002：重复 subscriber_id 不泄漏旧 watcher（先 unsubscribe 或返回 409）。
- [ ] AC-003：畸形 percent 编码 URL 返回 400，非 500。
- [ ] AC-004：非 .html 资产响应带 immutable 缓存头。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：server 单测注入超限 body、重复订阅、畸形 URL、静态资产请求。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`server.ts:193`、`:555-571`、`:1082`、`:657`、`:656-690`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- server 单测：表驱动注入上述边界输入，断言状态码与连接清理。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：headers-sent 防护改变异常传播路径。
- 回退：仅加 `res.headersSent` 判断，已发送则 destroy，不改正常路径。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
