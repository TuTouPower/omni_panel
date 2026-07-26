# 审阅结果决策

## 目录

docs/reviews/review_20260726_054747

## 报告来源

- 已读：review_docs_active_claude_current.md、review_main_core_claude_current.md、review_renderer_claude_current.md、review_shared_claude_current.md
- 缺失：无

## 统计

- 采纳：33 项
- 不采纳：27 项
- 待决定：0 项

说明：

- `review_main_core_claude_current` 的 H3 与 M6 均源于 Local API 可信 LAN、免认证设计，合并为一项。其余 finding 未发现可合并重复项。
- 原 12 项待决定已在本轮定稿，全部转入采纳项（编号 21–32），并标注所选方案。
- 采纳项 33 为核验过程中新发现、四份报告均未提出的文档冲突。
- 其中两项采纳方案不同于报告与初稿推荐（编号 31、32），理由见各项。
- **后续调整（用户决策）**：采纳项 13、20、31、32 属权限/脱敏类，用户决定不纳入，对应 task t137、t140、t142 已 drop 归档；相关条目（13、20、31、32）视为撤回，不再落地。采纳项 22 保留但去掉权限/安全含义，仅做信任模型文档声明与 D8 失效引用修正。

## 采纳项

### 1. architecture 未记录 SettingsView 拆分结构

- 来源：review_docs_active_claude_current
- 位置：docs/blueprint/architecture.md:62
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：`views/settings-view/`、`components/settings/`、`AccountDialog.tsx`、`use_connector_catalog.ts` 均已落地，t122 也已归档；架构目录树仍未同步，属于收尾遗漏。
- 修复说明：扩展 renderer 目录树，记录 `views/settings-view/lib.ts`、`views/settings-view/sections/`、`components/settings/`、`components/AccountDialog.tsx`、`hooks/use_connector_catalog.ts` 及各自职责。

### 2. domain 内置 provider 列表遗漏三项

- 来源：review_docs_active_claude_current
- 位置：docs/blueprint/domain.md:13
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：现有列表遗漏已有 connector 和 task/spec 记录的 `getoneapi`、`exa`、`tikhub`，会误导内置 provider 范围判断。
- 修复说明：在内置直连 provider 列表补入 `getoneapi`、`exa`、`tikhub`；CPA 继续作为聚合连接器单独描述。

### 3. bugs.md 缺少 t111 修复记录

- 来源：review_docs_active_claude_current
- 位置：docs/bugs.md:68-79
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：对应 bug 已由 t111 修复并完成验收，但原条目没有按项目规则追加“修复”行，仍表现为未修复。
- 修复说明：在原条目末尾追加 t111 修复记录，说明 P0 保护、auto-seed 条件、原子写入，并附 branch 与 commit。

### 4. specs_index slug 与文件名不一致

- 来源：review_docs_active_claude_current
- 位置：docs/specs_index.md:43
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：索引使用 `vendor-forms-oauth-weblogin`，实际文件为 `vendor_forms_oauth_weblogin.md`，按 slug 拼接路径会失败，也违反项目 snake_case 约定。
- 修复说明：将索引 slug 改为 `vendor_forms_oauth_weblogin`，文件名保持不变。

### 5. window-management 交叉引用指向不存在文件

- 来源：review_docs_active_claude_current
- 位置：docs/specs/window-management.md:3
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：引用的 `ipc.md`、`ui-views.md` 不存在，无法沿链接定位现行权威文档。
- 修复说明：将引用改为 `ipc-api.md` / `ipc-electron.md` 与 `ui-views-desktop.md` / `ui-views-web.md`。

### 6. token stats Phase 4 残留 aggregator.ts 旧计划

- 来源：review_docs_active_claude_current
- 位置：docs/specs/ai-cli-token-stats-api.md:397-398
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：同一 spec 前文、架构文档和源码均采用聚合逻辑内联 `collector.ts`，Phase 4 仍要求创建 `aggregator.ts`，形成内部矛盾。
- 修复说明：将 Task 4.1 改为聚合逻辑已内联 `collector.ts`、不创建 `aggregator.ts`；同步调整后续前置依赖。

