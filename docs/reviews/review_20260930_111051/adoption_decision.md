# 审阅结果决策

## 目录

docs/reviews/review_20260930_111051

## 报告来源

- 已读：review_kimi_kimi_code_kimi_for_coding.md, review_opencode_opencode_go_muse_spark_1_3_contributor.md, review_opencode_opencode_go_deepseek_v4_1_flash.md, review_opencode_cpa_gemini_3_8_flash.md
- 缺失：无（4/4 齐全；注：kimi 报告为 `review_<agent>_<model>.md` 现行命名，合并前已修 my-adoption 白名单兼容该格式）
- 范围：`origin/main..HEAD` 16 commit 整段（77 文件，+8129/-299）；四路均判 0 Critical，spec t535/t536/t537 基本合规

## 统计

- 采纳：19 项
- 不采纳：13 项
- 待决定：0 项

## 待决定项（已全部决策）

无（D1–D7 已按用户决策移入采纳/不采纳：D2→A17、D4→A18、D6→A19；D1→R10、D3→R11、D5→R12、D7→R13）。

## 采纳项

### A1. seed 分区回灌 cookie 加安全校验（与写路径对齐）

- 来源：review_opencode_opencode_go_muse_spark_1_3_contributor（Medium），review_opencode_opencode_go_deepseek_v4_1_flash（SEC-L1，Low）
- 位置：src/main/core/session/flowercloud_dom.ts:134-157（`seed_partition_cookies`）
- 优先级：MEDIUM
- 详细判断理由：写路径 `write_flowercloud_html:273` 等三处均调 `is_safe_cookie_string`，唯回灌分区直接 `set_cookie`；同一模块安全基线不对称，vault 被外部导入污染时先经此处注入。两路独立指出，位置一致。
- 修复说明：在 `seed_partition_cookies` 内对整串或逐个 `name=value` 做 `is_safe_cookie_string` 过滤后再 `set_cookie`，与写入路径对齐。

### A2. composite 分段补宿主→连接器往返契约测试，并修正 spec 措辞

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（TYP-M1，Medium），review_kimi_kimi_code_kimi_for_coding（T2 Low + X2 Medium），review_opencode_cpa_gemini_3_8_flash（DOC-L2，Low）
- 位置：src/main/core/session/flowercloud_dom.ts:113-122；connectors/flowercloud/connector.ts:229-244；docs/specs/flowercloud_usage.md:33、45；tests/integration/connector/flowercloud_connector.test.ts:466-494
- 优先级：MEDIUM
- 详细判断理由：三路独立指出同一缺口：compose 与 parse 各自手写格式，集成测试用手写字面量从未用宿主真实输出喂连接器；spec §3"由集成测试锁死一致性"仅对新鲜期常量成立，composite 部分无支撑。分隔符/属性漂移将静默退化为整页解析。
- 修复说明：新增一条契约测试 import 宿主 `compose_flower_sections` 生成 composite 再跑真实 connector 解析断言；spec §3 明确"composite 格式由宿主导出 fixture + 连接器解析锁定"（或测试补齐后保留措辞）。

### A3. 更新 docs/handoff.md 最新节（与 HEAD 对齐）

- 来源：review_kimi_kimi_code_kimi_for_coding（D1，Medium），review_opencode_opencode_go_muse_spark_1_3_contributor（Medium），review_opencode_cpa_gemini_3_8_flash（DOC-001，Medium），review_opencode_opencode_go_deepseek_v4_1_flash（DOC-L1，Low）
- 位置：docs/handoff.md:1-29
- 优先级：MEDIUM
- 详细判断理由：四路全中：头部仍写 head 8b15016d"工作区未提交"，实际 HEAD 已是 9eb54a76 且 t535/t536/t537 全合入；"engines.node 尚未声明"与本批新增 `"engines": {"node": ">=22"}` 矛盾；2026-09-29 节"超时亮窗交接"方案已被 t535/决策 044 移除。入口文档误导下一棒。
- 修复说明：按 AGENTS.md 交接纪律新增最新一节（含 branch 与交出时 head_commit 9eb54a76、16 commit 与三 task 闭环状态），旧节中 reveal/交接方案与 engines 陈述就地标注废止或迁 `docs/archive/handoff.md`。

