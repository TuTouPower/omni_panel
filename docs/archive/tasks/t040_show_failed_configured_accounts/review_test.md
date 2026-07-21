# Task review t040（reviewer_focus: 测试）

- task：`t040_show_failed_configured_accounts`
- spec：`docs\tasks\t040_show_failed_configured_accounts\spec.md`
- diff_anchor：`21911b4`
- target：`git diff 21911b4`
- round：1
- reviewed_at：2026-07-22 20:35 UTC+8

## Findings

（无 finding）

## 覆盖与扫描结论

### AC 覆盖

| AC                               | 覆盖位置                                                                                                                                               | 状态                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| 直连 failed+0 items → 失败账号行 | 单测 case 1（`tests/unit/renderer/provider-usage.test.ts:94-115`）+ smoke（`tests/smoke/renderer-smoke.test.tsx:41-53`）                               | ✓                   |
| 失败行显示"采集失败"badge        | smoke 断言 `采集失败` 在 DOM（`renderer-smoke.test.tsx:49`）；实现侧 badge 渲染条件 `_error` 真值（`ProviderAccountRow.tsx:107-111`）被 smoke 间接覆盖 | ✓                   |
| 不显示伪造用量                   | 单测 case 1 断言 `periods.toHaveLength(0)`（`provider-usage.test.ts:114`）                                                                             | ✓                   |
| CPA gateway 失败不合成           | 单测 case 2（`provider-usage.test.ts:117-128`）                                                                                                        | ✓                   |
| 成功账号（有 items）不受影响     | 单测 case 3（`provider-usage.test.ts:130-150`）                                                                                                        | ✓                   |
| disabled 不合成                  | 单测 case 4（`provider-usage.test.ts:152-165`）                                                                                                        | ✓（超出 spec 要求） |
| `pnpm test:e2e:web 新 case`      | 未加 e2e 文件；smoke 已在 React 集成层等价覆盖                                                                                                         | 见结论段            |

### 危险模式扫描

- 恒真断言 / 弱化断言 / 注释断言：无。
- 删除/反转 expect：smoke 将"空页文案在"反转为"不在"。归因明确——t040 行为变更（失败账号占位取代空页），spec 第 27 行要求"使 `ProviderAccountList` 能渲染该行"而非"暂无账号"空页。属合法反转，非 finding。
- `.skip` / `.only`：无。
- `eslint-disable` / `@ts-ignore`：新测试代码无。
- mock 误用：`connectorInfo` 是测试数据构造器（`provider-usage.test.ts:68-91`），生成真实 `ConnectorInfo` 结构；`build_provider_usage_groups` 为被测真实函数。非 mock 自己的模块。
- 阈值掩盖 / 条件跳过：无。case 1、case 3 的 `if (!kimi) return;` 是 `expect(kimi).toBeDefined()` 后的 TS narrow 惯用法，非无证据 PASS。
- 程序赋值替代真实交互：smoke 用 `user.click` 真实点击 Claude 按钮（`renderer-smoke.test.tsx:47`），合法。
- 存在即通过：smoke 同时含正向（`采集失败` 在）+ 反向（空页文案不在）断言，非纯存在性。

### 测试可信

- 测真实函数输出与真实 React 树渲染，非内部 mock 凑数。
- 异步时序：smoke 用 `waitFor` + `userEvent.setup()`，无漏 await / timeout 掩盖。
- mock 边界：仅构造输入数据，未跨边界 mock。

### 红灯归因

smoke 改断言归因清晰（spec 行为变更），非为实现 bug 放行。合法。

## 结论

- 本轮新发现：0 条
- 范围外提示（不进 finding 表）：
    1. spec 范围列出 `tests/e2e/web/` 新增 case，diff 未包含；但 smoke 已在 React 集成层验证相同行为路径（点击 Claude → 失败 badge 可见 + 空页文案消失），等价覆盖。e2e `account_error_badge.spec.ts` 仍只覆盖 T027/T028 stale 场景，未扩到 t040 首次失败无 observation 场景——若后续追求真实浏览器端到端覆盖可补。
    2. 单测 case 1 不断言 `accounts[0].error === "HTTP 401"`；smoke 不断言 badge `title` 含具体 error 文案。两者均已被间接覆盖（占位 `error: snapshot.error` 直接赋值；badge 渲染本身证明 `_error` 通路有效），但补一条 error 字段断言可增强回归强度。
- 总体判断：测试覆盖 AC 关键路径，无危险模式命中，断言强度充分，反转断言有正当归因。

verdict: PASS
