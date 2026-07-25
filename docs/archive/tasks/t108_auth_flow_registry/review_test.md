# Task review t108（reviewer_focus: 测试）

- task：`t108_auth_flow_registry`
- spec：`docs/tasks/t108_auth_flow_registry/spec.md`
- diff_anchor：`593654c420c53787556bf88ab7ce9ef2c370ae5d`
- target：`git diff 593654c420c53787556bf88ab7ce9ef2c370ae5d`
- round：1/2
- reviewed_at：2026-07-25 16:07 UTC+8

## Findings

### t108_test_f001 - `auth-flow-registry.test.ts` 未覆盖 `gateway` source 回退分支

- 严重度：important
- 位置：`tests/unit/renderer/lib/auth-flow-registry.test.ts:26-66`（`resolve_auth_method` describe）
- 问题：
    - `src/renderer/lib/auth-flow-registry.ts:33` 对 `connector.source === "gateway"` 返回 `"apikey"`，但测试只覆盖了 `session`、`local`、`poll`、`undefined` 四种 source 回退。
    - 用户给定的审阅重点明确列出 `gateway` 为 source 回退之一；缺少该分支后，若后续重构把 `gateway` 与 `poll` 分支拆分或改变默认行为，单测无法及时拦截。
- 建议：在 `resolve_auth_method` 测试组中增加一条 `it("defaults to apikey for gateway source", ...)`，结构与 `poll` 分支类似。

### t108_test_f002 - `auth-flow-registry.test.ts` 未直接覆盖 `cpa_mgmt` manifest method 分支

- 严重度：important
- 位置：`tests/unit/renderer/lib/auth-flow-registry.test.ts:26-66`（`resolve_auth_method` describe）
- 问题：
    - spec 验收标准要求 “`auth-flow-registry.ts` 单测覆盖所有 method 分支与 fallback”。
    - 现有单测仅直接断言了 descriptor 方法 `oauth_device` 和 `web_login`，以及 source 回退产生的 `local_cli`；对于 `AuthMethod` 联合类型中的 `cpa_mgmt`，没有在 `resolve_auth_method` 层级直接验证其返回。
    - 虽然 `add_account_dialog.test.tsx` 的占位测试间接走到了 `cpa_mgmt`，但那属于组件层覆盖，不满足 “auth-flow-registry.ts 单测” 的 AC 范围。
- 建议：增加一条直接传入 `metadata.auth.method: "cpa_mgmt"` 的 connector，断言 `resolve_auth_method` 返回 `"cpa_mgmt"`。

### t108_test_f003 - `add_account_dialog.test.tsx` 未覆盖 `local_cli` 子表单渲染

- 严重度：important
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:33-344`（`AddAccountDialog descriptor-driven routing` describe）
- 问题：
    - `AddAccountDialog.tsx:520` 在 `auth_method === "local_cli"` 时渲染 `<LocalScanForm>`，这是 descriptor/source 路由的一个真实子表单分支。
    - 当前测试覆盖了 `apikey` fallback、apikey descriptor、`session` fallback、`oauth_device`/`web_login`/`cpa_mgmt` 占位、endpoint override、无 connector 回退，但缺少 `local_cli`。
    - 若 `resolve_auth_method` 或 `AddAccountDialog` 的路由条件被误改，`local_cli` 分支的回归无法被 caught。
- 建议：增加一个 `source: "local"` 的 connector 测试用例，断言渲染出本地扫描相关文案（如 “扫描本地授权文件” 或 `AUTH_LOCAL_PATHS` 中的路径），并保存时 `auth_method` 为 `"local_cli"`。

### t108_test_f004 - 使用静态源码正则检查替代组件行为断言

- 严重度：minor
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:330-337`（`does not contain direct console calls`）
- 问题：
    - 该测试读取 `src/renderer/components/AddAccountDialog.tsx` 文件内容并断言没有 `console.*` 调用。它验证的是源码文本，而不是用户可观察的行为、接口或存储效果。
    - 这类规则更适合放在 lint / ESLint 中；放在组件测试里既不属于 AC，也可能因注释、字符串或模板中意外出现 `console.log` 而误报。
