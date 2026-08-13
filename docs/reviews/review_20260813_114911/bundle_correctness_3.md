# Bundle Review: correctness | chunk 3

- Perspective: correctness
- Chunk: 3（`index % 6 == 2`）
- Reviewed bundles: 19 / 111
- Reviewed files: 60
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][60] src/main/core/session-history/claude-code-extractor.ts:143 — claude/kimi 增量提取游标越过未完成半行，完成的整行消息在订阅推送流中永久丢失 — `extract_claude_code_incremental` 读取 `buf.subarray(cursor.offset)`（:127）后无条件把新游标推进到 `statSync(file).size`（:143-146），`JSON.parse` 失败的行直接跳过（:134-138）。若 watcher 触发时文件尾部是写入中的半行（Claude CLI/agent 缓冲写，fs.watch 每次 write 触发），该半行字节被计入新游标；写入方补完该行后，下一次增量从行中间续读 → 整行 JSON.parse 失败 → 被跳过的行永远不会再被提取。`kimi-extractor.ts:157-159` 同样无半行容错。对照 `grok-extractor.ts:145-159,168-183` 对同一场景有显式回退（游标停在半行行首、下次重读），说明这是实现遗漏而非设计取舍。影响：会话面板订阅推送漏一条消息（query 通道在文件再次变化导致缓存失效后做全量提取可自愈，推送通道不恢复）。修复：对齐 grok——增量读取时若尾部（最后一个 `\n` 之后）为非空且 JSON 不完整，新游标停在行首（tail_start），等补全后重读。

- [Medium][70] src/main/core/config/types.ts:95 — AppConfiguration.tokenStats 类型有、zod schema 无 → parse 时被 strip，index.ts 两处读取恒走默认值，未来写入即静默丢失 — `appConfigurationSchema`（config-store.ts:72-120）未声明 `tokenStats` 子对象，zod v3 `z.object` 默认 strip 未知键，故 `parse_config`（config-store.ts:127-144）返回的数据永远不含 `tokenStats`；`src/main/index.ts:417-425`（`build_token_stats_config`：wsl_enabled/wslDistro/wslUser/pollIntervalMinutes 全落 `?? 默认`）与 `index.ts:487-488`（session_history_locator_paths 的 wsl_distro/wsl_user 恒为 `"Ubuntu-22.04"`/`""`）读到的 `currentConfigSnapshot.tokenStats` 恒为 undefined。全仓 grep 无任何写入方，当前无运行时影响；但该字段作为 AppConfiguration 公开契约（shared/types/config.ts:95-100）已暴露，任何未来写入方（或手工编辑 config.json）保存后，重启加载即被 strip 丢失。修复：把 `tokenStats` 子对象加入 `appConfigurationSchema`（与类型对齐），或从类型删除该字段并让 index.ts 读专用配置源。

- [Low][80] scripts/package-and-run.ts:51 — Linux 分支执行 Windows 命令串并在仓库根目录创建 `nul` 垃圾文件 — `execSync("timeout /t 1 /nobreak >nul 2>&1 || sleep 1", { shell: is_win ? "cmd.exe" : "/bin/sh" })`：Linux 下 `/bin/sh` 执行 Windows 语法——`>nul` 被 shell 当作重定向到名为 `nul` 的普通文件（在 cwd 创建空文件），GNU `timeout /t 1 /nobreak` 因 `/t` 非合法时长报错后由 `|| sleep 1` 兜底，循环实际靠 sleep 撑 1s。:58 `taskkill ... 2>nul || pkill -9 -f OmniPanel` 同理再创建一次 `nul`。后果：Linux 上每次运行该脚本在项目根目录留下 `nul` 空文件。修复：按 platform 分别构造命令字符串（Linux 用 `sleep 1` 与 `pkill -9 -f OmniPanel`，去掉 `>nul` 重定向），或统一改用 Node 的 `setTimeout` 睡眠与 `spawnSync` 探测。

