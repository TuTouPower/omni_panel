# Task review t050（reviewer_focus: 测试）

- task：`t050_getoneapi_connector`
- spec：`docs\tasks\t050_getoneapi_connector\spec.md`
- diff_anchor：`0b59436dff65242ad6d4772960e38c8470e4c24f`
- target：`git diff 0b59436dff65242ad6d4772960e38c8470e4c24f`（commit vs working tree，含 untracked：`connectors/getoneapi/`、`tests/integration/connector/getoneapi_connector.test.ts`）
- round：1
- reviewed_at：2026-07-23 16:50 UTC+8

## 测试改动盘点

- 新增 `tests/integration/connector/getoneapi_connector.test.ts`（8 用例）：走 `run_connector` 真实 runtime，mock 只打到 `ctx.http.post_json` 系统边界，符合测试可信要求。三档 status（critical/warning/normal）、API_KEY 缺失、code!=200、data 缺失、http 抛错均有真实断言（非恒真、非弱化、无 `.skip`/`@ts-ignore`）。
- `tests/unit/renderer/common_services.test.ts` 仅追加 `"getoneapi"` 到期望数组（1 行），与 `ADD_COMMON_SERVICES` 新增项对齐。

## Findings

### t050_test_f001 - AC #1「manifest 注册成功，参数标签齐全」无标签覆盖

- 严重度：important
- 位置：`tests/integration/connector/getoneapi_connector.test.ts:8-22`；`tests/integration/connector/manifest-contract.test.ts:9-18`
- 问题：AC #1（spec:24）要求「manifest 注册成功，参数标签齐全」。但：
    1. 连接器测试用 inline `manifest` 常量（test:8-22），该常量省略全部 `label`/`label@zh-Hans` 字段，且从不读取真实文件 `connectors/getoneapi/manifest.json`。即便真实 manifest 的标签缺失或写错，本测试也不会失败。
    2. 仓库的标签守卫是 `manifest-contract.test.ts` 的 `EXPECTED_PROVIDERS`（manifest-contract.test.ts:9-18），该表为每个 provider 校验 `secret_param.label@zh-Hans`（manifest-contract.test.ts:40）。**getoneapi 未被加入该表**，因此 `API 密钥`/`余额上限 (CNY)` 两个标签无任何测试守卫。
    3. manifest-contract.test.ts:45-51「all UI-exposed API key providers have connectors」显式列举 6 个 provider，未包含 getoneapi，尽管 `common-services.ts` 已把 getoneapi 暴露到 UI。
- 建议：把 `getoneapi` 加入 `EXPECTED_PROVIDERS`（`{ secret_param: "API_KEY", label: "API 密钥" }`），并视情况加入第 45-51 行的 `api_key_providers` 列表。如要更强覆盖，可在 connector 测试里 `readFile` 真实 `manifest.json` 并断言 LIMIT 的 `label@zh-Hans`。

### t050_test_f002 - AC #4「data 缺关键字段 throw」只覆盖 data 整体缺失，未覆盖 balance 字段缺失

- 严重度：important
- 位置：`tests/integration/connector/getoneapi_connector.test.ts:136-140`
- 问题：AC #4（spec:27）「code != 200 throw 错误；data 缺关键字段 throw（不静默空数组）」。spec 背景（spec:5、spec:32）明确「文档示例 `data:{}` 空结构」「字段需实测确认」，因此「关键字段」指 `data.balance`。当前实现 `connector.ts:65-67` 只在 `data` 本身不是对象时 throw；当 `data = {}`（balance 字段缺失）时，`connector.ts:69` 的 `to_number(undefined)` 静默回退为 0，随后返回一条 `used:0, status:critical/unknown` 的 observation——既不 throw，也不是「空数组」，规避了 AC 字面要求。测试「throws when data missing」（test:136-140）仅用 `{code:200, message:"ok"}`（data 字段整体不存在），走的是已覆盖的 `!is_record(data)` 分支；`{code:200, data:{}}` 这条「关键字段缺失」路径无任何用例，无法发现上述 spec 违规。
- 建议：新增用例 `run_getoneapi({ code: 200, message: "ok", data: {} })`，断言 `result.error` 非空且观察结果为空（或按实现侧决定的具体 throw 行为断言）。若实现侧确有理由不 throw（如实测 balance 必返回），须在代码侧归因并同步修订 spec 措辞，不得仅删测试。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：2 条（均 important）。
- 总体判断：测试本身无危险模式（无恒真、弱化、skip、mock 误用），三档 status 与 code!=200/data 缺失/http 错误均用真实断言。但两条 AC 覆盖缺口真实存在：manifest 标签完全无守卫（AC #1），「data 缺关键字段」的「关键字段」语义未被任何用例触及（AC #4），后者还可能掩盖实现侧 spec 违规。

