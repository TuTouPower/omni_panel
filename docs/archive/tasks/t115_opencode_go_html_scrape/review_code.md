# Task review t115（reviewer_focus: 代码）

- task：`t115_opencode_go_html_scrape`
- spec：`docs/tasks/t115_opencode_go_html_scrape/spec.md`
- diff_anchor：`4eb3e8cd3c76fc565043f5013d1237428f5f3678`
- target：`git diff 4eb3e8cd3c76fc565043f5013d1237428f5f3678`
- round：1
- reviewed_at：2026-07-26 14:50 UTC+8

## 评审范围

- `connectors/opencode_go/connector.ts`（+160 / -23，行数 283 → 420）
- 参考实现：`vendors/opencode-quota/src/lib/opencode-go.ts`（vendor 双格式解析）
- 实现轴覆盖：`make_window` / `parse_ssr_window` / `parse_human_readable_reset` / `parse_data_slot_reset` / `parse_data_slot_window` / `parse_usage_from_html` / `build_observations` / `server_fn_fallback`；`main` 改为 `/auth + /go` 单页主路径 + fallback。

## Findings

无。

## AC 覆盖核对

| AC                                                         | 实现位置                                                                                                                                                                                                                     | 结论                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1 主路径只 `/auth` + `/go`，不下载 bundle、不调 `/_server` | `connector.ts:332-358` `main`：删 `Promise.all` 抓 `/workspace/<id>`，仅取 `/go`；`parse_usage_from_html` 命中即 return，fallback 才走 bundle/server-fn                                                                      | 满足                                       |
| 2 SSR `$R` 两种字段顺序                                    | `parse_ssr_window` (168-182) 构造 `pct_first` / `reset_first` 两正则，分别 `usagePercent:...resetInSec:` 与 `resetInSec:...usagePercent:`；`[^}]*` 吸收 `status` 等伴随字段                                                  | 满足                                       |
| 3 data-slot 格式 + 人类时间 / `reset-now`                  | `parse_data_slot_window` (215-231) 切 `data-slot="usage-item"`、匹配 label/value；`parse_data_slot_reset` (201-213) 处理 `reset-now` 与 `reset-time`；`parse_human_readable_reset` (184-199) 解析 days/hours/minutes/seconds | 满足                                       |
| 4 SSR + data-slot 均失败时回退 server-fn                   | `parse_usage_from_html` (238-258) 全 miss 返回 null；`main` (350-357) null 或空 observations 时 `server_fn_fallback`                                                                                                         | 满足                                       |
| 5 部分窗口容错                                             | `parse_usage_from_html` 任一窗口命中即构 payload；`build_observations` (260-282) 条件 push；至少一条即 return                                                                                                                | 满足                                       |
| 6 负数 / NaN clamp 或拒绝                                  | `make_window` (158-166)：`pct` 非 finite 返回 null（拒绝），finite 则 `Math.max(0, pct)`；`reset` 非 finite 回 0，否则 clamp 下限 0；`NUM_PATTERN` 允许匹配负数字符串再 clamp                                                | 满足                                       |
| 7 错误消息不含原始 HTML / cookie，长度受限                 | 全部 throw（28/343/390/409 行）均为常量字符串，无插值；新代码路径无任何 HTML/cookie 进入 error message                                                                                                                       | 满足（约束式满足，无需新增 sanitize 函数） |
| 8 单元测试覆盖                                             | 见 `tests/unit/connector/opencode_go.test.ts`（test reviewer 轴）                                                                                                                                                            | 满足                                       |
| 9 live 验证                                                | process 记录 + snapshot 测试（CI skip），代码轴不评                                                                                                                                                                          | N/A                                        |

## 评审维度过堂

### 规格合规(实现层)

