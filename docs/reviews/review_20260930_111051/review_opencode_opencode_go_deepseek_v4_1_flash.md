# Review: origin/main..HEAD（16 commits，花云 DOM 快照 / t535·t536·t537 / pnpm 11）

## 本路模型标识

opencode / opencode-go/deepseek-v4.1-flash

## 审阅范围

- 仓库：`/Users/karson/kar/code/omni_panel`
- diff：`git diff origin/main..HEAD`（`git diff --stat`：77 文件，+8129/-299）
- commit（old→new）：`0232e50e` `fd69652a` `f62d434c` `39a5cca8` `e3780bba` `20608864` `c6266639` `2bcc8f4c` `56c01c1b` `6b3ab48e` `11200366` `289f1a8c` `3b8ea11b` `091f259d` `7219929f` `9eb54a76`
- 只读确认方式：`git diff origin/main..HEAD`、`git show <sha>` 与源文件全文（`Read`，未抽样）。
- 未运行构建/测试；未改动任何源文件。审阅在工作时限内完成。

### 关键文件清单（均已通读）

`src/main/core/session/flowercloud_dom.ts`(594) · `session-manager.ts`(734) · `session-types.ts`(65) · `src/main/core/quit_source.ts`(166) · `src/main/core/scheduler/refresh-service.ts`(889) · `src/main/core/logging.ts` · `src/shared/lib/logger.ts`(405) · `src/main/index.ts`(1676) · `src/main/core/main-panel/main-panel-controller.ts`(489) · `src/main/ipc/auth-ipc.ts` · `src/main/menu/application-menu.ts` · `src/main/bootstrap/cli_init.ts` · `connectors/flowercloud/connector.ts`(439) · `src/renderer/components/UsageRows.tsx` · `src/renderer/lib/provider-usage.ts` · `src/shared/constants.ts` · `eslint.config.ts` · `mise.toml` · `package.json` · `pnpm-workspace.yaml` `.npmrc` `.gitignore`，以及 `tests/` 下对应单测/集成测试、`docs/specs`、`docs/spikes`、`docs/findings`、`docs/handoff.md`、`docs/blueprint/*`。

______________________________________________________________________

## 1. 安全

### Critical / High

无。

### Medium

**SEC-M1 花云 vault 载荷（cookie + 整页 DOM）不参与脱敏，cookie 明文可经日志消息泄露**

- 位置：`src/shared/lib/logger.ts:22-29`（`MAX_SCRUB_VALUE_LENGTH = 8192`）、`src/shared/lib/logger.ts:74-87`（超长直接跳过 + 只 warn 一次）、`src/main/core/vault/file-vault-backend.ts:206`（`scrubber.register(plaintext)` 注册整个 vault 值）
- 证据：花云 `SESSION_COOKIE` 的 vault 值是 `JSON.stringify({ cookie, html: <整页 DOM>, captured_at })`（`flowercloud_dom.ts:74-76` / `session-manager.ts:444-445`）。整页 DOM 必然 >8192 字符，于是整条凭据（含其中的 `cf_clearance`、`WHMCS*`）都不进入 `registered_values`；`SECRET_KEY_PATTERN` 的 key 脱敏只作用于 meta 对象的 key，不覆盖 message 字符串。
- 现象/影响：`register` 里超长值被整体丢弃，`warn` 只提示"确保它永远不进 log sink"；一旦有日志路径把 vault 原文（或 cookie 片段）作为字符串 message 输出，cookie 不会被替换成 `***`。属"依赖约定而非机制"的脱敏缺口，本次把载荷从"cookie 串"扩为"cookie+HTML"后暴露面并未缩小（旧上限 1024 也跳过，故非本批新引入，但本批未收口）。
- 修复建议：在 vault 值入库/读取时对已知结构（JSON 载荷）单独 `scrubber.register(parsed.cookie)`；或对超长载荷按可识别的子键提取注册，而不是整体丢弃。
- 置信度 55 / Severity Medium

### Low

**SEC-L1 快照 cookie 回灌未做 `is_safe_cookie_string` 校验**