### A4. CAS 基线前移到捕获起点并传入比对

- 来源：review_opencode_cpa_gemini_3_8_flash（COR-001，Medium，置信度 95）；佐证：review_kimi_kimi_code_kimi_for_coding（C2，Low，check-set 非原子残余）
- 位置：src/main/core/session/flowercloud_dom.ts:262-294（`write_flowercloud_html`）；调用侧 `run_flowercloud_snapshot:483-547`
- 优先级：MEDIUM
- 详细判断理由：基线 `raw` 在写入函数入口才读，与 `current` 仅隔微秒；poll 数十秒窗口内外部更新凭据后 `raw` 已是新值，`current !== raw` 恒相等，旧 HTML 覆盖新登录载荷。现有单测 mock 连续两次 get 掩盖了真实耗时窗口。置信度 95，属真 bug。
- 修复说明：`run_flowercloud_snapshot` 起点读取初始载荷作 `expected_vault_value` 传入 `write_flowercloud_html`，落盘前比对 `current !== expected`；同时在注释补一句"校验与写入间非原子（本地 vault 窗口极小）"。

### A5. skip_if_fresh 判定前移到建窗之前，并补零开窗断言

- 来源：review_opencode_opencode_go_muse_spark_1_3_contributor（Medium），review_kimi_kimi_code_kimi_for_coding（X1，Medium）
- 位置：src/main/core/session/session-manager.ts:616-631；src/main/core/session/flowercloud_dom.ts:524-538；tests/unit/session/session-manager.test.ts:168-172
- 优先级：MEDIUM
- 详细判断理由：生产顺序先开窗后判鲜，每新鲜轮付一次 BrowserWindow 创建/销毁；测试用例名"skips opening a window"实际开了窗（窗口数组恒为 1 无法区分），skip 语义无断言固定。spec 已如实记录故不算违规，但属实现浪费 + 测试误导。
- 修复说明：`refresh_flowercloud_snapshot` 在 `create_window` 前先读 vault 判鲜（`parse_flowercloud_secret` 纯函数前移），命中直接返回；X1 用例改为断言 skip 路径 `create_window` 零调用。

### A6. 负年龄快照视为过期（两处统一）

- 来源：review_kimi_kimi_code_kimi_for_coding（C1，Medium，置信度 65）
- 位置：src/main/core/session/flowercloud_dom.ts:528-537；connectors/flowercloud/connector.ts:66-67
- 优先级：MEDIUM
- 详细判断理由：两处只判上限不判下限；时钟回拨/NTP/迁移致负 age 时定时刷新永久跳过且 connector 不标 stale，UI 静默显示旧数据。触发概率低但后果是无感知的过期数据，修复为两行边界条件。
- 修复说明：宿主改为 `age >= 0 && age <= FRESH_MS`，connector 改为 `age < 0 || age > FRESH_MS` 视为过期（或 `Math.max(0, age)`）。

### A7. LOGIN_WINDOW_KEEP_OPEN_PROVIDERS 改为独立 Set

- 来源：review_opencode_opencode_go_muse_spark_1_3_contributor（Low，置信度 90）
- 位置：src/shared/constants.ts:22-40
- 优先级：LOW
- 详细判断理由：直接引用赋值而非拷贝，`ReadonlySet` 仅编译期约束，运行时任一处 `add` 互相污染。一行修复，零风险。
- 修复说明：改为 `new Set(PAGE_BOUND_CREDENTIAL_PROVIDERS)`。

### A8. 分段标记做无害化清洗（error 的 `--` 与体部闭合标记假设登记）

- 来源：review_opencode_opencode_go_muse_spark_1_3_contributor（Low），review_kimi_kimi_code_kimi_for_coding（S1，Low）
- 位置：src/main/core/session/flowercloud_dom.ts:113-122；connectors/flowercloud/connector.ts:231
- 优先级：LOW
- 详细判断理由：两路同指一处：error 仅过滤引号/换行，含 `--`/`>` 即违反 HTML 注释语法致解析错位；html 体部若出现字面 `<!--/omni-flower-->` 则闭合点提前。概率极低但属静默错解析，清洗成本一行。
- 修复说明：compose 时把 error 中 `--` 替换为空格（+ 长度截断）；html 体部冲突假设在注释登记。A2 的往返测试落地后由其锁定。

