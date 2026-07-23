# Task review t051（reviewer_focus: 代码）

- task：`t051_tikhub_connector`
- spec：`docs\tasks\t051_tikhub_connector\spec.md`
- diff_anchor：`f307af7502aa8f32bd60509aad52d50df6e35797`
- target：`git diff f307af7502aa8f32bd60509aad52d50df6e35797`
- round：1
- reviewed_at：2026-07-23 16:25 UTC+8

## Findings

### t051_code_f001 - balance / free_credit observation 构造块字段重复

- 严重度：minor
- 位置：`connectors/tikhub/connector.ts:69-87` 与 `connectors/tikhub/connector.ts:92-110`
- 问题：两个 observation push 块共享 13 个字段中的 10 个：`provider / account_id / account_label / window / cycleDurationMs / display_style / reset_at / observed_at / source / stale / last_error`（仅 `metric_id / raw_label / normalized_label / used / limit / status` 6 个不同）。后续若新增第三个 TikHub 指标（或调整 `display_style`、补 `last_error` 生成逻辑），需同步多处修改，易漏。
- 建议：抽 `build_observation(overloads: { metric_id; raw_label; normalized_label; used; limit; status })` 单点构造，公共字段在 helper 内固定。非 verbatim 重复（每块的 `metric_id` 等业务字段确实不同），故定 minor。

### t051_code_f002 - API 错误分支丢弃服务端 message 字段

- 严重度：minor
- 位置：`connectors/tikhub/connector.ts:52-54`
- 问题：`code !== 200` 抛错仅含数字 code：`` `TikHub API 错误: code=${...}` ``。未尝试读取 `response["message"]` / `response["description"]` / `response["detail"]` 等服务端错误文本。TikHub 错误响应（401/403/429 等）通常携带可读 message，丢弃后 `report_failed_account` 上报的错误串只有 `code=401`，用户难以判断是 token 失效、限流还是其它。对照既有约定 `connectors/getoneapi/connector.ts:58-62` 提取 `response["message"]`，本 connector 偏离。
- 建议：复用 getoneapi 的写法：`const msg = response["message"]; const code_str = ...; throw new Error(\`TikHub API 错误: ${typeof msg === "string" ? msg : code_str}\`);`。若 TikHub 错误体字段名不是 `message`（如 `detail`/`error`），按实际 OpenAPI 调整。

## 结论

- 本轮新发现：2 条（均 minor）
- 总体判断：实现严格按 spec 落地，AC 逐条覆盖（manifest 注册、balance + free_credit observation、account_id=email 回退 tikhub、余额反向 status、code!=200 / user_data 缺失 / 双指标全无 三处 throw），逻辑无 bug，空值与边界处理稳妥。两处 minor 均为可读性 / 诊断信息完整性改进，非阻塞。按 verdict 规则（任一 finding 即 FAIL），本轮 FAIL。

verdict: FAIL

## Round 2 (2026-07-23 17:05 UTC+8)

### 前轮 finding 复核

- `t051_code_f001`（balance/free_credit observation 重复）：**已修**。`connectors/tikhub/connector.ts:67-79` 抽出 `base` 对象集中 11 个公共字段（provider/account_id/account_label/window/cycleDurationMs/display_style/reset_at/observed_at/source/stale/last_error），两处 push 块（`connector.ts:85-93`、`connector.ts:98-106`）改用 `...base` spread + 6 个业务字段（metric_id/raw_label/normalized_label/used/limit/status）。虽未采用 R1 建议的 helper 函数形式，但 `base` 单点维护、spread 复用在语义上等效，DRY 诉求达成；字面量类型经 `as const` 保持，spread 顺序无意外覆盖（base 不含业务字段）。
- `t051_code_f002`（code!=200 丢 message）：**已修**。`connectors/tikhub/connector.ts:53-55` 提取 `response["message"]`，按 `typeof msg === "string" ? msg : \`code=${code_str}\``组合错误串，且`code_str`对非 number 类型走`JSON.stringify`，比 R1 建议更稳。

### 本轮新发现

0 条。

扫描范围：`git diff f307af7..HEAD -- connectors/tikhub/`（`connector.ts` 116 行、`manifest.json` 35 行）。复核 spread 引入的字段覆盖、类型保持、错误信息构造，以及 main 函数复杂度（CC≈9，未达 10 阈值），均无新问题。文件 116 行远低于 400 阈值。

### 总体判断

R1 两条 minor 均已修，修复过程未引入新问题。本轮 0 finding，前轮全修。verdict PASS。

verdict: PASS
