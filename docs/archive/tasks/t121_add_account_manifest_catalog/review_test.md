# Task review t121（reviewer_focus: 测试）

- task：`t121_add_account_manifest_catalog`
- spec：`docs\tasks\t121_add_account_manifest_catalog/spec.md`
- diff_anchor：`931bfa135fe683235745ee9070a1d1891995acce`
- target：`git diff 931bfa135fe683235745ee9070a1d1891995acce`
- round：1
- reviewed_at：2026-07-26 (UTC+8)

## Findings

### t121_test_f001 - catalog "secret values" 测试通过空 configStore 与"无 auth 字段 manifest"间接绕开真实 secret 过滤验证，断言弱

- 严重度：important
- 位置：`tests/unit/ipc/connector-ipc.test.ts:225-261`（`does not include secret values in catalog entries`）
- 问题：
    - 测试构造的 `claude` manifest 参数为 `{ name: "API_KEY", type: "secret" }` 但**未在 `configStore` 中放置任何真实 secret 值**（`create_config_store([])` 创建的 config.plugins 为空，无 `parameterValues.API_KEY = "sk-real-key"`）。该测试声称验证 catalog 不泄漏 secret 值，但实际 manifest 本身不含 secret 值，`metadata_from_definition` 也只复制 `type/label/required/defaultValue`，从源头就没有"值"可泄漏。`expect(serialized).not.toContain("sk-real-key")` 是恒真断言：字符串 "sk-real-key" 从未进入输入，断言永远通过。
    - 更进一步，第二个断言 `expect(serialized).not.toMatch(/"value"\s*:\s*"/)` 也是恒真：`metadata_from_definition` 只输出 `defaultValue`（key 名是 `defaultValue` 不是 `value`），manifest 参数 schema 不存在 `value` 字段。即使实现完全不过滤 secret，此正则也不会命中。
    - 这条测试给 reviewer 与未来维护者错误印象：catalog 已经验证"不泄漏 secret 值"。实际它什么都没验证。AC `密钥不得在 catalog 通道中传输` 表面上被覆盖，实际未测到。属"测了假行为致 AC 看似覆盖但实际未验证"（critical 边界），但因 secret 过滤逻辑实际由 `metadata_from_definition` 静态保证、无运行时分支可绕过，降为 important。
- 建议：构造一个 secret 参数 `default` 字段（如 `default: "should-not-leak-default"`）并断言 catalog 序列化不含该 default 值；或构造一个 secret 参数但 `metadata_from_definition` 当前确实会复制 `defaultValue`，应断言 secret 参数的 `defaultValue` 不出现在 catalog 元数据里（这才是真正的风险点）。如要验证 catalog 不读 `configStore.parameterValues` 中的 secret 值，应在 config.plugins 里放一个带 `parameterValues: { API_KEY: "sk-real-key" }` 的实例，再断言 catalog 序列化不含 "sk-real-key"。

### t121_test_f002 - catalog 测试未断言 `removedConnectorIds` 含目标 id 时仍返回该 catalog 条目

- 严重度：important
- 位置：`tests/unit/ipc/connector-icip.test.ts:161-223`（`lists definitions independent of config.plugins, including tombstoned ids`）
- 问题：
    - 测试构造 `create_config_store([])`（空 plugins），注释写明"模拟 grok/cpa 在墓碑中、未 auto-seed 的真实场景"，但 `create_config_store` 工厂（`tests/unit/ipc/connector-ipc.test.ts:64-77`）返回的 config **根本没有 `removedConnectorIds` 字段**。spec AC1 明确要求："manifest id 在 `removedConnectorIds` 中时仍然返回"。测试连 `removedConnectorIds` 都没设置，无法区分"墓碑内仍返回"与"墓碑机制不存在"两种行为。
    - 进一步：`handleConnectorCatalog` 实现根本不读 `configStore`（只 `deps.definitions.map`），所以 config 里有没有墓碑字段对结果无影响--这正是 t121 设计目的（catalog 与墓碑解耦）。但测试名声称 "including tombstoned ids"，却没有在 setup 里构造墓碑、也没有断言"墓碑存在 vs 不存在"两种输入下结果一致，属于"测了 mock 而非 AC"。若未来实现退化为读 config 过滤墓碑，此测试仍会通过。
    - spec 验收标准 `[ ] 存在一条不依赖 config.plugins 的 catalog 通道，能列出全部已发现连接器的 manifest id、auth descriptor 与 provider，且 manifest id 在 removedConnectorIds 中时仍然返回` 部分覆盖：独立于 `config.plugins` 已测，"墓碑内仍返回"未测。