- 位置：`src/main/core/session/flowercloud_dom.ts:134-157`（`seed_partition_cookies`，逐条 `session.set_cookie`）
- 证据：`write_flowercloud_html:266-276` 在写 vault 前对合并 cookie 调用了 `is_safe_cookie_string`，但回灌分区时没有同等校验。
- 现象/影响：值来自本地 vault，攻击面低；但同一模块两处写入点的安全基线不一致，未来若 vault 被外部导入/污染会先经此处注入。
- 修复建议：回灌前对 `cookie_str` 做 `is_safe_cookie_string`（或至少 CRLF/长度）校验，与写入路径对齐。
- 置信度 40 / Severity Low

______________________________________________________________________

## 2. 正确性

### Critical / High

无。

### Medium

**COR-M1 起始页用量在发现服务链接后被丢弃；单服务导航失败即整轮无快照**

- 位置：`src/main/core/session/flowercloud_dom.ts:412-446`（`single_usage_html` 仅在 `seen.length === 0` 时记录）、`:387-410`（一旦 `pending.length>0` 立即导航并 `continue`）
- 证据：循环首次读到起始页即 `enqueue()`；随后"发现服务 → 导航"分支先于用量分支执行并 `continue`。若起始页本身含用量（`FLOWER_USAGE_RE`）且含 1 个 `productdetails` 链接，则 `seen.length=1`，`single_usage_html` 永远不会被赋值。若详情页随后失败（Cloudflare/登录/超时），`partial_result` 在 `captured.size===0` 时返回 `single_usage_html(null)` → `written:false`。
- 现象/影响：单服务账号在"列表页可见用量、详情页被质询拦截"的形态下，明明有可解析数据却整轮失败；而 `refresh-service.ts:475-491` 在抓取失败时**不调用连接器**，用户连 stale 数据都拿不到（保留旧值）。
- 修复建议：在 `enqueue` 后、导航前，若当前页 `FLOWER_USAGE_RE` 命中且能解析出用量，先记录为兜底 `single_usage_html`；或 `partial_result` 在无捕获且 `last_kind==="usage"` 时返回最后一张用量页。
- 置信度 45 / Severity Medium

**COR-M2 多服务 `account_id` 由单次快照的链接数决定，瞬态缺链会来回翻转**

- 位置：`connectors/flowercloud/connector.ts:384-390`（`const multi = with_id.length > 1`）
- 证据：`with_id` 来自本次快照/HTTP 解析出的服务条目。`docs/blueprint/domain.md` 只声明"服务数 1→N 的瞬间账号标识整体切换一次，为已接受取舍"。
- 现象/影响：某服务链接在一次快照中瞬态缺失（页面结构漂移/部分失败到 error 段仍带 id，但真·缺链）时，`with_id.length` 在 1 与 N 之间摆动，账号标识在 `flowercloud_default` 与 `flowercloud_service_*` 之间反复切换，历史序列被切断，且用户可能看到账号行分裂/消失，超出文档所述一次性迁移假设。
- 修复建议：账号标识改为"按实例是否曾/当前存在多服务"稳定判定（或持久化服务集合），而非由单次页面内容推断；至少在 domain 文档中登记该风险。
- 置信度 50 / Severity Medium

### Low

**COR-L1 写入未发生时的失败原因文案语义错位**

- 位置：`src/main/core/session/flowercloud_dom.ts:580`（`return { written, kind: "usage" }`）、`:651-652`（`flower_failure_reason(outcome.kind)`）、`:277-289`（CAS/无 vault 时 `return false`）
- 证据：`run_flowercloud_snapshot` 只要轮询拿到 html 就返回 `kind:"usage"`，但 `write_flowercloud_html` 可能因"vault 无存储会话 / cookie 不安全 / CAS 检测到并发变更"返回 `false`。随后 `session-manager.ts:650-651` 用 `flower_failure_reason("usage")` → "花云页面已出现用量，但本轮未写入快照"。
- 现象/影响：CAS 跳过通常意味着"已有更新的快照/新凭据写入"（本应视为成功），却被上报为 `ok:false`，`refresh-service` 据此标记实例 `failed` 且跳过连接器，直到下一轮才恢复。注释"成功分类不应走到失败原因映射"与实际可达路径不符。
- 修复建议：区分 `written===false` 的 CAS/取消/无会话子原因；CAS 命中可返回 `{ok:true}`（已有更新数据）。
- 置信度 45 / Severity Low

______________________________________________________________________

## 3. 契约·类型

### Medium

**TYP-M1 宿主与连接器的 composite 分段格式两处独立实现，无跨模块往返测试**