verdict: FAIL

## Round 2 (2026-07-23 17:25 UTC+8)

### 前轮 finding 复核

- **t050_test_f001（important）→ 已修**：`manifest-contract.test.ts:12` 加入 `getoneapi: { secret_param: "API_KEY", label: "API 密钥" }`，同文件 `api_key_providers`（第 47 行）含 `getoneapi`。真实 `connectors/getoneapi/manifest.json` 现由 contract test 加载并断言 `secret_param?.["label@zh-Hans"]` 等于 `API 密钥`，`API_KEY` 的 type/required/exposeToScript 同步被守卫。f001 建议「如要更强覆盖 LIMIT 的 `label@zh-Hans`」非强制项，全仓 EXPECTED_PROVIDERS 均只校验 secret_param 标签，保持一致即可。
- **t050_test_f002（important）→ 已修**：实现侧 `connectors/getoneapi/connector.ts:68-70` 新增 `if (!("balance" in data)) throw new Error("GetOneAPI 返回格式异常: 缺少 data.balance");`。测试侧 `getoneapi_connector.test.ts:142-146` 新增 `it("throws when data.balance key missing (data:{})", ...)`，payload 为 `{ code: 200, message: "ok", data: {} }`，断言 `result.error` 非空且 `toContain("data.balance")`。
    - 弱化断言排查：`toContain("data.balance")` 并非弱化——错误消息 `缺少 data.balance` 中 `data.balance` 子串为本 throw 点独有标识，且其余用例（`toContain("缺少 data")` / `toContain("invalid api key")` / `toContain("HTTP 500")`）均沿用同风格，匹配面具体可定位。
    - 反向验证：去掉 connector.ts:68-70 后，`data:{}` 会走 `to_number(undefined)→0` 返回 `used:0` observation、`result.error=null`，`toContain("data.balance")` 立即失败——测试有效钉住 AC。
    - 运行确认：`pnpm test getoneapi_connector manifest-contract common_services` 共 26 用例全绿（含新增的 `data:{}` 用例）。

### 本轮新发现

无。扫描结论：

- 新增 `data:{}` 用例无 `.skip` / `.only` / `@ts-ignore` / `eslint-disable` / 恒真断言 / 删除或反转 expect（`getoneapi_connector.test.ts` grep 命中 0）。
- mock 边界仅限 `ctx.http.post_json`（系统边界），未 mock 被测逻辑 `run_connector` 或 `connector.ts` 内部函数。
- AC 覆盖（spec:24-28）逐条核对：#1 manifest 注册 + 标签（contract test）、#2 余额 observation（`maps data.balance` 用例）、#3 三档 status + LIMIT 异常（critical/warning/normal/unknown 四用例）、#4 code!=200 + data/data.balance 缺失 throw（三用例）、#5 契约覆盖正常/阈值三档/LIMIT 异常/错误码/字段缺失（齐全）。

### 总体判断

两条 R1 finding 均以「实现 throw + 测试断言 error」方式落实，未换形式弱化；本轮零新发现，测试层无危险模式。

verdict: PASS