- [Info][70] src/renderer/components/session-library/SessionLibrary.tsx:207 — `content_hits` state 只写不读，死状态 — `const [, set_content_hits] = useState<Set<string>>(new Set())`：值从不参与渲染（`visible_sessions` 由 `content_sessions` 派生，:209-212/284），只有 setter 被调用（:224/230/261）触发多余重渲染。建议删除该 state 及三处 `set_content_hits` 调用。

- [Info][50] connectors/glm/connector.ts:119 — 5h 周期观察的 `window: "second"` 与 `cycleDurationMs: 5h` 语义不一致 — tool 分支 `window: pk === "month" ? "month" : pk === "week" ? "day" : "second"`，text 分支（:147）同样把 "5h" 映射为 `"second"`。窗口字段用于下游展示/聚合分组语义（hour/day/week/month），5h 额度被标注为秒级窗口与 5 小时周期不匹配（`cycleDurationMs` 却正确设 5\*3_600_000）。若下游按 window 分组渲染会错分桶。建议把 "5h" 映射为 "day"（或明确该字段仅作展示、不参与分组并注释）。

## Reviewed files

- connectors/codex/connector.ts, connectors/codex/manifest.json
- connectors/glm/connector.ts, connectors/glm/manifest.json
- connectors/tavily/connector.ts, connectors/tavily/manifest.json
- scripts/designmd.ts, scripts/export-schemas.ts, scripts/gen-build-info.ts, scripts/package-and-run.ts, scripts/smoke_check.md, scripts/token-stats-baseline.ts, scripts/token-stats-spike.ts
- src/main/core/config/auto-seed.ts, config-store.ts, secret_param_keys.ts, secrets-store.ts, types.ts
- src/main/core/observation/observation-store.ts
- src/main/core/session-history/claude-code-extractor.ts, grok-extractor.ts, head-read.ts, kimi-extractor.ts, opencode-extractor.ts, session-locator.ts, session-path-index.ts, subscription-service.ts, types.ts
- src/main/index.ts
- src/preload/oauth_api.ts
- src/renderer/components/AccountRow.tsx, ConfirmDelete.tsx, DragGrip.tsx, ProviderNav.tsx, TokenPanel.tsx, VendorCard.tsx
- src/renderer/components/session-library/AgentFilterChips.tsx, SelectionDock.tsx, SessionCard.tsx, SessionLibrary.tsx, SessionList.tsx, SessionPreview.tsx, SessionRow.tsx, session-library-utils.ts
- src/renderer/hooks/use-config.ts, use-device-login.ts, use-echarts.ts, use-now-tick.ts, use-plugins.ts, use-popup-height-report.ts, use-popup-ui-config.ts, use-resize-observer.ts, use-route.ts, use_connector_catalog.ts, use_dnd_handlers.ts, use_popup_derived.ts, use_provider_tab_drag.ts, use_tab_navigation.ts
- src/renderer/vite-env.d.ts
- src/web/usageboard-web.ts

## Read-only checks performed

- 读取 bundle.json 全文，按 `index % 6 == 2` 选出 19 个 bundle（60 文件），全部读取当前 HEAD 内容。
- 交叉验证 host-io `files.list/read` 实现（src/main/core/connector/net-client.ts `expand_home`/`list_dir_recursive`），确认 codex/glm/tavily connector 的 `~` 路径与目录递归行为正常。
- 交叉验证 ObservationWindow/DisplayStyle/Status/Source 类型（src/shared/types/observation.ts），确认 glm 的 `"second"` 等取值类型合法。
- 全仓 grep `tokenStats|wslEnabled|wslDistro|wslUser|pollIntervalMinutes`，确认无写入方、无设置 UI，仅 index.ts 读取。
- 交叉对照 grok-extractor 的半行容错逻辑与 claude/kimi 增量提取器，确认行为不一致。
- `git log -1` 取 HEAD SHA；未做任何修改、未运行任何可写命令。
