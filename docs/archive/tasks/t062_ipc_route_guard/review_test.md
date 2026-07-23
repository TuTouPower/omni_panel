# Task review t062（reviewer_focus: 测试）

- task：`t062_ipc_route_guard`
- spec：`docs\tasks\t062_ipc_route_guard/spec.md`
- diff_anchor：`428e5b46d2f98c7ce056b5741ca051a50d3be4c9`
- target：`git diff 428e5b46d2f98c7ce056b5741ca051a50d3be4c9`
- round：1
- reviewed_at：2026-07-23 20:14 UTC+8

## Findings

### t062_test_f001 - AC 1「CONFIG_GET_SECRETS 非 setting route 被拒」缺整合层测试

- 严重度：important
- 位置：`tests/unit/ipc/helpers.test.ts:180-207`（仅单元层）；`tests/unit/ipc/config-ipc.test.ts` 无对应整合测试
- 问题：AC 1（spec.md:20）明确点名「非 setting route 调 CONFIG_GET_SECRETS 被拒」。`assert_setting_route` 只在 `helpers.test.ts:180-207` 被独立单测（3 例：`#setting` 允、`#usage` 拒、空 hash 拒）；`config-ipc.test.ts` 中所有 CONFIG_GET_SECRETS 用例（如 `handleConfigGetSecrets returns vault plaintext`，line 108-117）直接调 `handleConfigGetSecrets`，绕过 `registerConfigIpc` 注册的 handler wrapper，因此 `config-ipc.ts:434` 的 `assert_setting_route(e)` 装配点无任何测试覆盖。对照同文件 `rejects CONFIG_GET from an invalid sender`（line 844-855）已为 CONFIG_GET 的 `assert_valid_sender` 装配提供了整合层反例，CONFIG_GET_SECRETS 的 route 守卫缺少对称用例。回归场景：若有人从 `config-ipc.ts:434` 删除 `assert_setting_route(e)` 一行，测试套件全绿——security-critical 装配无测试护栏。
- 建议：补一条整合测试：`registerConfigIpc` 后取 `config:get_secrets` handler，用 `{ senderFrame: { url: "file:///index.html#usage" } }` 调用，断言 throw `"only allowed from setting route"`；另用 `#setting` 正例断言不抛。

### t062_test_f002 - `assert_setting_route` 子串匹配边界未覆盖

- 严重度：minor
- 位置：`tests/unit/ipc/helpers.test.ts:180-207`；被测实现 `src/main/ipc/helpers.ts:63`
- 问题：实现用 `hash.includes("setting")`（helpers.ts:63），测试只覆盖 `#setting`（允）、`#usage`（拒）、空 hash（拒）。AC 1 要求「非 setting route 被拒」，但 `#settings` / `#settingx` / `#abcsetting` 等含子串 "setting" 的 hash 会被放行，测试未验证这些是否属于 setting route。code comment（helpers.ts:54）标注 route 为 `#setting`，未说明子串匹配是有意为之（如支持 `#setting/account` 子路由）。security-sensitive 函数（控制明文密钥访问）的边界用例缺位。
- 建议：补一条反例（如 `#settingx` 或 `#abcsetting`）显式断言期望行为——若应拒则暴露实现过宽（交 code reviewer）；若应允（子路由设计）则在测试中注明意图，锁住契约。

## 结论

- 本轮新发现：2 条（important × 1，minor × 1）
- I15 覆盖（`tests/unit/ipc/helpers.test.ts:159-178`）：file:// 非 index.html 拒 + dev_url 前缀相似拒，正反例到位，无反模式。
- I14 覆盖：guard 函数单元层正反例齐；整合层缺反例（见 f001）。
- `config-ipc.test.ts` mock URL 改动（`file://settings` → `file:///index.html#setting`，3 处 CONFIG_DUPLICATE 用例 + 1 处 CONFIG_GET 用例）：CONFIG_DUPLICATE 三处为必要适配（旧 URL `file://settings` 在新 `assert_valid_sender` 下不通过），CONFIG_GET 一处（line 151）属顺带修改（`file:///index.html` 本已通过新校验，加 `#setting` 不影响断言），不构成弱化。
- 无恒真断言、删 expect、`.skip`、`@ts-ignore`、mock 误用等危险模式命中。
- 总体判断：I15 到位；I14 guard 逻辑到位但装配层无测试护栏，security-critical 路径存在回归风险。

verdict: FAIL

## Round 2 (2026-07-23 20:22 UTC+8)

### 前轮 finding 复核

- **t062_test_f001（CONFIG_GET_SECRETS 非 setting route 缺整合测试）— 已修**：`tests/unit/ipc/config-ipc.test.ts:857-874` 新增 `rejects CONFIG_GET_SECRETS from non-setting route (I14)`，走 `registerConfigIpc(deps)` → 取 `config:getSecrets` handler → 用 `file:///index.html#usage` 调用并断言 `toThrow("only allowed from setting route")`。装配点（`config-ipc.ts:434` 的 `assert_setting_route(e)`）现被覆盖：删除该行即测试红（handler 会进入 `logged` 内部回调，对 `"instance-1"` 未知实例返回 fail 结果而非 throw）。非弱化形式——异常类型与消息子串均具体。R1 建议「另用 #setting 正例」未采纳，但 AC1 文本只要求「被拒」正反已由单元层 `allows #setting hash`（helpers.test.ts:181）补足，不构成遗留。
- **t062_test_f002（hash.includes 子串边界未覆盖）— 已修**：实现侧 `helpers.ts:63` 由 `hash.includes("setting")` 改为精确比对 `hash !== "#setting"`，根除子串放行；`helpers.test.ts:199-206` 加 `rejects hash that merely contains setting substring`（`#not-setting` → throw），锁死契约。非「换形式弱化」。

### 本轮新发现

0 条。

### 扫描结论

- AC 覆盖：AC1（非 setting route 拒，整合层）✓；AC2（非白名单 file:// 拒，单元层 `helpers.test.ts:159`）✓；AC3（dev_url 前缀→origin 比对，单元层 `helpers.test.ts:169`）✓；AC4（三路径单测 + 设置窗正常路径）✓。设置正例由 `handleConfigGetSecrets returns vault plaintext`（config-ipc.test.ts:108）+ `allows #setting hash`（helpers.test.ts:181）共同保证。
- 危险模式扫描：无 `.skip`/`.only`/`@ts-ignore`/`eslint-disable`/注释断言/恒真断言/弱化断言/删 expect/mock 误用。
- mock 边界：`electron.ipcMain` 为系统边界 mock，合法；handler 通过 `registerConfigIpc` 真实注册路径获取，未 mock 被测逻辑。
- URL 改动（`file://settings` → `file:///index.html#setting`，CONFIG_DUPLICATE 3 处 + CONFIG_GET 1 处）：R1 已判必要/顺带，本轮复核仍成立——旧 URL 在新 `assert_valid_sender` 下 pathname `/settings` 不以 `index.html` 结尾会被拒，必须改。

总体判断：两 finding 均实质修复，本轮无新问题，security-critical 装配层已有测试护栏。

verdict: PASS