- 位置：宿主 `src/main/core/session/flowercloud_dom.ts:113-122`（`compose_flower_sections`）；连接器 `connectors/flowercloud/connector.ts:229-244`（`parse_snapshot_sections`，正则 `<!--omni-flower id=(\d+)(?: error="([^"]*)")?-->([\s\S]*?)<!--/omni-flower-->`）
- 证据：`tests/unit/session/flowercloud_dom.test.ts` 只断言 compose 输出包含标记；`tests/integration/connector/flowercloud_connector.test.ts` 的 composite 用例用手写字符串构造输入，从未把宿主 `compose_flower_sections` 的真实输出喂给连接器。`docs/specs/flowercloud_usage.md:33` 声称两侧"由集成测试锁死一致性"——该断言仅对新鲜期常量（同文件 `connector.test.ts` 的常量契约用例）成立。
- 现象/影响：分隔符/属性格式任一侧漂移（如 error 属性引号、换行、`<!--/omni-flower-->` 拼写）不会被测试发现，静默导致连接器解析不到分段、退化为"整个 composite 当单页解析"，多服务错配或漏报。
- 修复建议：新增一条契约测试，import 两侧函数做 compose→parse 往返（或把宿主生成的 composite 写入 fixture 供连接器测试读取）。同时修正 spec 措辞。
- 置信度 80 / Severity Medium

### Info

**TYP-I1 vault 载荷结构在两侧各写一份**

- 位置：宿主 `flowercloud_dom.ts:48-72`（`FlowercloudSecretPayload`/`parse_flowercloud_secret`）与连接器 `connector.ts:17-54`（`required_cookie`）。
- 沙箱不共享 import 是已知约束（`flowercloud_dom.ts:105` 注释），本次靠测试锁定新鲜期常量，但同样缺 `cookie/html/captured_at` 结构本身的契约测试。与 TYP-M1 同源。
- 置信度 60 / Severity Info

______________________________________________________________________

## 4. 性能·资源

### Info

**PERF-I1 多服务快照的导航+settle 逐步逼近 45s 预算**

- 位置：`flowercloud_dom.ts:31`（`FLOWER_SNAPSHOT_TIMEOUT_MS = 45_000`）、`:317`（deadline）、`:550-555`（逐服务导航，每次 settle 缺省 2.5s）
- 现象：服务较多（如 5+）时，`N×(导航耗时+2.5s settle)` 可超过总预算，尾部服务以 `error` 标注写入。语义上符合 AC-003（不静默省略），但用户会看到部分服务"本轮未取到用量"。
- 建议：可选按发现的服务数动态放大 timeout，或把 settle 改为"用量值稳定即结算"。
- 置信度 50 / Severity Info

**PERF-I2 脱敏区间收集对本批无新增热点**

- `scrub_text`（`logger.ts:95-135`）对每个分组正则全量扫描并收集 `ranges`。超长 HTML 已在 `register` 阶段被挡在 pattern 之外，故不会为 8KB+ 文本构造巨型交替式。可接受。
- 置信度 60 / Severity Info

______________________________________________________________________

## 5. 架构·可维护性

### Low

**ARCH-L1 `persist_log_line` 与 `create_record` 平行维护 JSON 字段**

- 位置：`src/main/core/quit_source.ts:84-108`（手写 `{ ts, level, module, message, meta, trace_id }`）对比 `src/shared/lib/logger.ts:294-309`（`create_record`）
- 现象/影响：日志记录结构在两处独立演进，新增字段（如 sessionId）不会编译期暴露不一致，兜底行与常规行可能漂移。测试覆盖了本轮用到的字段，但机制上是平行实现。
- 修复建议：把 fallback 行也走 `create_record` + `safe_json_stringify`（或抽一个同步序列化入口）。
- 置信度 55 / Severity Low

**ARCH-L2 快照占用 `in_progress` 时，隐藏自动重登被以"Login already in progress"拒绝，语义误导**

- 位置：`src/main/core/session/session-manager.ts:136-151`
- 证据：`existing.hidden && !request.hidden` 分支只对"前台登录抢占后台会话"生效；快照（`hidden:true`）与自动重登（`hidden:true`）相遇时走 else → `reject("Login already in progress for instance")`。注释/日志会让人以为是登录冲突，实为快照占用。
- 现象/影响：自动重登失败原因难以从日志定位（`refresh-service.ts:738-742` 只记 message）。
- 修复建议：按 `existing.kind` 区分文案（"快照进行中，本轮跳过重登"）。
- 置信度 50 / Severity Low