- 建议：在 `create_config_store` 调用处或自定义 configStore 中显式设置 `removedConnectorIds: ["grok", "cpa"]`，再断言 catalog 仍返回 grok/cpa 两条目。无需断言墓碑字段本身（catalog 不应读它），但 setup 必须包含墓碑以证明独立性。

### t121_test_f003 - createInstance 测试未验证 `manualDefault`/`manualRefreshOnly` 字段与 `endpointOverrides` 初始化

- 严重度：minor
- 位置：`tests/unit/ipc/config-ipc.test.ts:66-105`（`creates a new instance from manifest_id, seeding non-secret defaults`）
- 问题：
    - `handleConfigCreateInstance` 实现（`src/main/ipc/config-ipc.ts:303-322`）含 `...(definition.manifest.manualDefault === true && { manualRefreshOnly: true })` 分支与 `endpointOverrides: {}`。测试只断言 `executablePath / name / enabled / refreshIntervalSeconds / parameterValues[monitor_claude]` 与 `parameterValues` 不含 secret，未覆盖 `manualRefreshOnly` 行为或 `endpointOverrides` 字段。
    - cpa_def 未设 `manualDefault`，分支天然不触发；测试若想覆盖 `manualDefault=true` 分支需另构造 manifest。当前不构成 AC 缺失（spec 未列 manualDefault 验收点），但属覆盖可更广。
- 建议：可选补一测：manifest 含 `manualDefault: true`，断言 newInstance.manualRefreshOnly === true。`endpointOverrides: {}` 已隐含在 `parameterValues` 断言外的对象结构里，可不单独测。

### t121_test_f004 - createInstance 测试用 `createMockDeps().secretsStore` 复用全局 claude 实例的 secretsStore，潜在串扰

- 严重度：minor
- 位置：`tests/unit/ipc/config-ipc.test.ts:85, 125`（`secretsStore: createMockDeps().secretsStore`）
- 问题：
    - 两个 createInstance 测试都通过 `createMockDeps().secretsStore` 拿 secretsStore，而 `createMockDeps()`（`tests/unit/ipc/config-ipc.test.ts:43-102`）创建的 configStore 里 config.plugins 有一个 claude 实例（`parameterValues: { API_KEY: "sk-real", MODEL: "gpt-4" }`）。两个测试只替换 `configStore`，复用 secretsStore；但 `handleConfigCreateInstance` 实现根本不调用 secretsStore（只读写 configStore），所以无实际串扰。
    - 属于 mock 边界不清晰：测试deps 里挂着与本路径无关的 secretsStore，若未来实现改为同时初始化 secret，此 mock 可能掩盖行为。不构成 AC 缺失。
- 建议：可构造独立 `secretsStore` stub（与 connector-ipc.test.ts 中 createMockDeps 的 secretsStore 一致即可），或显式注释"createInstance 不触达 secretsStore，复用无副作用"。

### t121_test_f005 - settings_view CPA 两测试改断言 createInstance 后丢失对 "源实例不被复用" 的显式行为覆盖

