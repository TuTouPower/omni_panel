# Task review t067（reviewer_focus: 测试）

- task：`t067_ipc_renderer_path_whitelist`
- spec：`docs\tasks\t067_ipc_renderer_path_whitelist/spec.md`
- diff_anchor：`6f0801a46a4499d0321476155168e0049491034b`
- target：`git diff 6f0801a46a4499d0321476155168e0049491034b`
- round：1
- reviewed_at：2026-07-24 00:00 UTC+8

## Findings

无。

## 结论

- 本轮新发现：0 条
- 总体判断：精确比对正反例覆盖 AC，全局状态重置可靠，测试可信无危险模式。

### 评估要点

**AC 覆盖（spec：非 rendererIndexPath 的 file:// 拒；helpers 签名改 + 全 IPC 适配 + 测试）**

- `helpers.test.ts:29-34` 「rejects file:// sender with different pathname (same index.html name)」：senderFrame.url = `file:///D:/attacker/index.html`，rendererIndexPath = `D:\app\out\renderer\index.html`。经 `pathToFileURL + new URL().pathname` 归一后，`/D:/attacker/index.html` ≠ `/D:/app/out/renderer/index.html`，精确验证「同名 index.html、不同路径拒」的核心 AC。✓
- `helpers.test.ts:22-27` accept 正例：`file:///D:/app/out/renderer/index.html#setting` 验证 hash 不干扰 pathname 比对。✓
- helpers 签名改：`set_renderer_index_path` 已导入并在 beforeEach/afterEach 中真实调用。✓
- 全 IPC 适配：实现侧在 `src/main/index.ts:118` 启动时一次性设置全局 `renderer_index_pathname`，所有 IPC handler 共享同一 `assert_valid_sender` 校验路径，单元层已覆盖行为。集成层覆盖属可选增强（见结论段提示），非强制。

**全局污染防护**

- t067 describe 的 `afterEach` 调用 `set_renderer_index_path("")` → 实现内分支判空后置 `renderer_index_pathname = null`（`helpers.ts:20-23`）。
- 文件中后续 describe（`assert_valid_sender` 原有测试、`assert_setting_route`）在 `renderer_index_pathname = null` 时走 `endsWith index.html` fallback 路径，与 t067 前行为一致，不受污染。✓
- 反向也无污染：原有 describe 未设置 rendererIndexPath，全局默认 `null`，t067 describe 的 beforeEach 在自己每个 test 前重新设置。✓

**测试可信**

- 真实调用 `set_renderer_index_path` 与 `assert_valid_sender`，无内部函数 mock；Event 对象仅做类型 cast，senderFrame.url 是输入数据。✓
- 断言 `toThrow("Invalid file:// sender path")` / `not.toThrow()`：错误消息子串验证 + 抛错行为，非弱化。✓
- 无异步、无阈值、无 race。

**危险模式扫描**（逐条）

- 恒真断言 / 删除或反转 expect / 注释断言 / 弱化断言 / 删测试 / `.skip` 或 `.only` / `@ts-ignore` / mock 内部 / 阈值掩盖 / 条件跳过 / 程序赋值替代交互 / 存在即通过：均无命中。

**范围外提示（不进 finding 表）**

- IPC 集成层（如 `popup-ipc.test.ts` 或 handler 级 e2e）未显式验证 file:// 攻击下具体 handler 返回错误，但因实现采用全局变量 + 共享 `assert_valid_sender` 机制，helpers 单元层已等价覆盖行为。如后续出现「某个 handler 未调用 assert_valid_sender」类回归，建议补集成层测试。
- Windows 大小写敏感性 / 跨平台 pathname 归一属实现层潜在风险，归 code reviewer。

verdict: PASS