**ARCH-I1 provider 特判集中化（正例，无缺陷）**

- `DOM_SNAPSHOT_PROVIDERS` / `PAGE_BOUND_CREDENTIAL_PROVIDERS`（`constants.ts:26-49`）取代了 session-manager / auth-ipc / refresh-service / index.ts 中的字面量特判，架构方向正确。`is_login_in_progress` 对 snapshot 返回 false（`session-manager.ts:667-679`）也符合规格。
- 置信度 80 / Severity Info

______________________________________________________________________

## 6. 健壮性·可观测性

### Medium

**ROB-M1 `await window.loadURL(...)` 无独立超时，可能超出快照预算并长期占用登记**

- 位置：`flowercloud_dom.ts:549`（初始页加载）、`:394`（逐服务导航）；总预算仅由 `:317,374` 的循环 deadline 约束
- 证据：`loadURL` 的 Promise 只在 `did-finish-load`/`did-fail-load` 落定；deadline 检查发生在轮询循环顶部，无法在 `await loadURL` 期间触发。Chromium 网络栈自带超时（通常数十秒）会最终 reject，因此非无限挂起，但单次可达数十秒、叠加多个服务可显著越过 45s，这段时间 `in_progress`/`flower_snapshots` 一直持有、窗口不关。
- 现象/影响：慢站/半死连接下刷新长时间卡 `loading`（`refresh-service.ts:447-450` 已先置 loading），且同实例后续刷新都 join 到同一个慢任务。
- 修复建议：给 `loadURL` 包一层 `Promise.race` 超时（复用剩余预算），超时按该服务/本轮失败处理。
- 置信度 40 / Severity Medium

### Low

**ROB-L1 空 hint URL 被判定为"落点不属于该服务"而非"无提示"**

- 位置：`flowercloud_dom.ts:499-515`（`hint_belongs_to_service` 解析失败返回 false）、`index.ts:790-801`（空串可能产生 `url:""`）
- 证据：`read_service_hint` 返回 `hint?.url ?? null`，但 `read_page_hint` 实现会返回 `{url: "", title: ""}`（字段缺失时）；`new URL("")` 抛错 → false → 服务被判"导航未到达该服务的详情页"。
- 现象/影响：真实 `location.href` 不会空，故生产低概率；但语义上"空 = 无提示不拦"比"空 = 不匹配"更稳健。
- 修复建议：`read_service_hint` 把空串视为 `null`。
- 置信度 40 / Severity Low

**ROB-I1 取消/关窗与登记的收敛（正例）**

- `window.on("closed")` → `state.cancelled`（`session-manager.ts:634-636`）；`finally` 兜底关窗 + 释放两处登记（`:652-661`）；`write_flowercloud_html` 双次取消校验 + CAS（`:251-290`）。t535 AC-005/AC-006 语义实现完整，测试有对应用例。
- 置信度 75 / Severity Info

______________________________________________________________________

## 7. 测试·规格

### Medium

同 **TYP-M1**（composite 一致性测试缺失）。

### Low

**TEST-L1 `quit_source.test` 裸调用扫描的两处口径局限**

- 位置：`tests/unit/main/quit_source.test.ts:228-264`
- 证据：`comment_line_re = /^\s*(?:\/\/|\*|\/\*)/` 只过滤"行首即注释"的行，行尾注释里出现 `app.quit()` 会误报为裸调用；`raw_re = /\bapp\s*\.\s*(?:quit|exit)\s*\(/` 不匹配 `electronApp.quit()`、`app["quit"]()`，架构文档已明示该缺口由 code review 兜住。
- 建议：按 token 级或至少剥离行尾注释后再扫描，减少误报/漏报。
- 置信度 60 / Severity Low

**TEST-L2 删除源文本断言改行为测试（正例）**

- `tests/unit/main/tray_menu.test.ts` 删除了 `p258` 的 index.ts 源文本绑定断言，改由 `main_panel_controller.test.ts` 的行为组合覆盖（`handle_browser_window_focus` 各状态）。方向正确；新增的 `main_source` 哨兵仍是弱包含断言，可接受。
- 置信度 70 / Severity Info

**TEST-I1 花云连接器测试覆盖完整**

