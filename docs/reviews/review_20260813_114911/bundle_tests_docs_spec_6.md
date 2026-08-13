# Review Bundle: tests_docs_spec | chunk 6

- perspective: `tests_docs_spec`
- chunk: 6（`index % 6 == 5`）
- 审过 bundle 数：18（111 个中的 index 5/11/17/23/29/35/41/47/53/59/65/71/77/83/89/95/101/107）
- 审过文件数：79（connectors exa/mimo ×2、root_config_02 25 个 handoff、src_main_cli 4、logging、popup-height-controller、token-stats 12、window 2、preload usageboard-api、renderer components/forms/lib 02/schemas 等）
- HEAD SHA：`51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][70] docs/specs/window-management.md:33 — popup 高度约束文档/注释过期：仍写「不超过 75% 工作区高度」，实现已是 100% — `src/main/core/popup/popup-height-controller.ts:10` `MAX_HEIGHT_RATIO = 1.0`（commit `60fa5f06` t081 将 0.75→1.0），同文件 55-58/66 行注释仍称「0.75」「75% screen rule」「75% constraint」，`docs/guides/testing.md:128` 同样写「不超 75% 工作区」。t081 spec（`docs/archive/tasks/t081_popup_height_full_workarea/spec.md:10`）明确要求「同步更新代码注释（"75% constraint" / "75% screen rule"）」，未完成；`tests/unit/main/popup_height_controller.test.ts:19,61` 已按 100% 断言，注释与测试互相矛盾。修复：把 `popup-height-controller.ts` 三处注释、`window-management.md:33`、`docs/guides/testing.md:128` 的 75% 改为 100%（1.0）。

- [Medium][65] connectors/mimo/connector.ts:143 — balance 数值守卫恒真，非数字余额被静默当作 0，且测试未触达 — `to_number`（第 44-47 行）恒返回有限数，故 `if (Number.isFinite(balance))` 恒 true（死守卫）；当 API 返回 `balance: "abc"` 等非数字字符串时，会静默产出 `used: 0`、`status: critical` 的「余额 0」观察项，与守卫意图（跳过非法值）相反。`tests/integration/connector/mimo-connector.test.ts` 全部用例只覆盖数字 balance（75.5/5/15/20/0.01/10），无非数字/空 balance 用例，死分支无测试保护。修复：`to_number` 对非数字返回 `NaN` 或先校验 `typeof balance === "number"` 再决定是否 push；补非数字 balance 用例。

- [Medium][60] src/renderer/components/token-stats/BarChart.tsx:227 + src/renderer/lib/token-stats/aggregate.ts:55 — token-stats 时区约定混用：spec/约定固定 UTC+8，渲染端用机器本地时区，非 UTC+8 机器上小时轴错标、半点偏移时区数据错桶，测试无 TZ 固定无法捕获 — 服务端整条链按固定 UTC+8（`token-stats-store.ts:1201-1203/1240-1244` 注释、`docs/specs/ai-cli-token-stats-api.md:287`「UTC+8 整点」、`src/shared/types/token-stats.ts:230`、`docs/blueprint/conventions.md:17`「时间戳统一使用中国时间 UTC+8」）；而渲染端 `bucketize`（aggregate.ts:65-75）用机器本地 `setMinutes/setHours` 定边界，BarChart hour 轴 `interval` 与 `formatter`（BarChart.tsx:219,227-237）用 `new Date(bucket_start).getHours()` 覆盖服务端 UTC+8 标签，`prepareHeatmapData`（chart-data.ts:503）用本地 `getDay()/getHours()`。UTC+8 整点偏移下小时边界碰巧一致但标签显示本地小时（如 UTC 机器上显示 02:00 而非约定的 10:00、日期回卷也偏），UTC+5:30 等半点偏移时区下数据直接落错桶；同一机器上 chartData 路径（服务端 UTC+8 轴）与 records 路径（本地 bucketize）日边界不一致。`tests/unit/renderer/lib/token-stats/chart-data.test.ts` 全用本地 `new Date(...)` 构造与断言、未设 `TZ=`（vitest 配置也无），任何整点时区机器都绿——TZ 依赖的假绿，无法验证「固定 UTC+8」约定。修复：渲染端改固定 UTC+8 helper（或与 store 共用 +28800000 边界），测试统一 `TZ=Asia/Shanghai` 并补非 UTC+8 用例。

- [Low][55] src/main/core/token-stats/manager.ts:37-43 — `same_config` 注释声称 JSON.stringify 是「order-independent equality check」，实为序相关 — JSON.stringify 的序列化结果依赖键序，`{a:1,b:2}` 与 `{b:2,a:1}` 不等；当前唯一构造点 `src/main/index.ts:417-425` 键序固定，所以防抖实际生效（`manager.test.ts:325` 只测了同序同对象），但注释失实，一旦未来构造键序变化（如 spread 用户配置），每次无关 config 保存都会触发 collector 全量重扫（防抖目标即此，见 221-227 行注释「~4720x/day」）。修复：改为规范化比较（按 key 排序后序列化）或逐字段比较，并同步注释。

- [Info][45] src/renderer/lib/utils.ts:27 — `format_reset_time` 三元两分支相同，纯冗余 — `typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp)` 两分支一致（`new Date(number)` 与 `new Date(string)` 都合法），该表达式不产生任何行为差异。修复：直接 `new Date(timestamp)`。

- [Info][40] src/renderer/lib/usage-colors.ts:45-47 — `usage_window_elapsed` 为恒等函数，无任何业务语义 — 入参即出参（`return elapsed`），全仓无其他引用（grep 仅定义处），属残留死代码。修复：删除该导出及其任何调用点。

## Reviewed files

生产/配置（18 bundles 全量 HEAD 内容）：

- connectors/exa/connector.ts、manifest.json；connectors/mimo/connector.ts、manifest.json
- docs/archive/tasks/t302..t327 共 25 个 handoff.json（脚本解析 + 全读 t306/t322 样本）
- src/main/cli/args.ts、cli-json.ts、client.ts、import-config.ts
- src/main/core/logging.ts；src/main/core/popup/popup-height-controller.ts
- src/main/core/token-stats/：claude-reader、collector、grok-reader、kimi-reader、manager、opencode-reader、paths、query-dispatcher、query-worker、reader-utils、scan-state、token-stats-store
- src/main/window/window-bounds.ts、window-manager.ts；src/preload/usageboard-api.ts
- src/renderer/components/Button.tsx、CpaConnectorSettings.tsx、ProviderAccountList.tsx、SecretInput.tsx、UpcomingResetRow.tsx；forms/（CpaMgmtForm/ExaServiceKeyForm/OAuthDeviceForm/WebLoginForm）
- src/renderer/components/token-stats/（BarChart/Heatmap/MetricDonut/RangePicker/SessionTable）
- src/renderer/lib/token-stats/（format/query-cache/types）；lib/usage-colors.ts、lib/utils.ts；lib/workspace/（copy-format/pane/selection-store/slots/workspace-storage）
- src/shared/schemas/（auth/manifest/observation/plugin-metadata/plugin-output）

测试与文档（只读对照）：

- tests/integration/connector/exa_connector.test.ts、mimo-connector.test.ts、\_ctx_status.ts
- tests/unit/main/cli/args.test.ts、import-config.test.ts、client.test.ts（行数）、cli-json.test.ts（行数）
- tests/unit/main/logging.test.ts、popup_height_controller.test.ts、window-bounds.test.ts、window_manager.test.ts
- tests/unit/main/core/token-stats/：manager.test.ts（全读）、query-dispatcher.test.ts（全读）、token-stats-store.test.ts（用例清单）、collector/collector-local/collector-state（用例清单）、claude/kimi/grok/opencode-reader（清单）
- tests/unit/renderer/components/cpa_connector_settings.test.tsx、forms/\*.test.tsx（用例清单）、token-stats 组件测试（清单）
- tests/unit/renderer/lib/token-stats/format.test.ts（全读）、chart-data.test.ts（时区相关片段）
- docs/specs/window-management.md、cli-import-config.md、log_rotation.md、ai-cli-token-stats-api.md（grep）；docs/blueprint/conventions.md、decisions.md（grep）；docs/guides/testing.md；docs/archive/tasks/t081_popup_height_full_workarea/spec.md

执行过的只读检查：

- `git rev-parse HEAD`（51ea3972）+ `git log`（t081 提交 60fa5f06、t309 fe7059e3 等）
- grep：UTC+8/28800 全仓分布、`"second"` window 枚举、`exportCurrentLog` 调用方、`Number.isFinite` 死守卫、`same_config` 构造点、chart-data/bucketize 时区边界、TZ 环境变量在测试配置中是否存在（无）
- python 脚本解析 bundle.json 选取 index%6==5 的 18 个 bundle 并校验 25 个 handoff 状态一致性
