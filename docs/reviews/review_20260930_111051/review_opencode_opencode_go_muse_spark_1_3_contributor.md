# 审阅报告 — opencode / opencode-go/muse-spark-1.3-contributor

- 本路模型标识：opencode / opencode-go/muse-spark-1.3-contributor
- 审阅范围：`origin/main..HEAD` 共 16 commit（0232e50e→9eb54a76），`git diff origin/main..HEAD` 约 77 文件 +8129/-299。重点文件已全文只读：`src/main/core/session/flowercloud_dom.ts`（594 行）、`session-manager.ts`（734 行）、`session-types.ts`、`src/main/core/quit_source.ts`（166 行）、`src/main/core/scheduler/refresh-service.ts`（889 行）、`src/main/core/logging.ts`、`src/renderer/components/UsageRows.tsx`、`src/renderer/lib/provider-usage.ts`、`src/shared/lib/logger.ts`、`connectors/flowercloud/connector.ts`、`connectors/muse/connector.ts`、`src/shared/constants.ts`、`eslint.config.ts`、`mise.toml`、`package.json`、`pnpm-workspace.yaml`、`src/main/index.ts`、`auth-ipc.ts`、`application-menu.ts`、`main-panel-controller.ts`、`cli_init.ts`，以及 `docs/specs/flowercloud_usage.md`、`docs/handoff.md`、`docs/blueprint/testing.md`。
- 方式：只读审阅，未跑构建/测试。时限内完成，未超时。

## 1. 安全

### Medium — seed 分区灌 cookie 路径缺安全校验（写路径有，读路径无）

- 位置：`src/main/core/session/flowercloud_dom.ts:134-157`（`seed_partition_cookies`）。
- 证据：写路径 `write_flowercloud_html:273` 有 `is_safe_cookie_string(cookie)` 拒绝，`flower_auth_cookie_header:227`、`cookie_override:268` 均校验；但 `seed_partition_cookies` 对 vault 取出的 `cookie_str` 仅 `split(";")` 后直接 `session.set_cookie(login_url, name, value)`，未调 `is_safe_cookie_string`，vault 被污染（含 CRLF/超长）时可灌入 Electron session。
- 影响：低概率（vault 本地），但与写路径 hardening 不对称；Electron `set_cookie` 可能拒收或产生异常未被捕获（函数外层 `init_session_and_load:569` 仅 debug吞错，尚可）。
- 修复：灌入前对整串或逐个 `name=value` 做 `is_safe_cookie_string` 过滤，或复用 `merge_cookie_header` 的 `put` 白名单逻辑；置信度 75。

### Low — 分段 error 标注仅过滤引号/换行，`-->` 可破坏注释分段

- 位置：`src/main/core/session/flowercloud_dom.ts:113-122`（`compose_flower_sections`），解析侧 `connectors/flowercloud/connector.ts:parse_snapshot_sections`。
- 证据：`section.error.replace(/["\r\n]/g, " ")`；注释标记为 `<!--omni-flower id=.. error=".."-->…<!--/omni-flower-->`，error 含 `--`/`>` 即违反 HTML 注释语法，解析正则 `([^"]*)` 可能错位。
- 影响：error 文案当前来自固定文案/分类原因，可控；未来上游文案变化才暴露。修复：同时把 `--` 替换为空格或对 error 做长度截断；置信度 70。

### Info — 超长脱敏跳过 + warn-once 策略正确，HTML 快照不进正则

- 位置：`src/shared/lib/logger.ts:22-28,73-83`。
- 证据：`MAX_SCRUB_VALUE_LENGTH=8192`，超长拒绝注册并 `console.warn` 一次；`read_page_hint`（`src/main/index.ts` 新增）仅回传 `{url,title}`，DOM 正文不进日志。
- 评价：正确。提醒：spike 产物 `docs/spikes/*/code/*.json`（单个 419KB）含真实页面 HTML，已入库前应确认无 cookie/session 残留（本审阅未逐字节扫描该 JSON，仅抽查结构）。置信度 80。

