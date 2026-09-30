# Task review t537（reviewer_focus: 通用）

- task：`t537_flowercloud_multi_service_metrics`
- spec：`docs/tasks/t537_flowercloud_multi_service_metrics/spec.md`
- diff_anchor：`3b8ea11bead74f5ba07f38ceadf7e4ef0332ad34`
- target：`git -C '/Users/karson/kar/code/omni_panel_t537' diff 3b8ea11bead74f5ba07f38ceadf7e4ef0332ad34`
- round：1
- reviewed_at：2026-09-30T10:01:30+08:00

reviewed_scope: 064f614455cdbce4

## Findings

### t537_gen_f001 - 单服务退化形态的 `account_id = flowercloud_default` 契约无断言锁定

- 严重度：minor
- 锚点：spec 风险与回退「保留单服务路径作为『只有首个服务』的退化形态」；`docs/blueprint/domain.md:155`「仅 1 个服务时保持 `flowercloud_default`（与历史序列连续）」。非 AC-001~004 字面项，属退化契约覆盖缺口。
- 位置：`tests/integration/connector/flowercloud_connector.test.ts:94-125`（既有单服务用例）；`connectors/flowercloud/connector.ts:389-390`
- 问题：连接器全部 `account_id` 断言（test:417/467/500/556/618）均为 `flowercloud_service_*` 多服务形态；三条既有单服务用例（clientarea 主页、live dashboard、详情页补数）断言了 used/limit/label 等但从不断言 `account_id`。单服务输出 `flowercloud_default` 这一「历史序列连续」的关键契约当前无测试锁定——回归时用户历史观测会静默断链且无红灯。
- 建议：在任一单服务用例补一行 `expect(obs.account_id).toBe("flowercloud_default")`。

### t537_gen_f002 - 多账号实例备注回退比较「原始 displayName」与「清洗后 accountLabel」，备注含首尾空白或超 64 字符时回退失效

- 严重度：minor
- 锚点：AC-004「多服务账号展示可区分的服务名与各自用量」——触发条件下同一实例多账号行显示同一备注，不可区分。
- 位置：`src/renderer/lib/provider-usage.ts:406`（`if (account.accountLabel !== first.connectorDisplayName) continue;`），对照 :132-139（`accountLabel = sanitize_remote_string(connector.displayName)`，内部 trim + 64 字符截断）
- 问题：`accountLabel` 经 `sanitize_remote_string`（trim、控制字符剥离、>64 截断），`connectorDisplayName` 是原始值。用户把实例备注设为 `"  我的花云  "`（首尾空白）或超过 64 字符的长备注时，二者不相等 → 回退被 `continue` 跳过 → 两个服务账号行都渲染成同一（截断后的）备注，AC-004 的可区分性在该配置下失效。正常短备注（测试覆盖场景）不受影响。
- 建议：比较前对 `connectorDisplayName` 做同一 `sanitize_remote_string` 归一（或直接用 `first.collected_label !== undefined && connector 多账号` 时无条件回退），并补一条「长/带空白备注」用例。

### t537_gen_f003 - 宿主逐服务捕获不校验当前页属于 `current_id`，导航落到 RE 命中的非详情页时用量会被静默错配进分段