### 7. ADR 编号 008 重复

- 来源：review_docs_active_claude_current
- 位置：docs/blueprint/decisions.md:65,93
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：两个不同决策共用 `008`，编号引用产生歧义。
- 修复说明：将较晚的墓碑机制决策改为 `009`；先搜索并同步仓库内相关引用，不调整第一个 `008`。

### 8. Electron 平台 spec 错称支持后台续期

- 来源：review_docs_active_claude_current
- 位置：docs/specs/platform-services-electron.md:14；docs/specs/connector-session.md:28
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：前者把 `cookieRefreshHours` 描述为既有能力，后者和源码均确认该字段及后台定时续期未实现。
- 修复说明：平台 spec 改为后台续期未实现，当前 `SESSION_REFRESH` 只重新打开登录窗口；删除或标记 `cookieRefreshHours` 为历史设计。

### 9. providerForcePercent 类型描述过时

- 来源：review_docs_active_claude_current
- 位置：docs/specs/config-store.md:12
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：实际类型已是 `Readonly<Partial<Record<string, boolean>>>`，文档仍限定 `UsageProvider`，与用户 connector provider key 支持不符。
- 修复说明：改为 `Partial<Record<string, boolean>>`，注明支持内置及用户 connector provider key。

### 10. Kimi OAuth token 写入缺少序列化

- 来源：review_main_core_claude_current
- 位置：src/main/core/auth/kimi_oauth_manager.ts:347-353
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：登录、刷新、logout 可并发修改 vault；Kimi 缺少 Grok 已有 mutation queue 与 generation 校验，可能在 logout 后重新写回 token，或形成混合 token 状态。
- 修复说明：为 Kimi manager 增加 `token_generations`、`token_mutation_tails`、`enqueue_token_mutation`；登录成功和 logout 进入同一队列并检查 generation；补 logout/login/refresh 交错测试。

### 11. Kimi OAuth refresh 缺少并发去重

- 来源：review_main_core_claude_current
- 位置：src/main/core/auth/kimi_oauth_manager.ts:421-457
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：定时刷新和手动刷新可同时请求同一 instance；若服务端轮换 refresh token，后发请求可能触发 reused 并清除先发请求刚保存的新 token。
- 修复说明：增加按 instance 索引的 `refresh_in_flight` Map；复用进行中 Promise；refresh 保存与终止错误清理进入 mutation queue 并校验 generation；补并发合并与 logout during refresh 测试。

### 12. observation mapping 返回类型虚假可空

- 来源：review_main_core_claude_current
- 位置：src/main/core/scheduler/observation-mapping.ts:24-51
- 优先级：LOW
- 结论：采纳
- 详细判断理由：实现没有 `null` 路径，返回类型和调用方 null 分支均误导维护者，修改无行为风险。
- 修复说明：返回类型改为 `MetricRecord`；删除调用方 `if (record)` 死分支；同步删除注释中 `null-filtering` 表述。

### 13. vault `.bak` 权限未收紧

- 来源：review_main_core_claude_current
- 位置：src/main/core/vault/file-vault-backend.ts:147-153
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：备份包含与主 vault 相同的加密数据，但没有使用主文件权限流程；POSIX 可能生成 0644，Windows 也可能保留继承 ACL。
- 修复说明：备份写入指定 `mode: 0o600`，写后执行 `set_file_permissions(backup_path)`；补权限调用及 POSIX mode 测试。

### 14. token reader 日期与数值 helper 重复

- 来源：review_main_core_claude_current
- 位置：src/main/core/token-stats/claude-reader.ts:247-255；kimi-reader.ts:90-98；opencode-reader.ts:115-124
- 优先级：LOW
- 结论：采纳
- 详细判断理由：`calendar_date_of`、`num` 实现逐字相同，日期 bucket 又必须跨 provider 保持一致，单点漂移会造成静默统计错误。
- 修复说明：新建 `reader-utils.ts`，只提取完全等价的 `calendar_date_of`、`num`；三处改为 import。结构不同的 `extract_user_text` 不在本次提取。