### A9. 删除 provider-usage.ts 恒假的 undefined 守卫

- 来源：review_kimi_kimi_code_kimi_for_coding（C3，Low，置信度 90）
- 位置：src/renderer/lib/provider-usage.ts:134、415
- 优先级：LOW
- 详细判断理由：`collected_label` 类型恒为 string，`:415` 的 `=== undefined` 恒假，无运行时影响但误导读者。删守卫或注明不变式，零风险。
- 修复说明：删除该守卫（类型已保证），或在 `collected_label` 处注明不变式后删除。

### A10. persist_log_line 写入前加脱敏

- 来源：review_opencode_cpa_gemini_3_8_flash（SEC-001，Low，置信度 90）
- 位置：src/main/core/quit_source.ts:84-110
- 优先级：LOW
- 详细判断理由：同步兜底直接 `JSON.stringify` 落盘未过 `scrub_text`；当前调用方传参干净故无泄漏，但属纵深缺口。scrubber 为纯函数无 transport 依赖，可在兜底路径调用，不破坏"无 transport 可写盘"的设计。
- 修复说明：`appendFileSync` 前对序列化字符串调一次 `scrubber.scrub_text`（或对 meta 限定白名单字段）。

### A11. 空 hint URL 视同无提示（null）

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（ROB-L1，Low）
- 位置：src/main/core/session/flowercloud_dom.ts:499-515（`hint_belongs_to_service`/`read_service_hint`）
- 优先级：LOW
- 详细判断理由："空 = 无提示不拦"比"空 = 落点不匹配"更稳健；真实 location.href 不会空，改动无回归面。
- 修复说明：`read_service_hint` 把空串视为 `null`。

### A12. 快照占用 in_progress 时重登拒绝文案区分 kind

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（ARCH-L2，Low）
- 位置：src/main/core/session/session-manager.ts:136-151；日志消费侧 src/main/core/scheduler/refresh-service.ts:738-742
- 优先级：LOW
- 详细判断理由：快照（hidden）与自动重登（hidden）相遇走 else，被记为"Login already in progress"，实为快照占用，误导排障。纯文案区分，零风险。
- 修复说明：按 `existing.kind` 区分文案（快照占用→"快照进行中，本轮跳过重登"）。

### A13. 补 X5 缺失的五个分支场景测试

- 来源：review_kimi_kimi_code_kimi_for_coding（X5，Low）
- 位置：tests/unit/session/session-manager.test.ts；src/main/core/session/flowercloud_dom.ts:508-515、147
- 优先级：LOW
- 详细判断理由：`read_service_hint` 抛错回退、`seed_partition_cookies` 损坏载荷分支、中途关窗 cancelled 边界、`request_app_exit` flush 先于 exit 顺序，均无用例。补测试只增不改生产逻辑。
- 修复说明：逐项补单测：hint 抛错→null 跳过核对；`{` 开头无 cookie 载荷不灌；抓取中途关窗走 cancelled；`request_app_exit` 断言 flush 先于 exit。

### A14. AC-002 用例 2s 超时预算放宽

- 来源：review_kimi_kimi_code_kimi_for_coding（X6，Low）
- 位置：tests/unit/session/session-manager.test.ts:1502-1540
- 优先级：LOW
- 详细判断理由：真实等待 2s 超时预算，慢机误报风险；注释已自知。放宽预算或改 fake-timer，零生产影响。
- 修复说明：放宽该用例超时预算（或改用 fake timer），消除慢机 flaky。

### A15. usage_rows 补长数值 reset 布局回归用例

- 来源：review_opencode_cpa_gemini_3_8_flash（TST-001，Info→LOW）
- 位置：tests/unit/renderer/components/usage_rows.test.tsx:144-187
- 优先级：LOW
- 详细判断理由：9eb54a76 移除了 ratio 行 reset_time 隐藏，单测仅覆盖 `34.56/150` 短值存在性，未覆盖长值（如 `1228.80GB / 2048.00GB`）溢出样式回归。补一组用例即可。
- 修复说明：新增一组长文本数值用例，断言 date/clock 容器类名与属性未受损。

### A16. findings 补 scrubber 热路径性能注脚