## 2. 正确性

### High — 优点先行：落点精确比对修复子串误配（gen_f004）

- 位置：`src/main/core/session/flowercloud_dom.ts:494-515,419-428`。
- 证据：`hint_belongs_to_service` 用 `new URL(url).searchParams.get("id") === service_id`，注释明确 `id=8848 vs 88480 / redirect_id` 反例；捕获前复核 hint，不匹配记该服务失败而非错配入库。
- 评价：正确且关键；`read_service_hint` 返回 null（测试窗口未实现）时跳过核对，退化安全。置信度 90。

### Medium — `skip_if_fresh` 在 window 创建之后判定，每轮仍开一次隐藏窗

- 位置：`src/main/core/session/session-manager.ts:616-631`（先 `create_window`），`src/main/core/session/flowercloud_dom.ts:524-538`（后判定新鲜跳过）。
- 证据：spec（`docs/specs/flowercloud_usage.md §3`）自述“实现上仍会创建隐藏窗并在判定后立即关闭”。功能正确（不可见、无前台影响），但每个新鲜定时轮都付一次 BrowserWindow 创建/销毁代价。
- 修复：`refresh_flowercloud_snapshot` 在 `create_window` 前先读 vault 判鲜（`parse_flowercloud_secret` 纯函数，可前移），命中直接返回；置信度 85。

### Low — `LOGIN_WINDOW_KEEP_OPEN_PROVIDERS` 与 `PAGE_BOUND_CREDENTIAL_PROVIDERS` 共享同一 Set 身份

- 位置：`src/shared/constants.ts:22-40`（`... = PAGE_BOUND_CREDENTIAL_PROVIDERS`）。
- 证据：直接引用赋值而非 `new Set(...)`；`ReadonlySet` 仅编译期约束，运行时任一处 `add` 互相污染。
- 修复：`new Set(PAGE_BOUND_CREDENTIAL_PROVIDERS)`；置信度 90。

### Info — CAS 写保护与双取消校验正确

- 位置：`src/main/core/session/flowercloud_dom.ts:251-290,570-579`。
- 证据：写入前二次 `is_cancelled` + `vault.get` 复核（`current !== raw` 放弃）；并发同实例由 `flower_snapshots` 去重（`session-manager.ts:609-610,653-664`）。登录/快照跨路径竞写（登录 `save_cookie_on_close` 无 CAS）残留理论竞态，但登录抢占快照时快照已 cancel 不写，反向（快照覆盖新登录）被 CAS 挡住。正确。置信度 85。

### Info — muse `start_time` 初值修复正确

- 位置：`connectors/muse/connector.ts:145`（`let start_time = Date.now()`）。
- 证据：无分包可扫时失败日志不再打印 epoch 时长。正确。置信度 95。

## 3. 契约·类型

### Low — `read_page_hint` 与 `read_service_hint` 职责重叠

- 位置：`src/main/core/session/flowercloud_dom.ts:484-515`。
- 证据：`read_page_hint` 返回 `"url title"` 字符串（仅失败日志用，`561`），`read_service_hint` 返回 `url`（导航核对用）。两者各调一次 `window.read_page_hint?.()`，可合并为一次读取。
- 修复：保留其一，另一改为纯字符串裁剪；或缓存单轮 hint。置信度 80。

### Info — sandbox 两侧重复解析有注释声明 + 契约测试锁定，接受

- 位置：`src/main/core/session/flowercloud_dom.ts:102-122` vs `connectors/flowercloud/connector.ts:service_ids/parse_snapshot_sections/card_windows`。
- 证据：宿主注释“解析方为独立 connector 脚本，同格式在其内部复刻（沙箱边界不共享 import）”；新鲜期常量两侧各一份 + 一致性契约测试（handoff 陈述，spec §3 亦声明）。
- 评价：重复系边界所迫，已文档化；漂移风险由测试兜底。置信度 85。

### Info — eslint 漏斗门禁正确