### 15. 外部链接缺少 noopener

- 来源：review_renderer_claude_current
- 位置：src/renderer/views/settings-view/sections/about_section.tsx:114
- 优先级：LOW
- 结论：采纳
- 详细判断理由：`window.open(url, "_blank")` 未明确隔离 opener；修复为单行且无产品取舍，可减少新窗口操纵来源页面风险。
- 修复说明：改为 `window.open(url, "_blank", "noopener,noreferrer")`。

### 16. 托盘菜单分隔符索引硬编码

- 来源：review_renderer_claude_current
- 位置：src/renderer/views/TrayMenu.tsx:182
- 优先级：LOW
- 结论：采纳
- 详细判断理由：`new Set([3, 5, 10])` 与菜单数组顺序强耦合，增删或移动菜单项时容易遗漏同步。
- 修复说明：为菜单项类型增加 `separator_before?: boolean`；在对应三项标记；删除 `sep_indexes`，按 item 字段渲染，保持分隔符数量不变。

### 17. web session stub 返回类型不匹配

- 来源：review_shared_claude_current
- 位置：src/web/usageboard-web.ts:140-142
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：接口要求 `{ saved: boolean; cookie?: string }`，实现却返回 `{ ok, error }`，调用方读取 `saved` 得到 `undefined`，仅因 unsafe cast 未被编译器发现。
- 修复说明：`login`、`refresh` 均返回 `{ saved: false }`；补严格契约测试。

### 18. web UsageboardApi unsafe cast 掩盖成员缺失

- 来源：review_shared_claude_current
- 位置：src/web/usageboard-web.ts:185
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：`connector.catalog`、`config.createInstance`、`settings.openConnectorsDir`、`kimi`、`buildInfo` 等成员确实缺失，部分方法返回类型也错误；双重强转让运行时 `TypeError` 无法在编译期暴露。报告所列 `config.duplicate` 已存在，不纳入修复。
- 修复说明：将 `api` 直接标注为 `UsageboardApi` 并删除双重强转；补齐缺失 stub、修正 Promise/void 返回契约、为 `get_json` 增加泛型，并增加 web API 契约测试。

### 19. observation schema 允许负 cycleDurationMs

- 来源：review_shared_claude_current
- 位置：src/shared/schemas/observation.ts:38
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：类型契约要求 `cycleDurationMs >= 0`，但真实 connector 和 Local API 输入均允许负数通过 schema。
- 修复说明：改为 `finite_number.nonnegative().nullable().optional()`；补负数拒绝、null/零/正数通过测试。

### 20. 密钥名识别规则重复且覆盖不一致

- 来源：review_shared_claude_current
- 位置：src/shared/lib/logger.ts:23-24；src/shared/lib/config_redaction.ts:2-16
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：两套规则承担同一密钥名识别职责但覆盖不同，新增命名只改一处会形成真实脱敏缺口。
- 修复说明：新建共享 `secret_key.ts`，导出统一 `is_secret_key_name(name)`，取现有规则并集；logger 与 config redaction 共用；补敏感字段和普通字段测试。

### 21. handoff 补写近期 task 状态

- 来源：review_docs_active_claude_current（原待决定 1，采用方案 A）
- 位置：docs/handoff.md:3-6
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：handoff 是项目规则明确的「接手先读」入口，因此必须反映最新状态，而不只是记录历史交接事件。当前停在 t111，缺 t121、t122，接手者会据此误判进度。只追加一条汇总记录即可恢复连续性，符合只追加约束，成本也低于逐 task 补记。
- 修复说明：在 `docs/handoff.md` 追加一条汇总交接，含当前 branch、head_commit，以及 t121、t122 的完成状态与遗留 finding 指向。

### 22. connector sandbox 明确为可信本地脚本模型

