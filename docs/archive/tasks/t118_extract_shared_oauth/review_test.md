# Task review t118（reviewer_focus: 测试）

- task：`t118_extract_shared_oauth`
- spec：`docs/tasks/t118_extract_shared_oauth/spec.md`
- diff_anchor：`897f96726b9445aab02515ac9446527911cdf70c`
- target：`git diff 897f96726b9445aab02515ac9446527911cdf70c`
- round：1
- reviewed_at：2026-07-26 14:20 UTC+8

## 改动性质

纯 refactor（f003 hook 提取）：新建 `src/renderer/hooks/use-device-login.ts` 共享 hook，`useGrokDeviceLogin`/`useKimiDeviceLogin` 改薄封装。**无测试文件新增/修改/删除**。spec 验收标准 4 条测试相关项靠既有测试作回归网：

- `tests/unit/renderer/components/forms/oauth_device_form.test.tsx`（7 用例，vendor=grok + vendor=kimi 双路径）
- `tests/unit/auth/grok_oauth_manager.test.ts`、`tests/unit/auth/kimi_oauth_manager.test.ts`（manager 测试，本 task 不动 manager）

## Findings

无。

### 共享 hook 行为覆盖核对

`useDeviceLogin(namespace, instance_id)` 相对原 grok/kimi hook 仅参数化 `window.usageboard.<namespace>`（`get_api(namespace)`）与变量重命名（`start` → `login_start` 避开外层 `start`），其余控制流（active_ref/mounted_ref 守卫、phase 状态机、cancel-on-unmount、polling → on_save 链路、error 路径）逐行对应。回归网对其关键行为有覆盖：

| 共享 hook 行为                                                                      | 覆盖用例                                                                                                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `window.usageboard.grok` namespace 路由                                             | `oauth_device_form.test.tsx:58/76/110/138/162/189`（6 用例 vendor=grok）                                                    |
| `window.usageboard.kimi` namespace 路由                                             | `oauth_device_form.test.tsx:211`（vendor=kimi，断言 `kimi.login_start` 被调用）                                             |
| `login_start` → `login_poll(instance_id, device_code, interval, expires_at)` 参数链 | `:98-104`、`:257-262`（双 namespace 都验证调用参数）                                                                        |
| polling 成功 → on_save 透传 secrets（grok 1 secret / kimi 3 secret）                | `:110-136`（grok `{OAUTH_TOKEN}`）、`:211-272`（kimi `{OAUTH_TOKEN, OAUTH_REFRESH_TOKEN, OAUTH_EXPIRES_AT}`，3 key 全断言） |
| polling 失败错误路径                                                                | `:138-160`                                                                                                                  |
| on_save reject 错误路径                                                             | `:162-187`                                                                                                                  |
| `verification_uri_complete=null` fallback                                           | `:189-209`                                                                                                                  |
| `login_cancel` cleanup-on-unmount                                                   | 无直接用例（重构前 grok/kimi hook 同样无直接 cleanup 测试，行为不变，非本 task 引入的回归）                                 |

namespace 路由是本 task 唯一的新行为变化点（其余为机械提取），双路径用例已直接验证。

### useDeviceLogin 直接单测评估

不补。理由：

- 重构前 `useGrokDeviceLogin`/`useKimiDeviceLogin` 也无直接单测（仓库 grep 无 `useGrokDeviceLogin.test` / `useKimiDeviceLogin.test`），仅通过 OAuthDeviceForm 公共组件层覆盖。
- 共享 hook 是内部模块，OAuthDeviceForm 已是更高层且更贴近用户可观察行为的覆盖（按 spec「测试可信：断言用户可感知的行为」原则）。
- 补直接单测会与既有 7 用例重复断言 `login_start`/`login_poll`/`on_save` 链路，无增量覆盖。
- spec 验收标准 `useGrokDeviceLogin/useKimiDeviceLogin 单测（含 OAuthDeviceForm）全绿` 以 OAuthDeviceForm 为验收点，未要求 hook 层直接单测。

### 危险模式扫描

逐条扫描，无命中：

- 恒真断言 / 删 expect / 反转断言 / 注释 expect：无。
- 弱化断言（`toBe` → `toContain`/正则/`>=`/`toBeTruthy`）：无；既有用例全部用 `toHaveBeenCalledWith` + 精确 `toBe` 断言 secrets 对象。
- 删测试 / 删 it/describe：无（diff 仅 task.md / tasks_index.json / 3 个源码 hook 文件）。
- `.skip` / `.only` / `pytest.mark.skip` / `@Ignore`：无。
- 静默错误（test 文件 `eslint-disable`/`@ts-ignore`/`# type: ignore`）：无。源码 `use-device-login.ts:51` 有 `// eslint-disable-next-line @typescript-eslint/no-non-null-assertion`，**在源码非测试文件**，危险模式（明确限定 test 文件）不命中；code reviewer 范围。
- mock 误用：mock 仅落在系统边界 `window.usageboard.{grok,kimi}`（preload IPC shape），未 mock 被测 hook 本身或内部函数。
- 阈值掩盖：无 timeout/重试/容差增大。
- 条件跳过弱化断言：无。
- 程序赋值替代真实交互：无；用例全部用 `userEvent.click("开始登录")` 触发真实交互。
- 存在即通过：无；每个用例都断言行为（调用次数 / 调用参数 / secrets 内容 / 错误消息显示），未用 `toBeVisible` 当 AC 证据。

### 红灯归因

本 task 无测试改动，不适用。

## 结论

- 本轮新发现：0 条
- 总体判断：本 task 为行为不变 refactor（hook 提取），无测试改动合法；既有 OAuthDeviceForm 7 用例（vendor=grok 6 + vendor=kimi 1）对共享 hook 唯一新行为（namespace 路由）有双路径直接覆盖，对完整链路（start → poll → on_save secrets）与错误路径覆盖充分；危险模式无命中；manager 测试不动（f004 遗留，本 task 范围外）。

verdict: PASS