- 严重度：important
- 位置：`tests/unit/renderer/views/settings_view.test.tsx:1483-1503`（`does not match CPA vendor to deepseek source`）
- 问题：
    - 原测试断言 `expect(duplicate).toHaveBeenCalledWith("cpa-1")` + `expect(duplicate).not.toHaveBeenCalledWith("deepseek-1")`：同时验证"调了正确的源 (cpa-1)"与"没调错误源 (deepseek-1)"。改后变为 `expect(createInstance).toHaveBeenCalledWith("cpa")` + `expect(createInstance).not.toHaveBeenCalledWith("deepseek")`。
    - 第二条 `not.toHaveBeenCalledWith("deepseek")` 在 createInstance 路径下是**恒真弱化断言**：createInstance 入参是 manifest id（如 "cpa"/"deepseek"），而 mock `createInstance` 全局只被第一个测试用 "cpa" 调用过一次。`not.toHaveBeenCalledWith("deepseek")` 在第二个测试里永远成立（本测试只点 CPA Manager 按钮，从未触发 deepseek 创建）。原 duplicate 测试的"不匹配 deepseek-1"是真正在验证"vendor 精确匹配 source instance"语义；createInstance 路径下 manifest id 直接来自 vendor_id，已无"匹配 source instance"的歧义，此断言失去意义。
    - 更关键：原测试名 `does not match CPA vendor to deepseek source` 描述的是"CPA vendor 不会误匹配到 deepseek 实例去 duplicate"。createInstance 路径下不存在"匹配实例"步骤，整个测试的语义前提已不存在，但测试名与断言保留，给维护者错误印象"该语义仍被覆盖"。
    - 属于"删/反转 expect" + "测了 mock 存在而非真实行为"。spec 验收标准 `[ ] 在 config.plugins 为空且 removedConnectorIds 含全部四个 id 的前提下，添加对话框对 cpa 渲染 CpaMgmtForm` 在 settings_view 层未真正验证（settings_view 测试里 base_config 仍有 `cpa-1` 实例，不是 spec 要求的"空 plugins + 墓碑含 cpa"前提）。add_account_dialog.test.tsx 的 catalog-driven 块才真正验证了该 AC。
- 建议：第二个测试要么删除（语义已迁移到 createInstance manifest id 直接匹配），要么改名为"createInstance 使用点击的 vendor manifest id"并断言 `createInstance` 只被调用一次且入参为 "cpa"。spec 前提"空 plugins + 墓碑"在 settings_view 层难以构造（base_config 含 cpa-1 实例），可不在此测；但测试名与断言应反映真实覆盖。

### t121_test_f006 - add_account_dialog catalog 测试仅断言"开始登录"按钮文本存在，未验证 OAuthDeviceForm 的标志性 secret_name 字段