- 来源：review_main_core_claude_current（原待决定 2，采用方案 A）
- 位置：src/main/core/connector/runtime.ts:39-64
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：当前 connector 只来自内置目录或本机 `userData/connectors`，没有远程分发或商店，能写入该目录的攻击者通常已具备等价权限，因此隔离运行时收益不足以匹配成本。继续叠加正则只会把纵深防御包装成安全边界，反而掩盖真实威胁模型。正确做法是显式声明信任前提。核验另发现 `runtime.ts:42` 引用的 `D8` 在 `decisions.md` 中不存在，属失效引用，一并修正。
- 修复说明：在 `architecture.md` 与 connector spec 明确「`node:vm` 非安全边界，仅运行用户信任的本地脚本」；设置页导入 connector 处补风险提示；将 `runtime.ts:42` 的 `D8` 改为实际 ADR 编号或删除该引用，保留正则作为误用防护并注明非隔离保证。若未来支持第三方分发或默认安装外部脚本，须改为独立进程隔离并作为发布门禁。

### 23. `src/main/index.ts` 分步拆分

- 来源：review_main_core_claude_current（原待决定 3，采用方案 B）
- 位置：src/main/index.ts
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：约 980 行入口混合 tray、窗口、OAuth、scheduler、IPC 与启动编排，维护成本真实存在；但启动与关闭顺序耦合度高，一次性重构的回归风险无法在单轮验证中覆盖。分步抽取每步都可独立跑黑盒验证。
- 修复说明：按独立 task 依次抽取 tray 逻辑与 settings window 管理；每步单独提交并跑 `pnpm test`；完成后再评估是否需要 `bootstrap.ts`。不与本轮正确性修复混入同一 task。

### 24. Grok/Kimi OAuth 抽取共用并发原语

- 来源：review_main_core_claude_current（原待决定 4，采用方案 B）
- 位置：src/main/core/auth/grok_oauth_manager.ts；src/main/core/auth/kimi_oauth_manager.ts
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：采纳项 10、11 证明复制式实现会遗漏并发保护，这类机制正是最需要单一实现的部分；但 headers、参数、device ID、响应结构、retry 清理属于真实供应商差异，完整泛型工厂会把差异塞进配置对象，可读性反而下降，历史 t118 也已避免直接合并稳定路径。
- 修复说明：在采纳项 10、11 落地并稳定后，单独抽取 mutation queue、generation 校验、`refresh_in_flight` 去重等并发原语为共用模块，两个 manager 引用同一实现；供应商差异保留在各自文件。不做完整 `createOAuthManager` 泛型工厂。

### 25. PopupView 调整 `refresh_providers` 声明顺序

- 来源：review_renderer_claude_current（原待决定 5，采用方案 B）
- 位置：src/renderer/views/PopupView.tsx:473-781
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：`refresh_providers` 在 line 699 使用、line 786 声明，依赖闭包延迟执行才安全，是明确的阅读陷阱且修复零风险。而提取 `PopupBody` 需在 live 树与两个 offscreen 镜像树间传递大量状态，收益不确定，不应在本轮承担。
- 修复说明：将 `refresh_providers` 定义移到 `render_body` 之前，不改变行为。`PopupBody` 提取不在本轮范围。

### 26. PopupView 用浅比较替换 JSON.stringify

- 来源：review_renderer_claude_current（原待决定 6，采用方案 A）
- 位置：src/renderer/views/PopupView.tsx:229-244
- 优先级：LOW
- 结论：采纳
- 详细判断理由：`JSON.stringify` 比较受 key 插入顺序影响，语义不严格；同文件已有 `arrays_equal`、`account_orders_equal` 可直接沿用风格，改动小于补注释解释缺陷。
- 修复说明：新增 `record_bool_equal(a, b)`，按 key 数量与逐 key 值比较；替换两处 `JSON.stringify` 比较。补单元测试覆盖 key 顺序不同但内容相同的场景。

### 27. renderer 存量命名随触碰迁移