- `tests/integration/connector/flowercloud_connector.test.ts` 覆盖 AC-001 多服务列表零 HTTP、composite 分段映射、AC-002 分段失败隔离、AC-003 仅列表快照逐服务 HTTP 补数且失败隔离、卡窗错配整体丢弃、stale（过旧/无 captured_at）、新鲜期常量契约；`tests/unit/session/flowercloud_dom.test.ts` 覆盖写入取消/CAS、多服务导航入库、单服务退化、hint 落点校验（gen_f003/f004）、全败保留旧值。测试触达真实生产逻辑，质量高。
- 置信度 75 / Severity Info

______________________________________________________________________

## 8. 文档规范

### Low

**DOC-L1 `docs/handoff.md:29` 关于 `engines.node` 的陈述已过时**

- 位置：`docs/handoff.md:29`
- 证据：文档称"`package.json` 尚未声明 `engines.node`，如需对贡献者强制可后续补"；但同批最老的 commit `0232e50e` 的 message 与 `package.json:129-131` 已声明 `"engines": { "node": ">=22" }`。handoff 写于该 commit 之后（`20608864` 更晚），陈述与最终状态矛盾。
- 影响：读者据 handoff 会以为仍需补 `engines.node`，属可纠正的事实错误。
- 修复建议：更新该行为"已声明 `engines.node >= 22`"。
- 置信度 90 / Severity Low

**DOC-L2 `docs/specs/flowercloud_usage.md:33` 对 composite 一致性的隐含承诺缺测试支撑**

- 位置：`docs/specs/flowercloud_usage.md:33`、`:45`
- 证据：§3 只对新鲜期常量真写了"由集成测试锁死一致性"；§5 表格把 composite 分段映射列为 connector 测试覆盖，但测试用手写字面量。见 TYP-M1。
- 建议：spec 明确"composite 格式由宿主导出 fixture + 连接器解析"的锁定方式，或补往返测试后保持措辞。
- 置信度 80 / Severity Low

### Info

**DOC-I1 与实现一致的文档已就位**

- `docs/blueprint/decisions.md`（044 后台优先）、`docs/blueprint/domain.md`（多服务账号模型）、`docs/blueprint/architecture.md`（退出来源漏斗 + 12 出口 + 双门禁）、`docs/findings/d063`（s040）、`docs/findings/d064`（headless 基线）、`docs/spikes/s040`、`docs/spikes/s041` 内容与代码逐一吻合；`docs/specs_index.md` 已登记 `app_quit_lifecycle`、`flowercloud_usage`。`docs/archive/pending/p267/p268/p269` 归档正确，`docs/pending/todo` 清空。
- 置信度 80 / Severity Info

**DOC-I2 大文件专项**

- 新增/显著变更文件中，`flowercloud_dom.ts`(594)、`connector.ts`(439)、`session-manager.ts`(734) 体量可接受；`refresh-service.ts`(889)、`provider-usage.ts`(873) 为存量。未发现新引入的超大文件；但 `flowercloud_dom.ts` 与 `connector.ts` 承载了相似的服务 id/分段解析逻辑（沙箱约束下不可避免的重复），已由 TYP-M1 覆盖。
- 置信度 65 / Severity Info

______________________________________________________________________

## Spec 合规

|spec / task|结论|备注|
|---|---|---|
|t535（flowercloud_background_first_refresh）|符合|AC-001~AC-006 有自动测试，前台化探针计数、取消/CAS、窗口登记收敛均已落地；AC-007 `[deploy]` 真机项按 spec 声明未自动验证。|
|t536（flowercloud_login_exit_lifecycle）|基本符合|AC-001（12 出口日志 + 同一 trace + 双层门禁）、AC-003、AC-004 有测试；AC-002 的"进程存活/托盘可用"端到端为 spec 明示的人工回填项，自动部分（不调退出 API、登记释放）已覆盖。|
|t537（flowercloud_multi_service_metrics）|符合|AC-001~AC-004 均有连接器/渲染层测试；卡窗错配整体补数规则与 s041 结论一致。|
|`docs/specs/flowercloud_usage.md`|基本符合，一处措辞缺支撑|采集/会话/写入保护/失败分类/cookie 回写与实现一致；composite 两侧一致性无测试（TYP-M1）。|
|`docs/specs/app_quit_lifecycle.md`|符合。|出口清单与 `QUIT_SOURCES`、architecture doc 三处一致。|

