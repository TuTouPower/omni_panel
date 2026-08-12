# Task spec

## 背景

web 版（`--cli serve`）添加账号走 `session.login` 打开 Electron 登录窗口。`SessionLoginRequest` 缺 `auto_close_ms` 字段，登录成功捕获 Cookie 后窗口不自动关闭；登录窗口在宿主 Electron、用户在浏览器，窗口白屏停留且 web 端无完成反馈（按钮停留在「正在打开登录窗口…」）。对照编辑路径 `handleCookieLogin` 显式传 `auto_close_ms:1500`。p145 登记，根因已由 Electron probe 验证 `opencode.ai/auth` 链路可达。

## 契约区

### 范围

- `SessionLoginRequest` 增加 `auto_close_ms` 字段（可选，语义对齐 `handleCookieLogin` 的 1500ms）。
- `session.login` / `session.refresh`（web 与桌面添加账号 / 刷新路径）登录成功捕获 Cookie 后按 `auto_close_ms` 自动关闭登录窗口。
- web 端 `session.login` 登录完成后 UI 给出明确完成/失败反馈（不再停留在「正在打开登录窗口…」）。
- 补 session-ipc / session-manager / web_login_section 三层测试。

### 非范围

- 不改 `handleCookieLogin`（编辑路径）既有行为。
- 不改 opencode_go connector 或 manifest。
- 不处理登录窗口内页面白屏的深层渲染问题（Electron 42 渲染 auth 页正常，白屏为登录后停留环节的伴生现象）。

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

- [ ] AC-001：`session.login` 调用方传入 `auto_close_ms` 时，`start_login` 捕获到 Cookie 后在该时长后自动关闭登录窗口。
- [ ] AC-002：`session.login` 调用方未传 `auto_close_ms` 时，登录窗口保持现状（不自动关闭），行为不回归。
- [ ] AC-003：web 添加账号路径（`session.login` 无 instance_id）登录成功（`saved:true`）后，UI 从「正在打开登录窗口…」恢复，不再无限停留。
- [ ] AC-004：`session.refresh` 同样支持 `auto_close_ms` 自动关闭（与 `session.login` 一致）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（单元 + 组件层）。

## 上下文区

- 来源：p145_web_login_add_account_no_auto_close（2026-08-12；根因：`SessionLoginRequest` 缺 `auto_close_ms`；Electron probe 验证 opencode.ai/auth 链路可达）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实 Electron 窗口自动关闭行为：单测用 mock 事件模拟，真实多跳转 OAuth 流依赖人工环境，不进自动测试。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- session-ipc.test.ts：mock `start_login`，断言 request 透传含 `auto_close_ms`。
- session-manager.test.ts：mock 事件，断言捕获 Cookie 后按 `auto_close_ms` 触发 `window.close()`。
- web_login_section.test.tsx：mock `session.login` 返回 `{saved:true}`，断言按钮状态恢复（不再停留「正在打开登录窗口…」）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- opencode.ai OAuth 登录后最终页可渲染（Electron probe 已验：Electron 42 加载 opencode.ai/auth → auth.opencode.ai/authorize 渲染「Continue with GitHub/Google」正常；白屏为登录后停留环节伴生，不属本 task）

### 风险与回退

- 风险：`auto_close_ms` 过短可能导致用户来不及完成登录。回退：默认仅当调用方显式传入才启用，既有调用方未传则行为不变；数值对齐编辑路径 1500ms 既有先例。
- 风险：自动关窗后若 Cookie 捕获时机有竞态。回退：关窗逻辑复用 `start_login` 既有 `auto_close_timer` 路径，捕获成功才起 timer。

### 依赖与约束

- 无前置依赖。改 `SessionLoginRequest` 类型涉及 `src/shared/types/ipc.ts`，需同步 web 桥 `usageboard-web.ts` 类型引用（不破坏现有调用方）。

### Finalization 时更新的 blueprint

- `无`（行为对齐既有编辑路径语义，不引入新架构约定）。