- 来源：review_renderer_claude_current（原待决定 7，采用方案 B）
- 位置：src/renderer/ 多处
- 优先级：LOW
- 结论：采纳
- 详细判断理由：命名混用不是功能缺陷，全量改名会产生大 diff、污染 blame 且无业务收益，违反「只动必须动的」原则；但放任不管规范无法收敛。随触碰迁移在两者间取平衡。
- 修复说明：不新建专项迁移 task。后续修改相关代码时，将所触碰符号迁移为 `snake_case`；新代码一律 `snake_case`。在 `conventions.md` 记录该策略。

### 28. “清除本地用量缓存”按钮置灰

- 来源：review_renderer_claude_current（原待决定 8，采用方案 B）
- 位置：src/renderer/views/settings-view/sections/data_section.tsx:42-49
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：该按钮自设置页重写起即为设计占位，没有 spec 定义清理范围；直接实现等于替产品决定删哪些数据。但保持可点击且无任何反馈是确定的 UX 缺陷，置灰成本极低且不预设任何数据语义。
- 修复说明：为按钮加 `disabled` 与「暂未开放」提示文案；在 `docs/bugs.md` 或对应 spec 记录该功能待定义。实现清除逻辑另行立项。

### 29. “重置应用”按钮置灰

- 来源：review_renderer_claude_current（原待决定 9，采用方案 B）
- 位置：src/renderer/views/settings-view/sections/data_section.tsx:91-101
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：同采纳项 28，且风险更高——真正实现涉及 config、vault/secrets、缓存、历史数据的不可逆清理，需二次确认、重启行为与失败恢复设计。危险操作按钮无反馈比普通占位更容易误导。
- 修复说明：为按钮加 `disabled` 与「暂未开放」提示文案。重置功能另行立项，先定义清理范围、确认流程、失败恢复与测试。

### 30. TokenStatsView 偏好持久化写入 spec

- 来源：review_renderer_claude_current（原待决定 10，采用方案 B）
- 位置：src/renderer/views/TokenStatsView.tsx:82-124
- 优先级：LOW
- 结论：采纳
- 详细判断理由：窗口独立持久化是历史设计的有意选择，不是绕过 config store；迁入主配置需改 schema、IPC、导入导出与迁移逻辑，为一个未被投诉的行为付出该成本不合理。真实缺陷只是行为未文档化，读者无法判断是设计还是遗漏。
- 修复说明：保留 `localStorage` 实现；在 token-stats spec 明确说明该窗口偏好独立持久化、不随主配置导入导出。若后续产品要求跨窗口同步，再单独立项迁移。

### 31. popup 路由 `config.save` 改为字段白名单

- 来源：review_shared_claude_current（原待决定 11，采用选项外方案）
- 位置：src/preload/index.ts:488-489
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：核验确认 `PopupView.tsx:164-244` 与 `use_watched_metric_toggler.ts:41` 确实依赖 `config.save` 持久化 `providerOrder`、`accountOrders`、`collapsedAccounts`、`expandedProviders`、`accountOverrides`，故不能改 no-op；但 `#usage` 持有全量非密钥配置写权限超出所需。初稿推荐的新增 `config.patchUiState` IPC 属过度设计：preload 在 `contextIsolation` 下本身就是不可绕过的信任边界，renderer 拿不到 `config_full`，在 preload 内做字段过滤即可达成同等约束，无需新增 IPC 通道、main handler 与 route 校验。
- 修复说明：在 preload popup 分支将 `save` 包装为白名单版本——读取传入 config，仅保留上述五个 UI 状态字段的变更，其余字段以当前持久化值覆盖后再调 `config_full.save`；`#tray` 保持现有 no-op。补 preload 单测，断言 popup 路由无法修改白名单外字段。

### 32. scrubber 在密钥轮换时清退旧值