- 位置：`eslint.config.ts:50-70`，`src/main/core/quit_source.ts:23-36`。
- 证据：`files: src/**/*.ts` + `ignores: quit_source.ts` 禁 `app.quit/app.exit`；`QUIT_SOURCES` 12 项与调用点（cli.help/export/control、control-api.restart/quit、tray.quit/restart、will-quit.flush-retry、startup.\*、menu.cmd-q、single-instance.lock-lost）一一对应，单测另做一致性扫描（testing.md）。
- 评价：正确。置信度 90。

## 4. 性能·资源

### Medium — 仓库纳入 spike 大体积产物（图片 + 419KB JSON×2）

- 位置：`docs/spikes/s040_flowercloud_challenge_probe/code/`（`revealed_state.png` 81KB、`transparent_state.png` 80KB、`probe_v2_*.json` 各 419KB）、`docs/spikes/s041_*/code/`。
- 证据：`git diff --stat` 显示 Bin + 大 JSON 入库；一次性探针证据长期进仓库，每次 clone/fetch 付费。
- 修复：探针 JSON/截图移 `.scratch/` 或归档后由 `repo-hygiene` 迁 `docs/archive/spikes/` 时瘦身；至少确认不含秘密后保留最小复现。置信度 80。

### Low — `scrub_text` 从单正则变为多分组扫描，日志热路径变重

- 位置：`src/shared/lib/logger.ts:95-134`。
- 证据：每行日志对每个分组 `exec` 全文 + 区间排序合并；注册值达数千（上限 10000，组大小 500→20 组）时每行 20 次扫描。为正确性（长凭据优先、跨组重叠合并）所必需，且 8192 上限挡住巨串。
- 评价：取舍正确，建议后续在 findings 留一条性能注脚（高频 debug 日志 + 大注册表时的量级）。置信度 75。

### Info — 多服务逐个导航受 45s deadline 有界，失败隔离正确

- 位置：`src/main/core/session/flowercloud_dom.ts:31-33,306-465`。
- 证据：`timeout_ms 45s / settle 2.5s`；服务多时 `partial_result` 把未达服务记 error 而非静默丢（AC-003），全败不写快照保留旧值（t535 语义）。连接器侧缺数服务 HTTP 补数逐个 try/catch（`connectors/flowercloud/connector.ts:resolved` 循环）。正确。置信度 85。

## 5. 架构·可维护性

### Medium — `poll_flower_usage_html` 状态机 ~160 行，单函数承载六种形态

- 位置：`src/main/core/session/flowercloud_dom.ts:306-465`。
- 证据：单页/列表发现/逐服务导航/落点核对/settle/超时部分结果六态交织在同一 while 循环 + 闭包 `partial_result/enqueue`；注释充分（t537/gen_f003/gen_f004）但后续改结算语义易误伤。
- 修复（后续 task）：拆 `discover → visit(service) → settle → compose` 四小函数，poll 只做调度；本轮不阻塞。置信度 80。

### Info — 模块拆分与查表收敛正确

- 位置：`session-types.ts:1-6`（环切割注释）、`session-manager.ts:1-31`（重导出保持兼容）、`constants.ts:DOM_SNAPSHOT_PROVIDERS/PAGE_BOUND_CREDENTIAL_PROVIDERS`、`auth-ipc.ts:285`（特判改查表）、`refresh-service.ts:452`（`DOM_SNAPSHOT_PROVIDERS.has`）。
- 评价：10 处字面量特判收敛为查表（handoff 语）；`main-panel-controller.handle_browser_window_focus` 把 focus 处理器抽为可测纯函数（AC-004）。方向正确。置信度 90。

### Info — pnpm 11 迁移配置正确

- 位置：`mise.toml:5`（`pnpm 11.26.0`）、`package.json:packageManager/engines`、`pnpm-workspace.yaml:nodeLinker/allowBuilds`、`.npmrc`（仅注释）。
- 证据：`node-linker=hoisted→nodeLinker: hoisted`、`onlyBuiltDependencies→allowBuilds` 符合 pnpm11 语义；`allowBuilds` 删 `electron` 与“electron 44 无 postinstall”一致（handoff §8）。
- 评价：正确。置信度 85。