- 严重度：minor
- 锚点：AC-001（`account_id` 与用量的对应正确性）潜在风险路径；与 spec 未知契约区 s041「错配不可自动识别」结论同类的宿主侧缺口。
- 位置：`src/main/core/session/flowercloud_dom.ts:402-411`（`FLOWER_USAGE_RE.test(html)` 命中即在 `settle_ms` 后 `captured.set(current_id, html)`）；辅助函数 `read_page_hint` 已存在于同文件 :461
- 问题：capture 只要求「当前 DOM 命中 `FLOWER_USAGE_RE`」，不验证该 DOM 对应 `current_id` 的详情页。若 `loadURL(details_url(id))` 落到命中 RE 的非目标页（例如站点改版后列表页出现「流量使用 XGB / YGB」摘要、或某产品类型详情模板带全局流量摘要），该页 html 会被写入 `current_id` 的分段；随后连接器 `is_complete_usage` 通过 → 不触发 HTTP 详情页兜底 → 错误用量静默归到该 `account_id`（多服务时可重复错配到每个服务）。当前真实 fixture 下列表页 `clientarea_sample.html` 与详情页 `productdetails_sample.html` 均不命中 RE、`live_dashboard_sample.html` 命中但无链接，故现网触发概率低——防御性缺口而非现行 bug。
- 建议：capture 前用 `read_page_hint(window)` 断言 `hint.url` 含 `id=${current_id}`，不匹配则按失败原因登记（沿用逐服务失败语义）。

## 结论

- 前轮 finding 复核：Round 1，无前轮 finding。
- 本轮新发现：3 条（均 minor，无 critical / important）。
- 未进表的提示：
    - 文件规模：`connectors/flowercloud/connector.ts` 439 行（diff +268）、`src/main/core/session/flowercloud_dom.ts` 548 行（diff +195），改动集中但量化阈值以 code prompt 为准，仅作提示。
    - 多服务缺数补数为串行 HTTP，共享 15s 连接器执行预算：后段服务更易超时，但表现为逐服务 `failed_accounts` 显式登记（net-client 按剩余预算缩短单请求超时），非静默。
    - `FLOWER_USAGE_RE` 依赖（宿主 settle 判据）：真实 `productdetails_sample.html` 不命中该 RE，若存在该形态的产品类型，快照将每轮失败保留旧值——与 t535 旧路径同等依赖、非本次回归，且落在上下文区「有意不测（产品类型用量卡片布局差异）」内，不出 finding。
    - 范围外观察：`provider-usage.ts:392-412` 的多账号备注回退是通用规则（不只花云），任何同实例多账号连接器设备注后行标签都会回退到采集层名——方向与 AC-004 一致，且既有 77 个 provider-usage 用例 + 新用例全绿。
- AC 复验方式：
    - AC-001：`re_verified` — 集成测试断言 3 组观测、`(account_id, metric_id)` 唯一、标签与数值、零 HTTP（`flowercloud_connector.test.ts:407-444`）；独立查证观测 id 生成 `observation-mapping.ts:25`（`${source_instance_id}:${account_id}:${metric_id}`）组合唯一。
    - AC-002：`re_verified` — composite 分段失败隔离（:480-507）、卡窗错配整体弃用并逐服务补数（:583-626）、补数失败隔离（:510-578）均断言 `result.failed_accounts`（经真实 runtime wrapper 收集，非注入 spy）。
    - AC-003：`re_verified` — 列表快照逐服务 HTTP 补数 + 失败登记（:510-578）；宿主侧 error 标注与全败保留旧值（`flowercloud_dom.test.ts` 新增 5 例，含 error 分段与旧快照保留）。
    - AC-004：`re_verified` — builder 分组与 `ProviderAccountList` 渲染断言（`flowercloud_multi_service_card.test.tsx:63-107`）；确认面板/弹窗同源：`use_popup_derived.ts:58`、`PopupView.tsx:885` 消费同一 `build_provider_usage_groups`。
    - coverage = 4 / 4；trust_prior 占比 0%。
    - 独立复跑：`pnpm test` 342 文件 / 4271 passed / 1 skipped；`pnpm typecheck`、`pnpm lint`（--max-warnings=0）绿；改动相关 8 个测试文件定向运行全绿。
- 总体判断：四条 AC 均实现且有触达生产逻辑的测试支撑，失败隔离、失败标注、零请求门槛与展示区分均可独立复验；仅存 3 条 minor 防御性/覆盖性问题，无未解决 critical/important。
- 系统性 follow-up：建议标题「部分失败且该账号无历史时面板显示账号级失败占位」，slug `per_account_failed_placeholder`，非阻断——t040 仅覆盖「整实例零 items」的占位，t537 多服务使部分失败常态化，首次采集即失败的单服务在面板无失败行（`failed_accounts` 仅进结果与日志）。已 `task.py list` 只读查证无等价 tid。