- 来源：review_shared_claude_current（原待决定 12，采用选项外方案）
- 位置：src/shared/lib/logger.ts:25-26,42-47；src/main/core/vault/file-vault-backend.ts:167,176-193
- 优先级：MEDIUM
- 结论：采纳
- 详细判断理由：核验定位到真正根因——唯一注册点是 `file-vault-backend.ts:167`，每次 `get` 都注册解密明文，而 `set`、`delete` 从不 `unregister`，`unregister` 至今无调用方。OAuth refresh token 轮换会让同一账号的历史 token 无限累积，这才是逼近 10,000 上限的路径。初稿推荐的 fail closed 方案代价过高：脱敏容量耗尽时停写全部日志会同时摧毁故障排查能力，且不解决累积根因；单纯告警则在告警后仍持续泄露。修根因可使上限在正常使用下永不触达。
- 修复说明：`set` 覆盖已有 key 前先取旧值并 `scrubber.unregister(旧明文)`，`delete` 同样清退；配合在 `register` 首次达到上限时输出一次不含敏感值的 warning 作为兜底可观测性。补测试：token 轮换 N 次后注册值数量保持有界；`delete` 后旧值不再驻留。

### 33. architecture 中 LocalAPI 安全描述与 web-panel spec 冲突

- 来源：核验新发现（四份报告均未提出）
- 位置：docs/blueprint/architecture.md:49,77
- 优先级：HIGH
- 结论：采纳
- 详细判断理由：`architecture.md:49` 写「local-api/server.ts # 127.0.0.1 ingest + health」，:77 写「LocalAPI 仅 `127.0.0.1`，Bearer token，只 ingest+health，非通用代理」。但 `docs/specs/web-panel.md:7,14-15` 已确认绑 `0.0.0.0`、web 路由免 Bearer、`/v1/secrets` 返回明文，代码 `server.ts:472` 也确为 `0.0.0.0`。blueprint 作为「当前长期真相」却描述了一个更安全的、不存在的状态，会让后续 reviewer 与开发者严重误判暴露面——本轮 main_core 报告的 H3 正是在这种冲突下被提为高危新发现。这是文档缺陷，不改变已确认的产品决策。
- 修复说明：将 architecture.md 两处改为与 web-panel.md 一致——绑 `0.0.0.0`，仅 `/v1/ingest` 需 Bearer，其余 web 端点免认证且可返回明文密钥，并注明信任前提为可信 LAN、引用 web-panel.md §2.1 风险接受说明。

## 不采纳项

### 1. 为 tikhub/getoneapi/exa 新建独立 spec

- 来源：review_docs_active_claude_current
- 位置：docs/specs/connector-direct.md:12,17,23
- 优先级：MEDIUM
- 结论：不采纳
- 详细判断理由：现有表格已记录端点、字段映射、额度语义和落地 task；三者均为简单直连 poll 型，没有证据表明独立 spec 能补足实际契约，属于文档组织偏好。

### 2. conventions 引用不存在的 AGENTS.md

- 来源：review_docs_active_claude_current
- 位置：docs/blueprint/conventions.md:3 等
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：仓库根 `AGENTS.md` 实际存在，引用以仓库根为基准，可直接证伪。

### 3. specs 使用硬编码行号

- 来源：review_docs_active_claude_current
- 位置：docs/specs/connector-cpa-runtime.md:37；docs/specs/connector-session.md:28
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：相关引用同时包含函数名、handler 或语义锚点，行号只是辅助；即使漂移仍可定位，报告也承认无需回溯修改。

### 4. 测试覆盖率阈值低

- 来源：review_docs_active_claude_current
- 位置：docs/guides/testing.md:130-139
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：阈值是明确记录的渐进式基线，不是文档与实现不一致；直接提高会在未补测试时令门禁持续失败，应由独立覆盖率 task 处理。

### 5. Local API 绑定 0.0.0.0 且 web/SSE 免认证

- 来源：review_main_core_claude_current
- 位置：src/main/core/local-api/server.ts:230-263,426-450,472
- 优先级：HIGH
- 结论：不采纳
- 详细判断理由：暴露事实成立，且 `/v1/secrets` 可返回明文；但 `docs/specs/web-panel.md` 与已归档 t054 明确决定可信 LAN、绑定 `0.0.0.0`、web 路由免认证。改为 loopback 或单独保护 SSE 会破坏已确认 LAN 面板需求。应另行修正文档冲突，不以本 finding 推翻产品决策。

