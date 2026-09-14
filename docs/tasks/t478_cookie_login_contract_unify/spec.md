# Task spec

## 背景

Cookie 登录有阻塞版与启动版两套契约（d058）：

- 桌面 `handleCookieLogin`（`src/main/ipc/auth-ipc.ts:45-90`）同步阻塞到 session-manager 登录窗口关闭，返回 `{saved, reason?}`；`AUTH_COOKIE_LOGIN` IPC 直接返回它（`auth-ipc.ts:231-237`）。
- LocalAPI/Web 走 `startCookieLogin`（`auth-ipc.ts:92-127`，经 `server.ts:942`）立即返回 `{started:true}`，冲突返回 `CONFLICT`，结果经 `cookieLoginStatus`（`auth-ipc.ts:129-146`）轮询，状态为 `{in_progress, saved, error?}`。
- 前端 `poll_cookie_login`（`src/renderer/lib/cookie_login_poll.ts:93-124`）被迫用 `result.started` 分支兼容两套；错误码与文案两端不同（`INTERNAL_ERROR` 英文 vs `CONFLICT` 中文）。

本仓核实调用方（2026-09-14）：`poll_cookie_login` 仅由 `SettingsForm.tsx:245` 与 `WebLoginSection.tsx:48` 调用；它是 `auth.cookieLogin`/`cookieLoginStatus` 的唯一调用方，且已按 `started` 分支处理。不存在必须依赖阻塞返回 `saved` 的调用方。`session.login`（Web 无实例的加号流程）是另一条能力，不在本契约内。

## 契约区

### 范围

- 统一 cookie 登录为**单一非阻塞契约**：桌面与 Web 都走「启动 + 轮询状态」。
    - 启动返回统一结构 `{started: true}`；已在登录中时返回统一冲突结构 `{started: false, conflict: true}` 与统一错误码/文案，不再一端阻塞返回 `saved`。
    - 桌面 IPC `AUTH_COOKIE_LOGIN` 改为调用 `startCookieLogin`（非阻塞），删除阻塞返回 `{saved}` 的路径。
- **状态生命周期固定**：`cookieLoginStatus` 返回 `{in_progress, saved, state, error?}`，`state` ∈ `{running, succeeded, canceled, failed, timeout}`：
    - `running`：登录进行中（`in_progress: true`）。
    - `succeeded`：捕获并落库成功（`saved: true`）。
    - `canceled`：用户关闭登录窗口未取到 cookie（对应现 `no_cookie`）。
    - `failed`：登录态无效或内部错误（对应现 `invalid_cookie` / `INTERNAL_ERROR`）。
    - `timeout`：超过登录窗口等待上限。
    - `in_progress=false` 时 `state` 必为终态之一；`error` 仅在 `failed` 时存在。
- 统一错误码与用户可读文案（冲突、超时、取消/无 cookie、失败），两端一致。
- 更新前端 `cookie_login_poll`：删除双契约 `result.started` 兼容分支，改为按统一契约启动 + 轮询生命周期；终态映射到既有中文提示。
- **两端不新增认证**：cookie 登录沿用 t473 的共享权限基线，不引入 token；Web 触发登录窗口属宿主（Electron 主进程）行为，Web 只调用宿主接口。

### 非范围

- 不改 cookie 抓取 / session-manager 实现细节。
- 不改 OAuth device flow（grok/kimi，另一件事）。
- 不改 Web 无实例的 `session.login` 加号流程（其阻塞语义与 `auto_close_ms` 属既有另条能力，不在本契约）。
- 不新增登录凭据或认证校验（→ t473）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-006：桌面与 Web 调 `auth.cookieLogin` 都立即返回同一非阻塞形状 `{started:true}`（或冲突时 `{started:false, conflict:true}`），不再一端阻塞返回 `saved`。
- [ ] AC-007：并发冲突场景两端返回同一错误码与同一用户可读文案。
- [ ] AC-008：`cookieLoginStatus` 在两端返回同一生命周期结构；成功、取消、失败、超时分别映射到 `succeeded`/`canceled`/`failed`/`timeout`，进行中为 `in_progress:true` + `running`。
- [ ] AC-009：前端 `cookie_login_poll` 中针对双契约的 `result.started` 兼容分支被删除，改为统一启动 + 轮询生命周期。
- [ ] AC-010：两端调用路径均无新增认证/凭据要求；Web 触发登录由宿主执行（Web 端不直接开窗）。
- [ ] [deploy] AC-011：真实网页登录窗口在桌面与 Web 端都能完成一次登录并落库；真实超时/取消分支由人工触发。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-006..010：可自动测试（mock session-manager + 双入口 + 状态机单测）。
- AC-011：需真实网页登录窗口与真实超时/取消，标 `[deploy]`。

## 上下文区

- 来源：日常审计 d058（2026-09-14）；用户 2026-09-14 裁定统一非阻塞契约

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实第三方站点登录流程的每种分支：以 mock 覆盖，站点真实行为标 deploy。
- Web 无实例 `session.login` 加号流程：不在本契约范围，沿用既有测试。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock session-manager 的启动、冲突、成功、取消、失败、超时；断言两端返回形状、生命周期状态迁移与前端轮询去掉分支后的行为。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（阻塞调用方已在本仓核实：`auth-ipc.ts:231-237` 桌面阻塞与 `cookie_login_poll.ts:93-124` 唯一调用方均支持/可改为非阻塞；无依赖 `saved` 同步返回的调用方）。

### 风险与回退

- 风险：改契约影响既有桌面登录 UI 流程。
- 回退：先统一返回形状与错误码，保留桌面内部等待可选；但**不得**保留违背统一非阻塞契约的等待契约（即桌面不得再同步阻塞到 `saved`）——如回退则整体回退本 commit。

### 依赖与约束

- 前置：无。
- 与 t473 一致：两端同权限、无认证；Web 登录窗口由宿主执行。
- 约束：状态机终态必须可区分成功/取消/失败/超时，避免前端用字符串匹配猜测。

### Finalization 时更新的 blueprint

- `docs/specs/connector-runtime.md` 或 auth spec：cookie 登录单一非阻塞契约与状态生命周期。
- `docs/specs_index.md`：挂 t478。
