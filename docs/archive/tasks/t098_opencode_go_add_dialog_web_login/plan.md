# Task plan

## 关键设计决策

`session.login` 当前强依赖 `instance_id`（写 vault `keyFor(instance_id, "SESSION_COOKIE")` + partition 隔离 `persist:session-login:<instance_id>`）。添加弹窗里实例未保存，需选一条路：

- **方案 A**：进 SessionForm 即生成临时 `instance_id`（UUID），点「网页登录」传给 session.login，主进程写 vault 用临时 id；保存时主进程把临时 vault key 迁移到正式 `instance_id`；取消时清理临时 key。
    - 优点：复用现有 session-manager 不动。
    - 缺点：需新增 vault 迁移 + 取消清理逻辑；取消弹窗时清理时机分散。
- **方案 B（推荐）**：session.login 支持不传 `instance_id`，捕获 Cookie 通过 IPC 返回值直接回传 renderer，由 renderer 填进表单字段，保存时随表单写 vault。
    - 优点：语义直观，登录结果立即可见于表单，取消弹窗零副作用；对既有调用方（SettingsForm）无破坏（`instance_id` 仍传时行为不变）。
    - 缺点：需扩展 schema（`SessionLoginResult` 加可选 `cookie` 字段；`instance_id` 可空）；session-manager 允许 `instance_id` 缺省时跳过 vault 写入。

**采用方案 B**。临时 partition 命名 `persist:session-login:anonymous:<uuid>`，一次性使用。

## 步骤与验证

1. 扩展 `SessionLoginRequest` schema：`instance_id` 可空；`SessionLoginResult` 增加可选 `cookie: string` 字段 → 验证：相关 schema 单测通过。
2. `session-manager.start_login` 支持 `instance_id` 缺省：跳过 vault 写入，把捕获 Cookie 通过返回值回传；partition 用临时名 → 验证：`session-manager` 单测覆盖新分支。
3. `session-ipc.handleSessionLogin` 放行 `instance_id` 缺省场景 → 验证：单测覆盖。
4. `AddAccountDialog` 的 `SessionForm`（opencode_go 分支）加「网页登录」按钮：调 `window.usageboard.session.login({ provider, login_url, cookie_names })` 不传 `instance_id`，成功后把 `result.cookie` 填进 `cookie` state → 验证：组件单测 mock session.login 断言 setState。
5. 错误处理：登录失败 / 超时 / `saved=false` 时在表单显示错误文案 → 验证：单测断言错误提示渲染。
6. 手工黑盒：实际打开弹窗 → 点「网页登录」→ 完成 opencode.ai 登录 → 关闭窗口 → Cookie 自动填入 → 保存 → 设置页确认账号 → 手动刷新拉取用量 → 验证：手工走通全流程。
7. `pnpm test` 全量。

## 风险与回退

- 风险：临时 partition 残留 Cookie 影响下次登录；cancel 弹窗后 partition 数据残留。
    - 缓解：partition 名含 UUID，一次性使用；不污染既有 `persist:session-login:<instance_id>` 命名空间。
- 风险：扩展 `SessionLoginRequest` 破坏既有调用方（SettingsForm）。
    - 缓解：`instance_id` 改可选但保留传值时原行为；旧调用方编译期不变。
- 回退：revert commit；不影响设置页既有网页登录。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：session login 支持无 instance_id 的匿名捕获流程（如写入）。
- `docs/blueprint/conventions.md`：无新增约定。