### 6. secretParamKeys 不支持运行时 connector 热加载

- 来源：review_main_core_claude_current
- 位置：src/main/index.ts:167,213-229,329-333
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：当前不存在 connector 热加载；新增用户 connector 需重启，重启后会重新 discovery 并正确建立索引。属于未来功能假设。

### 7. config 乐观并发检查 TOCTOU

- 来源：review_main_core_claude_current
- 位置：src/main/ipc/config-ipc.ts:148-156
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：理论时间窗存在，但需多个设置窗口近乎同时保存，实际写入已序列化；引入完整 CAS 或文件锁成本远高于当前收益。

### 8. plugin 字段未逐项定制校验

- 来源：review_main_core_claude_current
- 位置：src/main/ipc/config-ipc.ts:108-142
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：输入及 merge 后结果均经过 `appConfigurationSchema`；空 name、非法类型会被拒绝。现有专门校验只保护身份与不可变路径，剩余差异只是错误信息精度。

### 9. assert_setting_route 未检查 origin

- 来源：review_main_core_claude_current
- 位置：src/main/ipc/helpers.ts:31-81
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：紧邻调用的 `assert_valid_sender` 已独立验证 origin/path，生产精确匹配 renderer 文件，开发模式只允许配置 origin；重复检查无实际收益。

### 10. size-validation 类型谓词收窄不精确

- 来源：review_main_core_claude_current
- 位置：src/main/ipc/size-validation.ts:18-24
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：报告机制判断错误。类型守卫通过后 TypeScript 会将 `v` 正确收窄为 `number`，strict 模式无错误。

### 11. hooks 文件禁用 rules-of-hooks

- 来源：review_renderer_claude_current
- 位置：src/renderer/hooks/use-config.ts:1 等
- 优先级：MEDIUM
- 结论：不采纳
- 详细判断理由：项目 snake_case 使自定义 hook 命名为 `use_config`，eslint 规则默认只识别 `use[A-Z0-9]`，会把函数内合法 hook 调用误报；禁用用于解决命名规则冲突，`exhaustive-deps` 仍启用。

### 12. SettingsView 使用 `_omit` + `void`

- 来源：review_renderer_claude_current
- 位置：src/renderer/views/SettingsView.tsx:346-349
- 优先级：MEDIUM
- 结论：不采纳
- 详细判断理由：代码有意剥离旧 `displayName`，只在新值存在时重写，保证无值时属性不存在；TypeScript 仍检查字段存在性，仓库也没有值得为单点引入的通用 omit helper。

### 13. Icon 使用 dangerouslySetInnerHTML

- 来源：review_renderer_claude_current
- 位置：src/renderer/components/Icon.tsx:92
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：HTML 来源仅限仓库内硬编码常量，外部参数只用于字典查找，未命中返回空字符串，不存在用户输入进入 HTML 的路径。

### 14. session_meta 未使用

- 来源：review_renderer_claude_current
- 位置：src/renderer/views/settings-view/lib.ts:59-72
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：直接误报。`AccountDialog.tsx` 已导入并使用该符号；真实反向依赖问题已由 t122 finding 记录，不应按死代码删除。

### 15. use-popup-ui-config useState 过多

- 来源：review_renderer_claude_current
- 位置：src/renderer/hooks/use-popup-ui-config.ts:43-64
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：实际为 12 个状态，各自对应独立 config 字段，setter 引用稳定；报告所述 callback 因 setter 变化重建不成立，也没有性能测量证明 reducer 更优。

### 16. palette 硬编码用户目录颜色

- 来源：review_renderer_claude_current
- 位置：src/renderer/lib/token-stats/palette.ts:37-44
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：注释明确该表用于匹配设计 demo，主要 top-N 图表另走 `TOP5_COLORS`，未命中也有默认颜色，不构成功能错误。