## 6. 健壮性·可观测性

### Info — 退出漏斗 + 同步兜底 + 同 trace 关停行，设计完整

- 位置：`src/main/core/quit_source.ts:50-121,139-161`，`src/main/core/logging.ts:67-73`（`getCurrentLogFilePath` 同源命名），`src/main/index.ts:before-quit/will-quit/startup` 接线。
- 证据：无 transport/级别过滤时同步 `appendFileSync` 同一活动日志文件；`request_app_exit` 先 `flushLogTransports` 再 `app.exit`；`before-quit` 关停行带 `exit_source+trace_id`（漏斗外 `untracked`）；`persist_log_line` try/catch 不阻塞退出。`request_app_quit`（graceful）不 flush 正确——flush 由 will-quit 链承担。置信度 90。

### Info — 抓取失败与采集失败同降级路径（stale 翻转）

- 位置：`src/main/core/scheduler/refresh-service.ts:418-492,834`。
- 证据：`mark_observations_stale` 提前置于抓取分支可用；抓取 `ok:false`/抛异常→`failed+lastSuccess保留+stale副本`，不再浪费预算重放旧 HTML；`budget` 创建移至抓取之后（抓取不计 15s 预算）注释明确。`generation` 在抓取后复核，force 接管不跑旧连接器。正确。置信度 90。

### Info — 快照窗 `closed→cancelled` 接线 + 交互登录抢占，取消不再误报

- 位置：`src/main/core/session/session-manager.ts:622-636`，`is_login_in_progress:667-679`（snapshot 不冒充 login）。
- 证据：spec §3 互斥三条（登录中快照跳过/前台登录抢占快照/手动关窗=cancel）与实现一致。正确。置信度 85。

## 7. 测试·规格

- Spec 合规（`docs/specs/flowercloud_usage.md`、`docs/specs/app_quit_lifecycle.md`、`docs/specs_index.md`）：
    - t535 后台优先：隐藏窗抓取、不前台化、失败保旧值+可读原因（`flower_failure_reason` 穷尽 switch，`flowercloud_dom.ts:195-217`）——合规。
    - t536 生命周期：12 来源漏斗 + eslint 门禁 + focus 只 hide（`handle_browser_window_focus`）+ 会话异常隔离（testing.md 列单测矩阵）——合规。
    - t537 多服务：`account_id` 单服务 `flowercloud_default`/多服务 `flowercloud_service_<id>`、composite 分段 + error 标注、全败保旧、卡窗错配整体弃用补数、实例备注多账号回退（`provider-usage.ts:399-419`）、ratio 行显示 reset 时间（`UsageRows.tsx:98-101`，`9eb54a76`）——合规。
- 测试覆盖：新增 `flowercloud_dom.test.ts`（540 行，写入取消/CAS/多服务导航/退化形态）、`session-manager.test.ts`（+621，互斥/抢占/去重/cookie 合并/新鲜跳过）、`refresh-service.test.ts`（单测 307 + 集成 92，抓取先行/loading/force/失败不跑连接器/stale 副本）、`quit_source.test.ts`（265，12 来源/trace/兜底/一致性扫描）、`flowercloud_multi_service_card.test.tsx`（146，AC-004）、`usage_rows.test.tsx`（+45，ratio reset）、`scrubber.test.ts`（+47，区间合并）、`flowercloud_connector.test.ts`（+305，三形态/失败隔离/常量一致性）。与 spec §5 验证表一致。未执行测试（依任务要求），以 handoff“4224 passed / 1 skipped”备查。
- 缺口（Low）：`skip_if_fresh` 的“创建窗后立即关”属实现浪费但 spec 已如实记录，不算违规；建议后续把“先判鲜再建窗”补为 AC。

## 8. 文档规范（含死代码/重复/过时探针/超大文件专项）

### Medium — `docs/handoff.md` 已过时（head 与状态滞后两代）