verdict: PASS

## Round 2 (2026-09-30T10:14:08+08:00)

reviewed_scope: f29cf0bd61d14f2c

### t537_gen_f004 - 落点核对为一次性 substring 匹配，URL 含 `id=<target>` 子串时仍放行且 capture 前不复核

- 严重度：minor
- 锚点：AC-001（`account_id` 与用量对应正确性）防御路径；与 s041「错配表现为命中、不可自动识别」同类的宿主侧残留。需「落点 URL 错」且「该页命中 `FLOWER_USAGE_RE`」双重条件才触发，现网低概率，非现行 bug。
- 位置：`src/main/core/session/flowercloud_dom.ts:404`（`!hint.includes(`id=${target_id}`)`，核对块 :403-407）；capture 点 `:412-416`
- 问题：两处精度缺口。(1) substring 比较：目标服务 `8848` 的落点 `...productdetails&id=88480`（更长 id）或 `?redirect_id=8848`（其它参数含 `id=8848` 子串）均通过核对——恰是 f003 要防的错配形态。(2) 核对只在 `loadURL` 完成后执行一次，capture 前不复核（Round 1 建议为 capture 前核对）：核对通过后页面若客户端重定向到命中 RE 的非详情页（f003 原场景的时间后移），该页 html 仍写入 `current_id` 分段并可能绕过 HTTP 补数兜底。
- 建议：解析 URL 精确比对 `action=productdetails` 且 `id` 参数全等（`new URL(...).searchParams.get("id") === target_id`）；capture 前再核一次 hint，不匹配按该服务失败。

### t537_gen_f005 - 多账号实例备注回退写入未清洗的 `collected_label`，绕过 A76 远端字符串过滤

- 严重度：minor
- 锚点：A76 契约（`src/renderer/lib/provider-usage.ts:73-81` 远端字符串 64 字符上限与控制字符过滤）；AC-004 展示路径与其它账号标签清洗不一致。React 文本转义下无 XSS，不满足 blocking 硬阈值。
- 位置：`src/renderer/lib/provider-usage.ts:414`、`:416`（`account.accountLabel = first.collected_label`），原始值来源 `:134`（`collected_label: item.accountLabel`）
- 问题：正常路径 `accountLabel` 一律经 `sanitize_remote_string`（滤 `\x00-\x1F\x7F`、trim、64 截断）；回退路径直接把原始 `collected_label` 写入 account/period 标签。`item.accountLabel` 源自连接器输出（花云 `product_name` 取自远端 HTML，远端可控）。用户设实例备注 + 多服务账号配置下，远端标签含控制字符或超 64 字符时原样渲染（面板行标签、label map 键），与 A76 及同文件其它赋值路径不一致。该回退块为 t537 diff 引入。
- 建议：回退赋值前过 `sanitize_remote_string(first.collected_label)`（或 `to_period` 存入清洗后的 `collected_label`），并断言截断行为。

## 结论

