# Review Report — tests_docs_spec | chunk 4

- perspective: `tests_docs_spec`
- chunk: `4`（bundle index % 6 == 3）
- 审过 bundles: 18 / 111
- 审过 files: 50
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`
- 关联检查：connector/integration/unit/ipc/repo_template 测试、`docs/specs/*.md`、`docs/blueprint/conventions.md`、`git log`（t122/t274/t316/t331/t337/t175 等）

## Findings

- [Medium][85] src/renderer/components/CpaAddDialog.tsx:66 — 假实现组件无任何测试覆盖、无 spec 契约 — 「保存并同步」「测试连接」按钮（:59、:66）无 onClick，`url`/`key` state 仅用于 `canSave`（:27）从不提交；且 `SettingsView.tsx` 全文件无 `setShowCpaAdd(true)`（仅 :123 初始化与 :688 关闭），对话框不可达；`tests/unit/renderer/views/settings_view_cpa.test.tsx`（461 行）全部测 CpaConnectorSettings/CpaCard，无一条 CpaAddDialog 用例，`docs/specs/connector-cpa-ui.md` 也未定义其行为。t122（172b880c）提取后从未接线。修复建议：若为占位则删除组件与 showCpaAdd state；若需添加 CPA 入口则接线 `CONFIG_CREATE_INSTANCE` + secrets 保存并补渲染/保存测试与 spec AC。

- [Medium][90] src/renderer/components/WebLoginSection.tsx:107 — `Icon name="alert_circle"` 未注册导致错误提示渲染空 SVG，且测试无注册守卫 — Icon.tsx:71-121 `UI_ICONS` 无 `alert_circle` 键，未知名走 :174-191 降级为内容为空的 `<svg>`；登录失败提示（error 分支）图标不可见。同模式还有 DeviceLoginSection.tsx:214、SessionSection.tsx:53。`tests/unit/renderer/components/icon.test.tsx:47-52` 只测 `nonexistent` 空渲染（该降级设计本身正确），但没有「消费方引用的 name 均已注册」的守卫测试，注册表与引用漂移不会被测试捕获。修复建议：注册 lucide `AlertCircle` 到 UI_ICONS；或加静态守卫测试（扫描 `<Icon name="…">` 引用集合 ⊆ UI_ICONS 键集合）。

- [Low][50] connectors/cpa/connector.ts:305 — antigravity `remainingFraction` 缺失/零值的 proto3 省略语义无注释、无测试锁定 — `to_number(undefined)` 返回 0（:39），quotaInfo 存在但字段缺失时 `remaining=0 → min_remaining=0 → used=100`（:305-316）；proto3 JSON 零值省略下该值语义上等于「剩余 0 = 用尽」，结果碰巧正确，但对比 grok connector.ts:175-176 对同一 proto3 语义有显式注释，此处缺失；`tests/integration/connector/cpa-connector.test.ts` antigravity 用例（:465-504）全部带 `remainingFraction`，无缺失字段/0 边界用例。修复建议：补注释说明零值省略语义，并增加 remainingFraction 缺失与 =0 两个用例锁定行为。

- [Low][55] src/main/core/connector/probe-executor.ts:112 — 声明式 poll/probe 路径 status 硬编码 `"normal"`，且测试固化该行为 — used/limit 有效（:93-96）时 status 恒 normal，`provider-usage.ts` 的 `worst_status`（:126）依赖该字段，used 接近 limit 的 probe/poll 连接器 UI 不告警；`tier1-poll-executor.ts:86` 同。`tests/integration/connector/probe-executor.test.ts:140` 断言 status normal，无高用量用例。若为脚本型 connector 才做阈值的已知简化，应在 host-io/spec 文档化。修复建议：改用 `ctx.status.for_ratio(used, limit)` 或文档化限制，并补 used=95/limit=100 用例。

- [Low][65] src/renderer/components/TrendSparkline.tsx:111 — 固定 `id="trend-sparkline-fill"` 多实例冲突，测试未覆盖 — 账号展开区每账号渲染一个 sparkline（ProviderCard），同页多实例共享同一 gradient id；SVG `url(#…)` 解析到文档首个匹配元素，首个实例卸载（折叠账号）后其余实例面积填充引用失效（透明）。`tests/unit/renderer/components/trend_sparkline.test.tsx`（101 行）全部单实例渲染，未覆盖多实例/卸载场景。修复建议：`useId()` 生成唯一 gradient id，补双实例 + 卸载首实例后第二实例 fill 仍引用的测试。

- [Low][45] scripts/repo_template/\_id_scan.py:94 — Windows 下 msvcrt.locking 对空文件锁定 1 字节会失败 — `open(lock_path, "w")` 创建 0 字节文件，`msvcrt.locking(fh, LK_LOCK, 1)`（:75）锁定范围超出 EOF，Windows 原生运行抛 OSError；`tests/repo_template/test_pending.py:186` 并发分配测试在 Linux/fcntl 路径通过，Windows 分支无测试。修复建议：`open` 后先 `fh.write("\0")` 保证 ≥1 字节再锁定；或锁定前按需写入并注明平台差异。

- [Low][60] src/main/ipc/session-history-ipc.ts:295 — `metadata_rows.includes(row)` O(n²) — `metadata_rows` 与 `candidate_rows` 均为 `query_all_sessions` 全量分页结果（:87-101），includes 线性查找嵌套在逐行循环中，搜索范围大（多源、长日期区间）时二次方；`tests/unit/ipc/session-history-ipc.test.ts` 未覆盖大规模候选行。修复建议：用 `new Set(metadata_rows.map(key_of))` 预建集合判包含。

- [Info][60] scripts/repo_template/check_review_status.py:84 — `parse_front_matter` 三处副本无一致性守卫 — 注释自述「task.py / render_review_prompts.py 各有副本，改规则需三处同步」（render_review_prompts.py:39 同）；`tests/repo_template/test_check_review_status.py` 与 `test_render_review_prompts.py` 各自单测，漂移不互见。修复建议：抽取公共模块（如 repo_task/documents.py）或加三份输出比对的一致性测试。

## Reviewed files

- connectors/cpa/{connector.ts, manifest.json}、connectors/grok/{connector.ts, manifest.json}、connectors/tikhub/{connector.ts, manifest.json}
- scripts/repo_template/{\_id_scan.py, check_review_status.py, findings.py, pending.py, render_review_prompts.py, repo_state.py, spikes.py, task.py, track_worktree.py}
- src/main/core/connector/{host-io.ts, manifest-loader.ts, net-client.ts, probe-executor.ts, runtime.ts, script-cache.ts, tier1-poll-executor.ts}
- src/main/core/{open-connectors-dir.ts, settings-close-action.ts}
- src/main/ipc/{auth-ipc.ts, build-info-ipc.ts, config-ipc.ts, connector-ipc.ts, event-ipc.ts, grok_auth_ipc.ts, helpers.ts, kimi_auth_ipc.ts, log-ipc.ts, logged.ts, popup-ipc.ts, session-history-ipc.ts, session-ipc.ts, size-validation.ts, token-stats-ipc.ts, trend-ipc.ts}
- src/preload/route_api.ts
- src/renderer/components/{AddAccountDialog.tsx, CpaAddDialog.tsx, Icon.tsx, ProviderOverview.tsx, TrendSparkline.tsx, WebLoginSection.tsx, session-shell/SessionShell.tsx}
- src/renderer/index.tsx、src/shared/constants.ts

## 执行过的只读检查

- 解析 bundle.json 按 index%6==3 分配并核对 50 文件
- 通读全部 50 文件当前 HEAD 内容
- 对照测试：tests/integration/connector/{cpa-connector, grok_connector, tikhub_connector, runtime, probe-executor}.test.ts、tests/unit/ipc/{session-history-ipc, event-ipc, connector-ipc}.test.ts、tests/unit/renderer/components/{icon, trend_sparkline, add_account_dialog}.test.tsx、tests/unit/renderer/views/settings_view_cpa.test.tsx、tests/repo_template/test_pending.py
- 对照文档：docs/specs/{connector-cpa-runtime.md, connector-cpa-ui.md, connector-direct.md}、docs/blueprint/conventions.md、schemas/plugin-metadata.schema.json、src/shared/schemas/manifest.ts
- 交叉验证：runtime-store 订阅通知、secrets-store importAll 原子性、local-api/server.ts trend days 处理、SettingsView showCpaAdd 全引用、Icon name 引用 vs UI_ICONS 键、provider-usage worst_status 依赖
- git log：CpaAddDialog（t122）、TrendSparkline、WebLoginSection（t331/t337）、connector status helper（t175）