- **AC 覆盖**：见上表，全部满足。
- **不偏航**：工作集 = connector.ts + 测试 + tasks_index.json，与 spec 范围一致。`server_fn_fallback` 是把原 inline 链路抽成函数（fallback 入口），非额外功能。
- **不自由发挥**：`parse_human_readable_reset` 多支持 minutes/seconds（spec 只点名 days/hours），与 vendor 对齐，未引入新风险，不算 YAGNI 违反。SSR 允许匹配负数再 clamp（spec 允许「clamp 或拒绝」二选一）。
- **不变量守住**：SSR 优先 data-slot、partial 容错、NaN 拒绝、负数 clamp、错误消息无敏感数据，均未被违反。
- **技术决策落地**：单页主路径 + fallback、SSR 双字段顺序、vendor 正则迁移、`Number.isFinite` 全程校验——逐条实现。

### 代码质量

- **DRY**：`...(cond ? { k: v } : {})` 三元 spread 模式在 `parse_usage_from_html`（SSR / data-slot 各一次，共 6 行）和 pre-existing `parse_usage_payload` 中均使用，是本项目惯用 idiom，不算 verbatim 重复。
- **控制流**：
    - `parse_ssr_window` CC ≈ 4；`parse_data_slot_window` CC ≈ 6；`parse_usage_from_html` CC ≈ 5；`server_fn_fallback` CC ≈ 6（pre-existing 主体）；`main` CC ≈ 4。均远低于 10。
    - 嵌套层级 ≤ 2，early return 风格一致。
- **错误处理**：无 swallowed errors；regex 不命中即 return null / 0，调用链显式处理。
- **边界条件**：
    - `pct_str` 由 regex 保证是数字串，理论上 `Number(pct_str)` 不会 NaN；但超长数字串可能 `Infinity`，`!Number.isFinite(pct)` 兜底返回 null（防御性，非死代码）。
    - `parse_data_slot_reset` 既无 `reset-now` 又无 `reset-time` 时返回 0（vendor 是 `continue` 整窗跳过）。行为差异但属容错选择，不算 bug。
    - data-slot label 匹配用 `includes(label_keyword)`，label 出现在任意位置均命中，与 vendor 行为一致。
- **命名**：`make_window` / `parse_ssr_window` / `parse_data_slot_reset` 等准确表意；`pct_first` / `reset_first` 清晰标识字段顺序。
- **separation of concerns**：解析（HTML → `UsagePayload`）与组装（`UsagePayload` → `ScriptObservation[]`）解耦于 `build_observations`，便于 fallback 复用。
- **文件膨胀**：connector.ts 420 行（>400 minor 阈值），但 connector runtime (`src/main/core/connector/runtime.ts:70-72`) 禁止 `import`/`export` 语句，强制单文件——属「不可拆的硬约束」，按文件过大标准规则 2 不出 finding。
- **死代码**：未发现新增死代码。`void main;`（420 行）是 pre-existing（runtime 通过 `if (typeof main === "function") return await main();` 间接调用），非本 task 引入。

### 实现正确性

- **逻辑 bug**：未发现。SSR reset-first 分支 `make_window(m[2], m[1])` 参数顺序与注释 `// m[1]=reset, m[2]=pct` 一致。
- **空值处理**：`make_window` 对 `pct_str` 非 finite 显式 reject；`reset_str` 缺失或非 finite 回 0。`to_number`（pre-existing）兜底 `usage.usagePercent ?? usage.used` 与 `usage.resetInSec`。
- **异常路径**：fallback 串行抓 `/workspace/<id>`（主路径失败时才触发），状态一致——失败 throw，成功 return observations。
- **并发时序**：`server_fn_fallback` 内 `bundles.push(res.body)` 在 `.then()` 中无序写入（pre-existing），但后续 `.find(...)` 只取首个含 hash 的 bundle，顺序无关，无 race。
- **资源泄漏**：HTTP 请求由 `ctx.http` 托管，无显式 fd/connection 需关闭。

## Pre-Report Gate 复核

本轮 0 finding，无需过 gate。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：HTML 直解析主路径 + server-fn fallback 实现与 spec 完全对齐，SSR 双字段顺序、data-slot 人类时间、partial 容错、负数/NaN clamp、错误消息约束逐条落地；无 bug、无自由发挥、无违反不变量；connector.ts 单文件大小受 runtime 硬约束豁免。

verdict: PASS