- 前轮 finding 复核（Round 1，以 diff/代码为准，不采信处置表自称）：
    - `t537_gen_f001`（minor）：**已消除** — HTTP 路径断言在 `tests/integration/connector/flowercloud_connector.test.ts:202`（`follows product details link...`，单服务 id=999），快照路径断言在 `:265`（`uses session DOM directly`，无链接 id=null）；两分支（id 非空/空）均锁定 `flowercloud_default`，若回归为 `flowercloud_service_<id>` 断言即红。处置表 rationale 把 HTTP 断言标注为 `parses clientarea main page` 用例，与实际所在用例名不符，但断言真实存在（措辞差异，不计 finding）。
    - `t537_gen_f002`（minor）：**已消除** — 原「清洗后 accountLabel 反比原始 displayName」比较被移除，改为 `to_period` 计算 `instance_label_applied` 标志（`provider-usage.ts:135-138`），与备注覆盖条件 `:141-145` 三条件逐条等价；回退改判标志 `:412-413`。`flowercloud_multi_service_card.test.tsx:95` 用 `"备注".repeat(40)`（80 字符 > 64 必被截断；task.md 写 70 字符为描述差异）验证回退仍回服务名；首尾空白变体因不再做字符串比较而结构性消除。回退赋值的清洗旁路另立 `t537_gen_f005`。
    - `t537_gen_f003`（minor）：**已消除** — `flowercloud_dom.ts:403-407` 导航后经 `read_service_hint` 核对落点 URL 属于 `target_id`，不匹配判该服务失败（`导航未到达该服务的详情页`）并阻止 capture；生产窗提供 hint（`src/main/index.ts:790` 读 `location.href`），核对在现网生效；`flowercloud_dom.test.ts:368-406` 断言错配服务进 error 分段、其用量（10.00GB/100GB）绝不入库、健康服务（8849）不受影响。核对精度残留另立 `t537_gen_f004`。
- 本轮新发现：2 条（均 minor，无 critical / important）。
- 未进表的提示：无新增；Round 1 结论段提示（文件规模、串行补数共享预算、`FLOWER_USAGE_RE` 依赖）维持有效。
- AC 复验方式：
    - AC-001：`re_verified` — 定向重跑 `flowercloud_connector.test.ts` 19 例全绿（含 AC-001 列表快照三服务零 HTTP、composite 分段、本轮新增 `:202`/`:265` 单服务断言）；代码核对 `account_id` 分支 `connectors/flowercloud/connector.ts`（multi 才用 `flowercloud_service_<id>`）。
    - AC-002：`re_verified` — 同文件 AC-002 分段失败隔离（`:482`）与卡窗错配整体补数（`:584`）用例全绿；`flowercloud_dom.test.ts` 25 例全绿（含 `:368` 错配防护）。
    - AC-003：`re_verified` — `flowercloud_connector.test.ts:513`（list-only 逐服务补数 + 失败隔离）与宿主侧 error 标注/全败保留旧值用例全绿。
    - AC-004：`re_verified` — `flowercloud_multi_service_card.test.tsx` 3 例 + `tests/unit/renderer/provider-usage.test.ts` 77 例全绿；回退逻辑 `provider-usage.ts:399-419` 与标志计算 `:134-146` 逐行核对。
    - coverage = 4 / 4；trust_prior 占比 0%。
    - 独立复跑：定向 6 个测试文件（connector / flowercloud_dom / session-manager / multi_service_card / provider-usage / provider_usage_account_error）196 passed；`pnpm typecheck` 绿。
- 总体判断：Round 1 三条 minor 均以 diff/代码核实为真修且有触达生产逻辑的测试支撑；本轮 2 条新 minor 为防御精度与清洗一致性残留，无未解决 critical / important。
- 系统性 follow-up：无新增（Round 1 的 `per_account_failed_placeholder` 建议维持，已 `task.py list` 只读查证）。

verdict: PASS

## Round 3 (2026-09-30T10:32:12+08:00)

reviewed_scope: fcf7d7b75200e2b1

## Findings

Round 3 零 finding。

## 结论