- 建议：从单元测试中移除，或在 ESLint 配置里统一禁用 `no-console`；测试应聚焦于渲染与交互行为。

### t108_test_f005 - 测试标题与组件当前接口不一致

- 严重度：minor
- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:339-343`（`shows CPA button when has_cpa is true`）
- 问题：
    - 测试名提到 `has_cpa is true`，但 `AddAccountDialog` 当前 props 已不存在 `has_cpa`；组件通过 `ADD_COMMON_SERVICES` 固定列出 “CPA Manager”。
    - 测试 passes 是因为组件始终显示该按钮，而非因为某个 `has_cpa` 条件为真；标题会误导后续维护者，使其误以为还有 `has_cpa` 开关需要测试。
- 建议：将测试名改为 `shows CPA Manager button in vendor picker`，或若确实需要按条件显示，则补充对应 prop 并在实现中接入。

### t108_test_f006 - 通过 CSS className 判断按钮启用状态，断言脆弱

- 严重度：minor
- 位置：
    - `tests/unit/renderer/components/add_account_dialog.test.tsx:304-305`
    - `tests/unit/renderer/components/add_account_dialog.test.tsx:325-327`
- 问题：
    - 两个测试使用 `expect(btn?.className).not.toContain("disabled")` 来断言按钮未被禁用。这种断言依赖内部 CSS class 命名，而非按钮的真实可访问状态。
    - 若实现改用 `disabled` 属性或调整 class 命名（例如改为 `opacity-50`、`aria-disabled`），测试会失败，但用户看到的启用行为并未改变。
- 建议：改用 `@testing-library/jest-dom` 提供的 `expect(btn).not.toBeDisabled()`（或 `toBeEnabled()`），断言实际的 disabled 状态。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：6 条（important 3 条，minor 3 条）
- 总体判断：测试覆盖了 descriptor 优先级、大部分 source 回退与占位渲染，但 `gateway` source 回退、`cpa_mgmt` method 分支以及 `local_cli` 子表单渲染存在覆盖缺口；另有若干测试代码质量与可维护性问题。

verdict: FAIL

## Round 2 (2026-07-25 16:14 UTC+8)

### Findings

（无）

## 结论

- 前轮 finding 复核：
    - t108_test_f001：已修。`auth-flow-registry.test.ts:62-65` 新增 `it("defaults to apikey for gateway source", ...)`，直接断言 `source: "gateway"` 回退为 `"apikey"`。
    - t108_test_f002：已修。`auth-flow-registry.test.ts:37-45` 新增 `it("returns cpa_mgmt when declared in descriptor", ...)`，在 `resolve_auth_method` 层级直接覆盖 `cpa_mgmt` method 分支。
    - t108_test_f003：已修。`add_account_dialog.test.tsx:236-266` 新增 `it("renders local scan form and auth_method local_cli for local source", ...)`，断言渲染本地扫描文案、路径，并验证保存时 `auth_method` 为 `"local_cli"`。
    - t108_test_f004：已修。原 `does not contain direct console calls` 静态源码正则测试已删除，不再用源码文本检查替代行为断言。
    - t108_test_f005：已修。原 `shows CPA button when has_cpa is true` 已重命名为 `shows CPA Manager button in vendor picker`，标题与当前组件接口一致。
    - t108_test_f006：已修。`add_account_dialog.test.tsx` 中判断按钮启用状态的断言已改为 `toBeDisabled()` / `toBeEnabled()`，不再依赖 `className` 字符串。
- 本轮新发现：0 条
- 总体判断：Round 1 全部 finding 已在本轮前修复，新增测试覆盖了 `gateway` 回退、`cpa_mgmt` descriptor、`local_cli` 子表单渲染等缺口，且无新的危险模式或覆盖问题。

verdict: PASS
