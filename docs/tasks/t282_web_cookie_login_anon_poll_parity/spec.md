# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：`docs/pending.md` p106（t278 review Round 3 f006/f007 code minor + f007/f008 test minor）。核实（2026-08-10 合并后代码）：`WebLoginSection` 的 `cookieLogin`/`cookieLoginStatus` 轮询仅覆盖 web 编辑实例路径（有 `instance_id`）；web 添加账号（无 `instance_id`）仍走阻塞式 `session.login`，刷新/断请求丢捕获结果且与编辑路径行为分叉；两处轮询逻辑逐字重复；`startCookieLogin` 并发冲突与 120s 轮询超时分支无测试。属 web 认证对齐（t278）的收尾遗留。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- web 添加账号（无 `instance_id`）cookie 类连接器登录路径：对齐编辑实例的触发 + 状态轮询，或明确降级方案（登录期间勿刷新指引 + 手动粘贴兜底）
- 抽共享轮询实现供 `SettingsForm.handle_session_login` 与 `WebLoginSection` web 分支复用（去重）
- 补 `startCookieLogin` 并发冲突（CONFLICT）分支与 UI 轮询 120s 超时分支测试

### 非范围

- 桌面版 cookie 登录行为（AC7 保持）
- 认证日志脱敏（t278 已完成，不回归即可）
- 其他 provider 认证流程

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：web 添加 cookie 类账号发起登录后，刷新/中止请求不丢捕获结果（落 vault 或明确降级指引可恢复）
- [ ] AC2：`SettingsForm` 与 `WebLoginSection` 的 cookie 登录轮询共用同一实现，行为与超时/冲突文案一致
- [ ] AC3：重复触发登录返回可读中文冲突提示，不出现英文原始消息
- [ ] AC4：轮询超时（120s）给出可读提示
- [ ] AC5：桌面版 cookie 登录行为与现状一致（回归）

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（AC1 用单测/集成 mock 捕获链路；AC2-AC4 为 renderer 单测；AC5 走既有 electron e2e 回归）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：`tests/unit/renderer/components/`（WebLoginSection/SettingsForm/WebLoginForm 添加账号路径轮询与降级）；`tests/unit/ipc/auth-ipc.test.ts` 补 CONFLICT 分支（`is_login_in_progress` 返回 true 断言不触发 start_login）
- 集成：`tests/integration/local-api/server.test.ts` 匿名 cookie 登录链路（如实现需要）
- 超时分支：`vi.useFakeTimers()` 推进超 `COOKIE_LOGIN_POLL_TIMEOUT_MS`

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：添加账号路径改动影响新增账号流程；共享抽离引入行为分叉
- 回退：纯新增/重构路径；降级方案（指引 + 手动粘贴）不阻断功能

### 依赖与约束

- 认证面（cookie 登录）：review_level=full
- 密钥规则：cookie 落 vault，日志脱敏沿用 t278

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：web 认证链路条目的添加账号路径补充（如实现变更）