- 前轮 finding 复核（以 diff/代码为准，不采信处置表自称）：
    - `t537_gen_f004`（Round 2，minor）：**已消除** — (1) 落点核对改 `hint_belongs_to_service`（`src/main/core/session/flowercloud_dom.ts:499-505`）：`new URL(url).searchParams.get("id") === service_id` 精确参数比对，解析失败按不匹配；`id=88480` 前缀形态与 `redirect_id=8848` 子串形态均被拒。(2) 双重复核落地：导航后（`:403-407`）与结算落盘前（`:419-428`，settle 满足时先复核再 `captured.set`）各核一次，不匹配判该服务失败（`导航未到达该服务的详情页`）并阻止 capture。(3) 前缀拒绝测试 `tests/unit/session/flowercloud_dom.test.ts:408`（hint 恒为 `id=88480`、目标 `8848`）断言 `written === false` 且 vault 旧值保留——退回旧 substring 逻辑则 `includes("id=8848")` 放行 → capture → `written=true`，断言即红。定向重跑该文件 26 例全绿。
    - `t537_gen_f005`（Round 2，minor）：**已消除** — `src/renderer/lib/provider-usage.ts:134` 存储即清洗：`collected_label: sanitize_remote_string(item.accountLabel) ?? item.accountLabel`（与同文件 `:147-148` 既有字段同一 A76 语义；sanitize 对 string 输入必返回 string，`??` 仅兜类型兜底）；回退路径 `:414-417` 消费的 `first.collected_label` 即清洗值，原始串不再进入 account/period 标签。脏标签回退测试 `tests/unit/renderer/components/flowercloud_multi_service_card.test.tsx:108`：控制字符 `\x001`、首尾空白、尾换行 + 实例备注场景，断言回退输出为清洗后服务名；定向重跑该文件 4 例全绿。
    - Round 1 三条（f001/f002/f003）：维持**已消除** — f001 断言 `flowercloud_connector.test.ts:202`/`:265` 仍在；f002 标志判定 `provider-usage.ts:135-138` 与回退改判 `:412-413` 仍在；f003 导航后核对 `flowercloud_dom.ts:403-407` 仍在并被 f004 的精确比对强化。
- 本轮新发现：0 条。
- 未进表的提示：
    - f004 残留：Round 2 建议中的 `action=productdetails` 未一并校验，同 `id` 不同 action 的落点仍过核对；无法构造「该形态页面命中 `FLOWER_USAGE_RE` 且展示非本服务用量」的具体失败场景，不满足 Pre-Report Gate 场景要件，仅作提示不进表。
    - capture 时复核的不匹配分支（`flowercloud_dom.ts:420-428`）无独立用例（gen_f003/f004 均在导航后核对即拦截），属「可以再加 case」类，不 blocking。
    - Round 1/2 结论段提示（文件规模、串行补数共享 15s 预算、`FLOWER_USAGE_RE` 依赖、多账号备注回退为通用规则）维持有效。
- AC 复验方式：
    - AC-001：`re_verified` — 重跑 `flowercloud_connector.test.ts` 19 例全绿（三服务观测、`(account_id, metric_id)` 唯一、标签数值、零 HTTP 断言在位）；单服务退化断言 `:202`/`:265` 在位。
    - AC-002：`re_verified` — composite 分段失败隔离与卡窗错配整体补数用例全绿；`flowercloud_dom.test.ts` 26 例全绿（错配服务进 error 分段、其用量不入库、健康服务不受影响）。
    - AC-003：`re_verified` — list-only 逐服务 HTTP 补数 + 失败隔离用例全绿；宿主侧 error 标注与全败保留旧值用例全绿。
    - AC-004：`re_verified` — `flowercloud_multi_service_card.test.tsx` 4 例（含 f002 截断备注、f005 脏标签回归）+ `provider-usage.test.ts` 77 例全绿；回退与清洗代码 `provider-usage.ts:134`/`:414-417` 逐行核对。
    - coverage = 4 / 4；trust_prior 占比 0%。
    - 独立复跑：全量 `pnpm test` 342 文件 / 4275 passed / 1 skipped；`pnpm typecheck`、`pnpm lint`（--max-warnings=0）绿。
- 总体判断：Round 2 两条 minor 均以 diff/代码核实为真修且有触达生产逻辑的测试支撑，Round 1 三条维持消除，本轮零新发现，无未解决 critical / important。
- 系统性 follow-up：无新增（Round 1 的 `per_account_failed_placeholder` 建议维持，已有 `task.py list` 只读查证记录）。

verdict: PASS
