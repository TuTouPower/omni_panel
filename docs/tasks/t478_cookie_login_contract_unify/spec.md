# Task spec

## 背景

Cookie 登录有阻塞版与启动版两套契约（d058）：桌面 `handleCookieLogin`（`src/main/ipc/auth-ipc.ts:45`）同步阻塞至窗口关闭（session-manager 120s）返回 `{saved, reason?}`；LocalAPI 走 `startCookieLogin`（`auth-ipc.ts:92`，经 `server.ts:942`）立即返回 `{started:true}` + 状态轮询，冲突返回 `CONFLICT`。前端被迫在 `cookie_login_poll.ts:101-124` 用 `result.started` 分支兼容两套。错误码与文案两端不同（`INTERNAL_ERROR` 英文 vs `CONFLICT` 中文）。

## 契约区

### 范围

- 统一 cookie 登录为单一契约：桌面与 Web 都走「启动 + 轮询状态」，返回形状 `{started, conflict?}` 与错误码一致。
- `cookieLoginStatus` 轮询在两端行为一致；桌面不再阻塞等待。
- 统一错误码与文案（冲突场景）。
- 更新前端 `cookie_login_poll` 去掉双契约分支。

### 非范围

- 不改 cookie 抓取/session-manager 实现。
- 不改 OAuth device flow（另一件事）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：桌面与 Web 调 `auth.cookieLogin` 都返回同一形状（`{started:boolean}` 或统一结构），不再一端阻塞返回 `saved`、一端立即返回 `started`。
- [ ] AC-002：并发冲突场景两端返回同一错误码与用户可读文案。
- [ ] AC-003：登录成功后两端都能通过同一 `cookieLoginStatus` 轮询观察到结果（含成功与取消）。
- [ ] AC-004：前端 `cookie_login_poll` 中针对双契约的兼容分支被删除。
- [ ] [deploy] AC-005：真实网页登录窗口在桌面与 Web 端都能完成一次登录并落库。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001..004：可自动测试（mock session-manager + 双入口）。
- AC-005：需真实网页登录窗口，标 `[deploy]`。

## 上下文区

- 来源：日常审计 d058（2026-09-14）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实第三方站点登录流程的每种分支：以 mock 覆盖，站点真实行为标 deploy。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock session-manager 的启动/冲突/成功/取消；断言返回形状与状态轮询。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 桌面端是否有必须阻塞的调用方（如某 UI 流程依赖返回 `saved`）：UNVERIFIED-BLOCKING，实施期读调用点确认。

### 风险与回退

- 风险：改契约影响既有桌面登录 UI 流程。
- 回退：先统一返回形状与错误码，保留桌面内部等待可选。

### 依赖与约束

- 前置：无。

### Finalization 时更新的 blueprint

- `docs/specs/connector-runtime.md` 或 auth spec：cookie 登录契约。
- `docs/specs_index.md`：挂 t478。