- 来源：review_opencode_opencode_go_muse_spark_1_3_contributor（Low，取舍正确）
- 位置：docs/findings/（scrubber 相关条目或新增）
- 优先级：LOW
- 详细判断理由：`scrub_text` 多分组扫描在注册值数千时每行 20 次扫描，为正确性所必需；留注脚记录量级即可，无需改代码。
- 修复说明：在 findings 就地修订或新增一条：高频 debug 日志 + 大注册表时的扫描量级说明。

### A17. vault 花云载荷对解析后 cookie 单独注册脱敏

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（SEC-M1，Medium）；分歧见原 D2（两路 Info 认为现状可接受）
- 位置：src/shared/lib/logger.ts:22-29、74-87；src/main/core/vault/file-vault-backend.ts:206
- 优先级：MEDIUM
- 详细判断理由：用户决策选 A。花云 vault 值是 `JSON.stringify({cookie, html, captured_at})`，整页 DOM 必超 8192 上限致整条凭据不进脱敏注册表；机制优于约定，改动局限在 vault 读写侧。
- 修复说明：vault 读写侧对 JSON 载荷解析后单独 `scrubber.register(parsed.cookie)`（短 cookie 进注册表，长 HTML 仍挡）。
- 原待决定项：D2（用户决策：A）

### A18. domain.md 登记多服务身份瞬态翻转风险（D4 选项 B 范围）

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（COR-M2，Medium）
- 位置：connectors/flowercloud/connector.ts:384-390；docs/blueprint/domain.md（多服务账号模型段）
- 优先级：MEDIUM
- 详细判断理由：用户决策选 B（保持现状 + 登记风险）：持久化服务集合改动大而触发概率不明，先显式化约束，待真实翻转案例再做持久化判定。
- 修复说明：仅在 domain.md 多服务账号模型处登记：身份由单次页面 `with_id.length` 推断，瞬态缺链可能在 `flowercloud_default` 与 `flowercloud_service_*` 间翻转；不改连接器逻辑。
- 原待决定项：D4（用户决策：B）

### A19. 导航后 hint 不匹配改继续轮询（不立即判失败）

- 来源：review_opencode_cpa_gemini_3_8_flash（PERF-001，Low，置信度 85）
- 位置：src/main/core/session/flowercloud_dom.ts:402-414
- 优先级：LOW
- 详细判断理由：用户决策选 A。loadURL resolve 时页面可能未就绪，首次不匹配即判死过于敏感；"无提示不拦"语义更稳健，改动局限且可测。
- 修复说明：导航后首次 hint 读取不匹配仅记未就绪，后续 poll 循环继续比对直至超时或匹配成功，不再直接记该服务失败。
- 原待决定项：D6（用户决策：A）

## 不采纳项

### R1. 合并 read_page_hint/read_service_hint

- 来源：review_opencode_opencode_go_muse_spark_1_3_contributor（Low），review_opencode_cpa_gemini_3_8_flash（TYP-001，Info：无功能缺陷）
- 位置：src/main/core/session/flowercloud_dom.ts:470-515
- 优先级：LOW
- 详细判断理由：两处调用语义不同（失败日志用字符串 vs 导航核对用 url|null），当前无缺陷；合并省一次 executeJavaScript，收益小，动快照路径不值。

### R2. persist_log_line 改走 create_record

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（ARCH-L1，Low）
- 位置：src/main/core/quit_source.ts:84-108 vs src/shared/lib/logger.ts:294-309
- 优先级：LOW
- 详细判断理由：平行实现确有漂移可能，但测试已覆盖本轮字段；改动退出兜底路径风险大于"防未来漂移"收益。维持现状。

### R3. quit_source 测试裸调用扫描改 token 级

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（TEST-L1，Low）
- 位置：tests/unit/main/quit_source.test.ts:228-264
- 优先级：LOW
- 详细判断理由：行尾注释误报与别名漏报缺口已由 architecture.md 显式登记、code review 兜住；改扫描器成本中等而收益仅为减少已知可解释的误报。接受已知约束。

### R4. tray_menu 哨兵断言维持现状