______________________________________________________________________

## Strengths

1. **后台优先落地彻底**：`flowercloud_dom.ts` 移除全部 `reveal`/`present_for_capture`/`handed_over`，`SessionWindow` 类型不再声明前台化方法（编译期消除调用面）；测试用 `shown/shown_inactive/opacity_calls` 探针固定回归（`flowercloud_dom.test.ts:224-244`）。
2. **写入保护双保险**：取消校验 + vault CAS（`flowercloud_dom.ts:251-290`），并有对应单测（取消、并发变更、正常写入）。
3. **退出来源可追溯 + 双层静态门禁**：`quit_source.ts` 漏斗 + `eslint no-restricted-properties` + `quit_source.test` 调用点扫描；12 出口目录、trace 串联、transport/级别缺失时同步兜底落盘全部有测试与真实 e2e 断言（`cli_control.spec.ts`）。
4. **provider 策略集中**：`DOM_SNAPSHOT_PROVIDERS` / `PAGE_BOUND_CREDENTIAL_PROVIDERS` 收口散落特判。
5. **脱敏算法修正**：由"逐个 pattern 依次替换"改为"原始文本收集区间 + 组内长值优先 + 重叠合并"（`logger.ts:95-135`），修复短凭据吃掉长凭据导致的 `prefix***suffix` 片段泄露；分组构建失败只丢单组并告警。
6. **stale 语义两侧对齐**：无 `captured_at` 视为过期（宿主 `flowercloud_dom.ts:525-537` + 连接器 `connector.ts:296-301`），且有常量契约测试。
7. **测试质量高**：新增测试触达生产逻辑，含 gen_f003/f004 落点核对、卡窗错配弃用、composite 失败隔离等边界；`tray_menu.test` 主动将源文本断言替换为行为测试。

______________________________________________________________________

## Appendix 溯源

### 已核对的 commit 列表（`git log --oneline origin/main..HEAD`，old→new）

```
0232e50e chore(env): upgrade project toolchain to pnpm 11
fd69652a refactor(session): extract flowercloud DOM snapshot module and harden refresh path
f62d434c fix(flowercloud): treat a snapshot without capture time as stale
39a5cca8 fix(logger): collect redaction ranges before replacing
e3780bba fix(muse): report real elapsed time when discovery fails before scanning
20608864 docs: record flowercloud usage contracts, pending items and handoff
c6266639 task(t535,t536,t537): create flowercloud background-first, lifecycle and multi-service tasks
2bcc8f4c docs(pending): archive p267/p268/p269 into t535/t536/t537
56c01c1b docs(spike): verify flowercloud challenge shape and capture-window behavior (s040, d063)
6b3ab48e feat(session): make flowercloud snapshot capture background-only (t535)
11200366 docs(t536): accept instrumentation-first plan for quit-origin localization
289f1a8c merge(t535): t535_flowercloud_background_first_refresh
3b8ea11b feat(main): trace quit request sources and harden flowercloud session lifecycle (t536)
091f259d feat(flowercloud): per-service multi-service metrics collection and display (t537)
7219929f merge-chain(t537)
9eb54a76 fix(renderer): show reset date/clock on ratio usage rows (flowercloud refresh time)
```

### 主要证据位置

- 花云快照：`src/main/core/session/flowercloud_dom.ts:113-122,251-290,306-465,518-593`；`session-manager.ts:592-666`；`session-types.ts:47-65`
- 退出来源：`src/main/core/quit_source.ts:23-36,50-75,84-108,110-161`；`eslint.config.ts:50-70`；`tests/unit/main/quit_source.test.ts:228-264`
- 脱敏：`src/shared/lib/logger.ts:22-148`
- 调度：`src/main/core/scheduler/refresh-service.ts:452-492`
- 连接器：`connectors/flowercloud/connector.ts:205-260,292-437`
- 渲染：`src/renderer/components/UsageRows.tsx:98-101`；`src/renderer/lib/provider-usage.ts:114-162,399-419`
- 文档：`docs/handoff.md:29`；`docs/specs/flowercloud_usage.md:33,45`；`docs/blueprint/decisions.md`（044）；`docs/findings/d063`、`d064`

### 未执行

未运行 `pnpm test` / `typecheck` / `lint` / e2e（遵循"不跑构建/测试"约束）。凡涉及运行时行为的结论均标注了置信度。