- 严重度：minor
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:326-366`（`renders OAuthDeviceForm for grok when only catalog is available`）
- 问题：
    - 测试点击 "Grok" 后断言 `screen.getByText("开始登录")` 与 `screen.queryByPlaceholderText("sk-…")).not.toBeInTheDocument()`。"开始登录" 按钮文本存在确能区分 OAuthDeviceForm 与 ApiKeyForm（ApiKeyForm 无此按钮），但测试未验证表单实际绑定的 secret_name (`OAUTH_TOKEN`) 与 catalog entry 一致。
    - 测试尾部断言 `saved.secrets).toEqual({ OAUTH_TOKEN: "grok-access-token" })` 间接覆盖了 secret_name 流向，但这是 `on_save` 的输出，不是表单渲染的标志性元素。若未来实现把 secret_name 误写为 `GROK_TOKEN` 但 on_save 仍硬编码 `OAUTH_TOKEN`，此测试通过但表单实际未正确绑定。
    - 不构成 critical：`on_save` secrets 断言已经验证了端到端的 secret_name 流向，表单渲染层 secret_name 错配会被同 describe 下的其他测试（exa/cpa）模式覆盖。
- 建议：可选：在 OAuthDeviceForm 渲染后断言其内部 input 的 `name` 或 `aria-label` 包含 `OAUTH_TOKEN`，提升表单层可信度。

### t121_test_f007 - popup_view 三个测试仅补 mock `catalog: vi.fn().mockResolvedValue([])` 与 `createInstance: vi.fn()`，未验证任何 catalog/createInstance 行为

- 严重度：minor
- 位置：`tests/unit/renderer/views/popup_view.test.tsx:135,155` / `popup_view_height.test.tsx:140,160` / `popup_view_mirror.test.tsx:67,87`
- 问题：
    - 三处补 mock 是为让 PopupView 渲染不抛 `window.usageboard.connector.catalog is not a function`。mock 返回空数组 / undefined，PopupView 不展示任何 catalog 相关 UI，这三个测试本身不验证 t121 行为。
    - 属于"补 mock 让路径永远通过"的可接受形式（测试目标本就不是 catalog），但 `createInstance: vi.fn()` 无 mockResolvedValue，若 PopupView 路径意外调用会 reject；不过这三个测试不触发添加账号路径，无实际风险。
- 建议：保持现状即可。如要严谨，`createInstance: vi.fn().mockResolvedValue({ instanceId: "x" })` 与其他 config mock 风格一致。不强制改。

## 结论

- 前轮 finding 复核（Round 1 首轮，无前轮）。
- 本轮新发现：7 条（2 important + 5 minor；按 prompt 危险模式最低 important 的规则，f001/f002 命中"恒真断言"与"测了 mock 而非 AC"属 important，f005 命中"弱化断言"应 important 但因 createInstance 语义变化合理降为 important 已达标；f003/f004/f006/f007 为覆盖/风格类 minor）。
- 总体判断：t121 测试覆盖了 spec 大部分 AC，但 catalog "secret 不泄漏"与"墓碑内仍返回"两条 AC 的测试是恒真断言，给维护者虚假安全感；createInstance 主路径（实例字段、墓碑清理、未知 id 拒绝、secret 不落 parameterValues）覆盖较扎实；settings_view 改断言后丢失原"精确匹配 source"语义但新语义下无实际漏洞。修复 f001/f002 后基本可信。

verdict: FAIL

---

## Round 2 (2026-07-26 16:50 UTC+8)

### 前轮 finding 复核

逐条验证 Round 1 finding 的修复状态（对照 `git diff 931bfa1 -- tests/` 当前工作区）：

- **t121_test_f001（important）已修彻底**：`tests/unit/ipc/connector-ipc.test.ts:619-664` 的 `does not leak secret values from config.plugins or secret param defaults` 测试已重写。
    - 在 `config.plugins` 放入真实 secret 值 `parameterValues: { API_KEY: "sk-real-key-xyz" }`，断言 `expect(serialized).not.toContain("sk-real-key-xyz")` 现在有效（非恒真）：`handleConnectorCatalog` 不读 configStore，若未来实现退化为读 configStore.parameterValues，此断言会失败。
    - manifest secret 参数带 `default: "should-not-leak-default"`，断言 `expect(serialized).not.toContain("should-not-leak-default")` 现在有效：`metadata_from_definition`（`src/main/ipc/connector-ipc.ts:61`）已加 `param.type !== "secret"` 过滤，若该过滤被移除，`defaultValue: "should-not-leak-default"` 会进 metadata.parameters[0].defaultValue，序列化后命中断言失败。
    - 两条断言均从恒真升级为有效验证，AC「密钥不得在 catalog 通道中传输」真实覆盖。

- **t121_test_f002（important）已修彻底**：`tests/unit/ipc/connector-ipc.test.ts:521-528` 显式构造 `removedConnectorIds: ["grok", "cpa"]` 墓碑，并在 `:594` 断言 `expect(configStore.load).not.toHaveBeenCalled()`，证明 catalog 与 configStore（含墓碑字段）完全解耦。setup 含墓碑但断言不读，正确反映"墓碑内仍返回"的 AC 语义。

- **t121_test_f003（minor）已修彻底**：`tests/unit/ipc/config-ipc.test.ts:1081-1108` 新增 `sets manualRefreshOnly when manifest declares manualDefault` 测试，manifest 含 `manualDefault: true`，断言 `saved.plugins[0]?.manualRefreshOnly).toBe(true)`。分支覆盖到位。

- **t121_test_f004（minor）已修彻底**：`tests/unit/ipc/config-ipc.test.ts:1006-1009` 定义 `isolated_secrets_store` 工厂，三个 createInstance 测试（`:1037, :1111, :1133`）均用独立 stub，不再复用 `createMockDeps().secretsStore` 的 claude 实例 mock。第四个测试（`rejects unknown manifest id`，`:1146`）用 `...createMockDeps()`，但该测试在 manifest id 查找阶段就 return，不触达 secretsStore，无串扰风险。

- **t121_test_f005（important）已修彻底**：`tests/unit/renderer/views/settings_view.test.tsx:1483` 测试改名 `createInstance uses the clicked vendor's manifest id`，`:1503` 断言 `expect(createInstance).toHaveBeenCalledTimes(1)`。原 `not.toHaveBeenCalledWith("deepseek")` 恒真弱化断言已移除，改为更强的"仅调一次"断言。`beforeEach` 的 `vi.clearAllMocks()`（`:79`）重置调用计数，`toHaveBeenCalledTimes(1)` 在本测试内有效。