- 来源：review_kimi_kimi_code_kimi_for_coding（X3，Low：可接受退化），review_opencode_opencode_go_deepseek_v4_1_flash（TEST-L2：方向正确）
- 位置：tests/unit/main/tray_menu.test.ts:97-100
- 优先级：LOW
- 详细判断理由：两路一致认定退化可接受：行为已由 main_panel_controller 六组合固定，接线层文本匹配为剩余最小保护。无需动作。

### R5. e2e 退出断言暂不解耦 will-quit 重入依赖

- 来源：review_kimi_kimi_code_kimi_for_coding（X4，Low）
- 位置：tests/e2e/electron/cli_control.spec.ts:246-273
- 优先级：LOW
- 详细判断理由：当前退出清理逻辑下首轮 will-quit 必 preventDefault 重入，断言成立；仅未来重构 flush 一次通过时才脆。过期优化，暂不处理。

### R6. session-manager.test.ts 暂不拆分

- 来源：review_opencode_cpa_gemini_3_8_flash（ARC-001，Info→LOW）
- 位置：tests/unit/session/session-manager.test.ts（1912 行）
- 优先级：LOW
- 详细判断理由：文件长但职责内聚（会话生命周期），拆分属纯整理、无功能收益，文件移动反而增加归并成本。维持现状。

### R7. vault 载荷结构双份维持现状

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（TYP-I1，Info）
- 位置：src/main/core/session/flowercloud_dom.ts:48-72 vs connectors/flowercloud/connector.ts:17-54
- 优先级：LOW
- 详细判断理由：沙箱不共享 import 为已知约束且有注释声明；新鲜期常量已有契约测试；composite 往返缺口已由 A2 覆盖。本项接受约束，不另动作。

### R8. poll_flower_usage_html 本次不拆函数

- 来源：review_opencode_opencode_go_muse_spark_1_3_contributor（Medium，报告自述"后续 task、本轮不阻塞"）
- 位置：src/main/core/session/flowercloud_dom.ts:306-465
- 优先级：MEDIUM
- 详细判断理由：160 行六态循环确有复杂度，但注释充分且报告明确不阻塞本轮；拆分属重构级改动，应走独立 task 而非搭车本次采纳。留后续 task。

### R9. CAS 跳过上报失败维持现状

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（COR-L1，Low）
- 位置：src/main/core/session/flowercloud_dom.ts:580、651-652；src/main/core/session/session-manager.ts:650-651
- 优先级：LOW
- 详细判断理由：CAS 跳过被标 failed 后下一轮即恢复，影响小且自愈；改为"视为成功"需改变 ok/failed 语义，风险大于收益。注释与路径不符处随 A4 改动顺手校准一行即可，不另立项。

### R10. spike 大体积探针产物保留现状

- 来源：review_opencode_opencode_go_muse_spark_1_3_contributor（原 D1，Medium）
- 位置：docs/spikes/s040_flowercloud_challenge_probe/code/、docs/spikes/s041_flowercloud_multi_service_dom/code/
- 优先级：MEDIUM
- 详细判断理由：用户决策选 A：保留现状，证据链完整性优先；spike 完结时由 repo-hygiene 归档并瘦身。不动作。

### R11. 起始页用量兜底保持现状

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（原 D3，Medium，置信度 45）
- 位置：src/main/core/session/flowercloud_dom.ts:387-446
- 优先级：MEDIUM
- 详细判断理由：用户决策选 B：置信度低且无实证，t535 失败语义已闭环；"半新数据当快照"语义惊讶度高于收益。不动作。

### R12. loadURL 独立超时保持现状

- 来源：review_opencode_opencode_go_deepseek_v4_1_flash（原 D5，Medium，置信度 40）
- 位置：src/main/core/session/flowercloud_dom.ts:549、394
- 优先级：MEDIUM
- 详细判断理由：用户决策选 B：无实证，当前失败与占用均有界（AC-003/登记释放已测），Chromium 自带超时兜底。不动作。

### R13. 退出 file-transport 判定保持现状

- 来源：review_opencode_cpa_gemini_3_8_flash（原 D7，Low）
- 位置：src/shared/lib/logger.ts:180-183；src/main/core/quit_source.ts:71-74
- 优先级：LOW
- 详细判断理由：用户决策选 C：场景未经证实，R1 互斥设计已验证，动它风险大于收益。不动作。