### 17. useECharts 禁用 exhaustive-deps

- 来源：review_renderer_claude_current
- 位置：src/renderer/hooks/use-echarts.ts:32-38
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：实现有意拆分实例初始化与按显式 deps 更新 option；将 inline `getOption` 加入初始化依赖会导致每次渲染 dispose/recreate 图表。可补解释注释，但不足以形成独立修复项。

### 18. LogLevel 重复定义

- 来源：review_shared_claude_current
- 位置：src/shared/types/config.ts:12；src/shared/lib/logger.ts:1
- 优先级：MEDIUM
- 结论：不采纳
- 详细判断理由：两个 union 当前完全相同，TypeScript 结构类型保证兼容；为四个字面量引入跨层类型依赖，收益不足。

### 19. web console log 未 throttle/sanitize

- 来源：review_shared_claude_current
- 位置：src/web/usageboard-web.ts:153-154
- 优先级：MEDIUM
- 结论：不采纳
- 详细判断理由：web 路径只输出浏览器本地 console，不经过 IPC 或日志落盘边界，preload 的 throttle/sanitize 安全理由不能直接套用，影响主要是开发者工具体验。

### 20. web config/session 参数使用 unknown

- 来源：review_shared_claude_current
- 位置：src/web/usageboard-web.ts:82-88
- 优先级：MEDIUM
- 结论：不采纳
- 详细判断理由：Local API 最终复用 `handleConfigSave` 与 `handleConfigSaveSecrets`，分别执行 schema 校验；`unknown` 正确表达不可信序列化边界。

### 21. web EventSource 未关闭

- 来源：review_shared_claude_current
- 位置：src/web/usageboard-web.ts:42-58
- 优先级：MEDIUM
- 结论：不采纳
- 详细判断理由：EventSource 是模块内惰性单例，安装函数在 React effect 外只调用一次；页面卸载时浏览器自动关闭，StrictMode 不会创建报告所述重复实例。

### 22. providerLabelMaps 脱敏标记不统一

- 来源：review_shared_claude_current
- 位置：src/shared/lib/config_redaction.ts:48
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：两种标记都只供人读，没有消费者解析字面值；统一仅属显示风格调整。

### 23. web platform 硬编码 win32

- 来源：review_shared_claude_current
- 位置：src/web/usageboard-web.ts:62
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：现有消费者只判断是否为 `darwin`，web 专属 UI 另由 `is_web()` 控制，返回 `win32` 不会触发报告所述 Windows 专属样式错误。

### 24. createTraceId 使用 Math.random

- 来源：review_shared_claude_current
- 位置：src/shared/lib/logger.ts:274-276
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：trace ID 只用于单进程日志关联，不承担安全身份用途；时间戳加同毫秒 24-bit 随机量在当前调用频率下碰撞概率可忽略。

### 25. poll_map_schema 只校验三个字段

- 来源：review_shared_claude_current
- 位置：src/shared/schemas/manifest.ts:46-55
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：当前数值字段正是 `used`、`limit`、`remaining`，均已校验；问题依赖未来新增字段，反向白名单还可能错误拒绝未来合法字面枚举。

### 26. TrendPoint 重复定义

- 来源：review_shared_claude_current
- 位置：src/shared/lib/trend.ts:3-6；src/shared/types/ipc.ts:262-265
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：两个小型 interface 结构相同，TypeScript 结构类型保证兼容；为消除文本重复而让 IPC types 与趋势实现互相依赖，收益不足。

### 27. pluginEndpointsSchema 允许 null URL

- 来源：review_shared_claude_current
- 位置：src/shared/schemas/plugin-metadata.ts:44
- 优先级：LOW
- 结论：不采纳
- 详细判断理由：两处不是同一输入契约。manifest 用字符串默认 URL 配合 `requireExplicitEndpoints`，PluginMetadata 的 `null` 表示设置表单必填但无默认值；强行统一会破坏现有 UI 语义。