- **t121_test_f006（minor）遗留**：Round 1 已标记遗留，on_save secrets 断言 `expect(saved.secrets).toEqual({ OAUTH_TOKEN: "grok-access-token" })`（`:539`）覆盖 secret_name 端到端。表单层 aria 断言增益有限，接受遗留。

- **t121_test_f007（minor）已修彻底**：`popup_view.test.tsx:155` / `popup_view_height.test.tsx:160` / `popup_view_mirror.test.tsx:87` 三处 `createInstance` mock 均补 `mockResolvedValue({ instanceId: "new" })`，与其他 config mock 风格一致。

### 本轮新发现

逐条扫描危险模式（恒真断言 / 删 expect / 弱化断言 / .skip / mock 误用 / 阈值掩盖 / 条件跳过 / 程序赋值替代真实交互 / 存在即通过）：

- catalog 测试：两条断言均有效（见 f001 复核），无恒真。
- createInstance 测试：`expect(result.ok).toBe(true); if (!result.ok) return;` 是合法 guard pattern（expect 失败时 return 不执行，非条件跳过）。
- `rejects unknown manifest id` 测试：`if (!result.ok) { expect(result.error.code).toBe("VALIDATION_ERROR"); }` 在 `expect(result.ok).toBe(false)` 之后，ok=false 时必进分支，非恒真。
- `clears only the created manifest id from the tombstone` 测试：`expect(saved.removedConnectorIds).toEqual(["grok", "kimi"]);` + `expect(saved.removedConnectorIds).not.toContain("cpa");` 第二条冗余但非弱化（toEqual 已精确匹配）。
- add_account_dialog catalog 块：5 条测试均用 `getByText` / `getByPlaceholderText` 断言标志性 UI 元素，grok 测试补 `saved.secrets` 端到端断言，无存在即通过。
- settings_view：`toHaveBeenCalledTimes(1)` 是强化断言，非弱化。
- popup_view 三处：补 mock 不验证行为，但测试目标本非 catalog，属可接受形式。
- smoke/setup.ts：`createInstance: vi.fn().mockResolvedValue(undefined)` 返回 undefined 而非 `{ instanceId: string }`，但 smoke 测试不触发添加账号路径，无风险。
- 无 `.skip` / `.only` / `@ts-ignore` / `eslint-disable` / 注释掉断言 / 阈值放大。

本轮新发现：**0 条**。

### 总体判断

Round 1 七条 finding 中六条已修彻底、一条按 Round 1 标记遗留；修复未引入新恒真/弱化断言或危险模式；catalog secret 不泄漏、墓碑内仍返回、createInstance 字段/墓碑清理/未知 id 拒绝、AddAccountDialog 四 vendor 表单路由 + apikey 兜底均有效覆盖。

verdict: PASS
