# Task review t059（reviewer_focus: 代码）

- task：`t059_connector_empty_response`
- spec：`docs\tasks\t059_connector_empty_response\spec.md`
- diff_anchor：`00e1f2167815e1e9b844bcf98582f34ba2715502`
- target：`git diff 00e1f2167815e1e9b844bcf98582f34ba2715502`
- round：1
- reviewed_at：2026-07-23 18:55 UTC+8

## Findings

无。

## AC 覆盖核对

- **AC1（cpa 上游非 2xx → report_failed_account）**：覆盖。`parse_api_body` 在非 2xx / JSON 解析失败 / body 非 record 三种情形均返回 `{}`（`connectors/cpa/connector.ts:102-113`），`main` 新增 `keys.length === 0 → report_failed_account + continue`（`:526-534`），上游非 2xx 路径被准确捕获。
- **AC2（mimo/minimax 空响应 → report_failed_account）**：覆盖。
    - mimo `connectors/mimo/connector.ts:173-181`：`observations.length === 0` 触发 report。由于 `usage_result.data.usage.items.map` 对非空 items 必产 ≥1 条观测（`:143-152`），且 balance 路径仅在 `code===0 && data` 且 `Number.isFinite(balance)` 时追加（`:154-170`），`observations.length === 0` 当且仅当 items 为空数组且 balance 不可用——与消息文本「usage items 空 + 无 balance」一致。
    - minimax `connectors/minimax/connector.ts:150-158`：`models` 非数组或空数组触发 report，先于后续 parse 循环。status_code !== 0 路径已在 `:144-147` 抛错经 runtime 转为顶层 error（与本次 report 路径分离）。
- **AC3（单测覆盖空体/非 2xx 路径）**：测试 diff 覆盖 mimo（空 items + balance 失败）与 minimax（空 model_remains）。CPA 路径未在测试 diff 中出现——属 test reviewer 范围，不在本报告展开。
- **AC4（合法零值不误报）**：手动核对未发现误报路径。
    - CPA：`parse_claude` 对 `periods.map` 始终返回 2 条观测；body 非空时 `keys.length > 0` 不触发 report。
    - mimo：items 非空时至少产 items.length 条观测；balance 路径在 `balance===0` 时仍会 push（`Number.isFinite(0)` 为真），用户零余额不会被误报。
    - minimax：`models` 非空但所有 `interval_total<=0` 且 weekly 冗余时，`intermediate` 为空数组返回但不触发 report（`observations` 检查位于 models 数组本身判空处，不在 sort 之后）。此路径与「合法零用量」一致，不被误报。
    - exa（spec 背景）属不同连接器，本次改动未触及，零用量语义不受影响。

## 代码质量核对

- **DRY / 重复**：三处 report_failed_account 消息各自描述本连接器上下文，无 verbatim 重复；参数结构一致，与 grok 模板（`connectors/grok/connector.ts:49,55,128`）对齐。
- **控制流**：CPA 将 `if (keys.length > 0) { ... }` 反向为 `if (keys.length === 0) { report; continue }` + 主路径，嵌套层级未增加；mimo / minimax 均为单层 early return，CC 无显著上升。
- **错误处理一致性**：CPA 原有 catch（`:537-547`）保留；新增路径位于 try 内部，`continue` 后无残留状态。mimo / minimax 的 report 紧接 `return []`，与 grok 模式一致。
- **边界条件**：`Array.isArray(models) || models.length === 0` 同时覆盖 `null/undefined/非数组/[]`；mimo 的 `items` 空数组通过 `!usage_result.data?.usage?.items` 真值检查（空数组 truthy）后由 `.map` 产生空 observations，由新检查兜底——逻辑闭环。
- **命名 / 类型**：四个 string 参数与 `host-io.ts:42-47` 签名匹配；无类型放宽。
- **文件大小**：`connectors/cpa/connector.ts` 553 行（>400 minor 阈值），但本 task 仅净增 9 行且必须落在连接器入口文件，属「工具强制单文件」豁免情形；`mimo/minimax` 远低于阈值。

## 实现正确性核对

- **parse_api_body 路径**：非 2xx / JSON 失败 / 非 record 全部返回 `{}`，统一被 `keys.length === 0` 捕获；未遗漏非 2xx 子分支。
- **fetch_provider 未知 provider 返回 `{}`（`:486`）**：新增逻辑会将其报告为「上游返回空响应」。此为 pre-existing 静默路径被显式化，与架构原则「零有效观测视为异常」方向一致；message 文本与实际触因（未实际请求上游）略有出入，但属生产配置范围外的边缘情形，不构成 finding。
- **runtime 失败语义**：`runtime.ts:193-198` 对脚本抛错走 `error` 字段、不自动入 `failed_accounts`。本次新增路径使用 `ctx.report_failed_account`，正确入 `failed_accounts` 供 refresh-service 复制 stale 副本——与 spec 期望的 UI 显示路径一致。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：三处 report_failed_account 落点准确，合法零用量不被误报，与 grok 处置模式及架构原则一致。

verdict: PASS
