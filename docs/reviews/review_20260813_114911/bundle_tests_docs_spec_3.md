# Review Bundle: tests_docs_spec | chunk 3

- perspective: `tests_docs_spec`
- chunk: 3（`index % 6 == 2`，index 从 0 起）
- bundles: 19（connectors_codex, connectors_glm, connectors_tavily, scripts, src_main_core_config, src_main_core_observation, src_main_core_session_history, src_main_index_ts, src_preload_oauth_api_ts, src_renderer_components_AccountRow_tsx, src_renderer_components_ConfirmDelete_tsx, src_renderer_components_DragGrip_tsx, src_renderer_components_ProviderNav_tsx, src_renderer_components_TokenPanel_tsx, src_renderer_components_VendorCard_tsx, src_renderer_components_session_library, src_renderer_hooks, src_renderer_vite_env_d_ts, src_web_usageboard_web_ts）
- files: 60
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`（2026-08-13 11:23:05 +0800）

## Findings

- [Medium][85] src/renderer/components/TokenPanel.tsx:20 — `range` state 是死状态：时间范围分段控件对显示值无任何作用，测试只断言 CSS class，掩盖死 UI — 证据：`useState<TokenTimeRange>("today")` 仅被 `<Segmented value={range} onChange={setRange}>`（第 39-46 行）消费，`display_value`（第 22-25 行）只依赖 `has_real_data`/`total_tokens`，选择「今天/最近一周/最近一月」不触发任何取数或显示变化（无 range→数据映射、无 IPC）。测试 `tests/unit/renderer/components/token_panel.test.tsx:28-34`「switches range on button click」只断言 `week_btn.className` 含 "on"，是组件内部 class 断言，无法发现选择器无行为的事实——这是一个假绿弱断言（f9b60331 起就存在）。修复建议：要么把 range 接入真实取数（按范围向 main 请求对应 total），要么删除该分段控件；测试应改为断言点击后显示值/回调随 range 变化（如 `getByTestId("token-value")` 文本变化或 mock 取数被调用），而非 CSS class。

- [Medium][65] src/main/core/session-history/kimi-extractor.ts:145 — kimi/claude_code 增量提取缺 grok 已实现并验证的半行回退（p050），同类 mid-write 场景无测试覆盖 — 证据：grok-extractor.ts:145-188 显式处理「cursor 落在 JSON 行中间」（回退到行边界重读完整行，`parse_start = line_start`），并有测试 grok-extractor.test.ts:115-155（"半行写入：cursor 落在行中间时增量不丢该记录"）证明该场景在 WSL 9P 轮询下真实发生；kimi-extractor.ts:145-167 与 claude-code-extractor.ts:117-153 则直接 `buf.subarray(cursor.offset)` 续读：若 cursor 落在半行（上次轮询正逢写入中），半行 JSON.parse 失败被跳过，cursor 推进到文件尾，写入完成后该行完整内容永远不会被重新读取——消息永久丢失。kimi 与 grok 同为 WSL mtime 轮询（subscription-service pick_strategy），风险环境一致。修复建议：把 grok 的行边界回退逻辑移植到 kimi（claude 同模式一并处理），并补与 grok-extractor.test.ts:115 等价的增量半行测试。

- [Medium][60] tests/unit/connector/codex-day-key.test.ts:11 — day_key 单测复制生产实现而非触达生产代码，生产侧回归无法被该测试捕获 — 证据：测试内联重写了 `day_key`（第 11-14 行）并注释「MUST match the implementation in connectors/codex/connector.ts exactly. If this test breaks after a connector change, update BOTH places」；生产函数（connector.ts:23-28）因 VM 沙箱无法 import，测试实际验证的是测试自身的副本——生产侧把 `getUTCMonth() + 1` 改成 `getUTCMonth()`（month off-by-1）时该测试仍然全绿。集成测试 codex-connector.test.ts 只用 2026-06-14 同日时间戳（第 59-96 行），从不跨日/跨月边界走生产路径，day_key 的边界（1 月、11 月、12 月 31 日）只在副本上验证过。修复建议：把 `day_key` 提取为可被测试直接 import 的共享模块（connector 脚本经 VM 注入该模块），或至少在 codex-connector.test.ts 增加跨月边界的生产路径用例（如 12-31 与 01-01 两天的 response.completed）。

- [Low][60] tests/integration/connector/glm-connector.test.ts:177 — 白盒源码文本断言：测试用 `script.indexOf(...)` 找 throw 语句再检查其后 200 字符，脆且测的是实现文本而非行为 — 证据：「has no unreachable return after throw on missing limits」直接对连接器源码字符串做子串搜索（第 181-186 行），任何无害重构（错误消息换行/改名、throw 前插入空行）都会炸；而同一回归类（throw 后紧跟 return []）在 codex/tavily 连接器没有对应守卫。修复建议：删除该源码文本测试，改为行为断言（response 缺 limits 时 error 非空且 observations 为空——该行为已被第 156-175 行用例覆盖），或用可 import 的纯函数测不可达分支。

- [Low][50] tests/unit/main/core/token-stats/token_stats_baseline.test.ts:19 — 单测里生成 60 万条合成记录只为断言长度，叠加 run_baseline 用例拖慢测试套件 — 证据：`expect(generate_synthetic_records(600_000)).toHaveLength(600_000)` 分配 60 万条对象仅为验证 length 契约；同文件另跑 `run_baseline(12_000)`（建库+upsert+36 场景查询）与 `run_baseline(12)`，三个用例合计制造近 61 万条记录的分配与多轮 SQLite 写入。生成器确定性（用例 1 前半）用小样本即可验证，规模契约可由生成器内部 `Array.from({length: count})` 保证。修复建议：长度断言降到 10^4~10^5 量级或改为断言 `count === 0` 时的行为 + 小样本确定性，保留单个 600k 冒烟仅在有规模回归需求时。

- [Low][55] src/main/core/config/config-store.ts:280 — saveIfBaseMatches 冲突判定用 `JSON.stringify` 比较，键序敏感且无「键序不同内容相同」用例 — 证据：`JSON.stringify(committed) !== JSON.stringify(base)`；`doSave` 写盘前 `sortKeys(config)` 但缓存 `cached_config = config`（未排序，第 234-235 行），而 load 路径解析出的对象按文件（已排序）键序。键序不同但语义相同的两次保存（如 auto_seed 拼接的 plugin 对象键序与持久化排序键序不同）可触发假冲突（"conflict" 而非 "saved"）。现有 9 个 saveIfBaseMatches 相关用例全部基于同一对象引用或同键序快照，未覆盖该情形。修复建议：比较前对 committed/base 做键序规范化（复用 `sortKeys`），或改用结构深度比较（如 `isDeepStrictEqual`）；补一个「同内容异键序 base 不误报 conflict」用例。

- [Low][40] scripts/smoke_check.md:24-31 — 手工冒烟文档与产品现状错位：沿用旧「插件(plugin)」术语，未覆盖连接器/账号模型与 web 面板 — 证据：文档第 5 节「插件自动加载／插件实例自动创建／Popup 显示插件卡片／Settings 显示插件列表」仍用 t195 之前的 plugin 术语，当前 UI（ProviderCard/AccountRow 等）与代码（connector/manifest）已全面迁移到连接器+账号模型，且产品新增 web 面板（local-api `/v1/health`）与 CLI serve 模式，文档均未提及。修复建议：按当前术语与功能面更新冒烟清单（连接器/账号卡片、web 面板、CLI serve 健康检查）。

- [Info][35] src/main/core/session-history/opencode-extractor.ts:95 — FIRST_USER_PARTS_QUERY `LIMIT 50`：前 50 条 text part 内没有 user 时首条摘要错误返回空串，边界未测 — 证据：`extract_opencode_first_user` 只扫描前 50 条 text part（按 rowid），若会话开头是 50 条以上连续 assistant 文本段，真实首条 user 消息被漏掉返回 ""；摘要用途（会话库行/卡片）会显示空白。极端但真实（自动任务/长系统回复会话）。修复建议：把 LIMIT 提高到覆盖首条 user 的合理上界（如 200）或在 SQL 内直接 `WHERE json_extract(m.data,'$.role')='user' LIMIT 1` 精确取首条 user；补一个「前 50 条全是 assistant」的用例。

## Reviewed files（本 chunk 60 个 bundle 文件，全部读当前 HEAD）

- connectors: `connectors/codex/connector.ts` + manifest.json，`connectors/glm/connector.ts` + manifest.json，`connectors/tavily/connector.ts` + manifest.json
- scripts: `designmd.ts`，`export-schemas.ts`，`gen-build-info.ts`，`package-and-run.ts`，`smoke_check.md`，`token-stats-baseline.ts`，`token-stats-spike.ts`
- config: `src/main/core/config/auto-seed.ts`，`config-store.ts`，`secret_param_keys.ts`，`secrets-store.ts`，`types.ts`
- observation: `src/main/core/observation/observation-store.ts`
- session-history: `claude-code-extractor.ts`，`grok-extractor.ts`，`head-read.ts`，`kimi-extractor.ts`，`opencode-extractor.ts`，`session-locator.ts`，`session-path-index.ts`，`subscription-service.ts`，`types.ts`
- 主进程: `src/main/index.ts`；preload: `src/preload/oauth_api.ts`
- renderer 组件: `AccountRow.tsx`，`ConfirmDelete.tsx`，`DragGrip.tsx`，`ProviderNav.tsx`，`TokenPanel.tsx`，`VendorCard.tsx`，`session-library/` 8 文件
- hooks: `use-config.ts`，`use-device-login.ts`，`use-echarts.ts`，`use-now-tick.ts`，`use-plugins.ts`，`use-popup-height-report.ts`，`use-popup-ui-config.ts`，`use-resize-observer.ts`，`use-route.ts`，`use_connector_catalog.ts`，`use_dnd_handlers.ts`，`use_popup_derived.ts`，`use_provider_tab_drag.ts`，`use_tab_navigation.ts`
- 其余: `src/renderer/vite-env.d.ts`，`src/web/usageboard-web.ts`

## 关联测试与只读检查（执行过）

- 连接器集成测试: `tests/integration/connector/{codex,glm,tavily}-connector.test.ts`，`_ctx_status.ts`，`tests/unit/connector/codex-day-key.test.ts`
- config: `tests/integration/config/config-store.test.ts`、`tests/unit/main/core/config/auto-seed.test.ts`
- observation: `tests/integration/observation/{observation-store,trend-granularity,trend-instance-isolation,trend-query-key}.test.ts`，`tests/unit/observation_store_migration.test.ts`
- session-history: `tests/unit/main/core/session-history/{claude-code-extractor,grok-extractor,head-read,kimi-extractor,opencode-extractor,session-locator,session-path-index,subscription-service,watcher}.test.ts`
- preload: `tests/unit/preload/oauth_api.test.ts`；web: `tests/unit/web/usageboard-web.test.ts`
- renderer: `token_panel.test.tsx`，`confirm_delete.test.tsx`，`provider_nav.test.tsx`，`account_row.test.tsx`，`session_library/SessionCard.test.tsx`、`SessionLibrary.test.tsx`，hooks `{use_config,use_plugins,use_now_tick,use_popup_derived,use_dnd_handlers,use_provider_tab_drag,use_connector_catalog,use_echarts_lazy,use_tab_navigation}.test.ts(x)`
- scripts: `tests/unit/main/scripts/designmd.test.ts`，`tests/unit/main/core/token-stats/token_stats_baseline.test.ts`
- git 检查: `git rev-parse HEAD`、`git log`（codex connector、token-stats-baseline、export-schemas、TokenPanel、designmd 的历史）
- 交叉验证: IPC channel 常量（`src/shared/types/ipc.ts`）vs oauth_api.ts 调用参数顺序；`onRender` prop 使用方；`sessionHistory.recent` 使用方；`kimi:total_quota` 迁移测试覆盖；schema 导出 JSON 的测试引用