- 位置：`docs/handoff.md:1-12`。
- 证据：handoff 写 `head_commit 8b15016d`“工作区未提交”，实际本段 HEAD 为 `9eb54a76` 且 t535/t536/t537 均已合并；“package.json 尚未声明 engines.node”与 diff 已加 `engines.node>=22` 矛盾；“branch main + 未提交”描述亦过期。
- 修复：按 AGENTS.md 交接纪律更新最新一节（含 branch 与交出时 head_commit），过时段落迁 `docs/archive/handoff.md`；置信度 95。

### Low — `read_page_hint`/`read_service_hint` 重复（见 §3）；`flower_product_details_id` 为 `flower_service_ids[0]` 薄包装，保留可接受。

- 位置：`flowercloud_dom.ts:78-80,83-95,484-515`。
- 死代码扫描：`flower_snapshot_url` 已移除（spec 声明），本段未见残留引用；`should_hide_popup_on_outside_focus` 仍被 `handle_browser_window_focus` 复用，非死代码。置信度 80。

### Info — 超大文件专项

- `refresh-service.ts` 889 行、`provider-usage.ts` 873 行、`session-manager.ts` 734 行、`flowercloud_dom.ts` 594 行：均未破千行红线；`refresh-service` 增长系 `mark_observations_stale` 提升复用（删除旧内联块，等量替换），可接受。`poll_flower_usage_html` 复杂度见 §5 Medium。

### Info — 文档整体质量高

- `docs/specs/flowercloud_usage.md`（新鲜期/stale/多服务/composite 格式/互斥/写入保护/常量双份契约）与实现逐条可溯；`docs/blueprint/testing.md` 补 t536 门禁 + d064 headless 基线 + probe 窗口许可行；spike `s040/d063`、`s041` 报告与实现注释互相引用。`docs/specs_index.md` +2 行已登记。置信度 90。

## Strengths（本次做得好的 3 点）

1. s040 硬证据驱动“永不前台化”：隐藏窗 `document.hidden=false` + reveal 升级挑战的因果写进模块头注释、spec、findings 三处，`show/showInactive/setOpacity` 零调用可验。
2. 脱敏从“单正则替换”升级为“原始文本区间收集 + 长优先 + 重叠合并”，修掉 `prefix***suffix` 片段泄露一类真漏洞，且失败/超长均留痕不静默。
3. 退出可观测性闭环：漏斗 + eslint 禁绕 + 同 trace 关停行 + 无 transport 同步兜底，日志可回答“谁请求了退出”。

## Appendix 溯源（commit→内容）

- `0232e50e`：pnpm 11（mise.toml/packageManager/engines/nodeLinker/allowBuilds/.npmrc 注释化）。
- `fd69652a/f62d434c/39a5cca8/e3780bba`：会话拆分 + 无 captured_at 按 stale + 脱敏区间合并 + muse 真实耗时。
- `6b3ab48e/289f1a8c`（t535）：后台-only 快照、失败保旧、`skip_if_fresh`/`force`。
- `3b8ea11b/11200366`（t536）：`quit_source.ts` 漏斗、eslint 门禁、`handle_browser_window_focus`、快照/登录互斥、`has_log_transports/is_log_level_enabled`。
- `091f259d/7219929f`（t537）：逐服务导航 + composite 分段 + 连接器三形态/补数/逐服务失败 + UI 实例备注回退。
- `9eb54a76`：ratio 行 reset date/clock 显示。
- 文档：`20608864/c6266639/2bcc8f4c/56c01c1b`（spec/pending→task/spike s040+s041/d063+d064）；`docs/handoff.md` 滞后见 §8。

## 总评

- Critical：0；High：0（有一处 High 级“优点”，非缺陷）；Medium：4（seed 路径校验、分段 `-->` 清洗、spike 大产物入库、handoff 过时）；Low：3；Info：多条。
- 是否可合入：本段已合入（审阅对象即 `origin/main..HEAD`）。建议后续小 task 跟进 Medium 4 项，均不构成回滚理由。
