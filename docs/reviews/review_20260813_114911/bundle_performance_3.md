# Review Bundle — performance | 3

- perspective: performance
- chunk: 3（index % 6 == 2，共 19 bundles / 60 files）
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`
- 审查范围：connectors_codex / connectors_glm / connectors_tavily / scripts / src_main_core_config / src_main_core_observation / src_main_core_session_history / src_main_index_ts / src_preload_oauth_api_ts / src_renderer_components_AccountRow_tsx / src_renderer_components_ConfirmDelete_tsx / src_renderer_components_DragGrip_tsx / src_renderer_components_ProviderNav_tsx / src_renderer_components_TokenPanel_tsx / src_renderer_components_VendorCard_tsx / src_renderer_components_session_library / src_renderer_hooks / src_renderer_vite_env_d_ts / src_web_usageboard_web_ts

## Findings

- [Medium][80] src/main/core/session-history/grok-extractor.ts:161 — grok 增量提取每次全量重 parse 游标前的全部行，O(N) per poll — `extract_grok_incremental` 为延续全量 id 命名空间（`grok:${lineIndex}` 按合法消息累计计数），每次 2s 轮询变更触发时执行 `head_text = buf.subarray(0, parse_start).toString("utf-8")` + `parse_grok_lines(head_text.split("\n"), 0)`（161-162 行），把整个 chat_history.jsonl 从头部重新解码、split、逐行 JSON.parse 一遍；文件为追加型，前缀内容永不变化。会话越长每轮重复解析量越大（MB 级文件 + 上千行时每次增量都等价于一次全量扫描），且 grok 源位于 WSL 9P 网络文件系统，成本进一步放大。修复建议：把「合法消息计数」持久化进 ExtractCursor（如 `{ kind: "byte_offset", file, offset, valid_count }`），增量从 offset 续读时直接以缓存计数为起始序号，只在 cursor 版本不匹配时回退全量重计（与 kimi 用字节 offset 作 id 的思路一致，见 kimi-extractor.ts:52）。

- [Medium][75] src/main/core/session-history/claude-code-extractor.ts:126 — claude 增量提取整文件 read 但只消费尾部 — `extract_claude_code_incremental` 中 `readFileSync(file)` 全量读盘后才 `buf.subarray(cursor.offset)`（126-127 行）。claude_code 走 fs.watch 策略（subscription-service.ts:180），活跃会话每写入一条消息触发一次 change → 每次 handle_change 都全量读一遍 transcript；文件随会话增长到数 MB~数十 MB 后，每写入 ~1KB 增量就触发一次全量磁盘 IO。kimi-extractor.ts:151 同模式（2s 轮询 + mtime 变化触发）。修复建议：增量读改用 `openSync`/`readSync` 从 `cursor.offset` 只读剩余字节（参照 head-read.ts 的 fd 读取方式），或先 `statSync(file).size` 与 offset 比较，仅在有新字节时才读增量部分。

- [Medium][70] connectors/codex/connector.ts:50 — codex 本地连接器每轮刷新全量 list+read+parse 所有 session 文件，无增量无缓存 — `main()` 对 `~/.codex/sessions` 与 `~/.codex/archived_sessions` 两个目录 `ctx.files.list` 收集全部文件后逐个 `ctx.files.read` 整读并逐行 JSON.parse（50-58、62-68 行）。该连接器按 resolve_refresh_interval 默认 300s 周期执行（auto-seed.ts 的 FOLLOW_GLOBAL_REFRESH_SENTINEL + DEFAULT_FALLBACK_REFRESH_SECONDS=300），每 5 分钟全量重扫全部会话文件（含归档）；会话文件多、文件大时是持续性的重复 IO + 重复解析。修复建议：仿照 session-history 提取器按文件 mtime/size 增量处理（维护每文件解析 offset 或只读新增行），或按 size 上限跳过超大文件。

- [Low][60] src/web/usageboard-web.ts:714 — web `recent()` 无 limit 拉取却只用 20 条 — `recent()` 直接 `get_json<TokenStatsSession[]>("/v1/sessions")`，服务端 `query_sessions` 默认 limit=100（token-stats-store.ts:1100），随后 `sessions.slice(0, 20)`（716 行）只取 20 条，多余 80 条会话全量经 HTTP 传输并序列化。修复建议：构造查询参数 `limit=20`（对齐桌面 IPC 侧 recent 的 limit 语义），如 `get_json("/v1/sessions?limit=20")`。

- [Low][55] src/main/core/session-history/kimi-extractor.ts:61 — scan_lines 每行重复切片同一区间 — 循环内 `const line = content.slice(line_start, match.index)` 与下一行 `Buffer.byteLength(content.slice(line_start, match.index + 1))`（66-68 行）对同一行区间做两次 slice（第二次含换行符），每次 slice 都新建子串；大文件（wire.jsonl 数万行）下产生约 2 倍于文件大小的临时字符串分配。修复建议：复用单个 slice 变量（如 `const raw = content.slice(line_start, match.index + 1)`，line 用 `raw.slice(0, -1)` 或统一含换行处理），避免重复分配。

- [Info][40] src/main/core/observation/observation-store.ts:297 — query_trend_series 无 SQL 上限，窗口内全量行拉入 JS 再分桶 — `query_trend_stmt` 仅按 `observed_at >= ?` 过滤（228-232 行），`query_trend_series` 把窗口内全部观测行实例化为对象后内存分桶（297-316 行）。sparklineWindowDays 上限 365（config types.ts:119），若用户刷新间隔极小（5 分钟）单键 30 天窗口约 8.6k 行、365 天约 105k 行，每次趋势查询全量转换；当前规模（单键行数）尚可接受，但属可优化点。修复建议：若成本成为问题，可在 SQL 侧按 `observed_at` 降采样（如每桶取 max 的窗口函数），或对行数设上限截断后再分桶。

- [Info][35] src/renderer/components/session-library/SessionLibrary.tsx:287 — summaries effect 依赖可见会话新数组，每次渲染重扫 — `visible_sessions = content_filtered.slice(0, visible)`（284 行）每次渲染产生新数组，summaries effect 依赖 `[visible_sessions, summaries, ...]`（320 行）随之每帧重跑；多数帧 `needed` 为空仅 O(50) 遍历，且 has(key)/inflight 去重避免了重复请求，故影响有限。修复建议：将 effect 依赖改为稳定化引用（如按 `key_of` 列表 memo），或仅在 `visible`/`content_filtered` 变化时更新。

- [Info][30] src/renderer/hooks/use-echarts.ts:105 — deps 变化时每次全量 setOption(notMerge=true) — `useEffect` 以调用方 deps 为依赖执行 `setOption(getOptionRef.current(), true)`（102、106-108 行），notMerge=true 每次重建整个 option 并全量重渲染图表。若上游 deps 传入非稳定引用（每次渲染变化的对象/数组），会造成不必要的 echarts 全量重绘。本文件本身实现合理（懒加载单例、dispose 清理到位），标注为消费方需保证 deps 稳定性的观察。

- [Info][25] src/main/index.ts:531 — onConfigSaved 每窗广播全量 config + 各窗 JSON.stringify 值比较 — 每次 config 保存（含窗口 bounds 移动触发的 500ms debounce scheduleSave）都会向所有窗口 `send(CONFIG_CHANGED, updatedConfig)`（574-578 行），消费端 use-config.ts:73 对每份广播做 `JSON.stringify(incoming) === JSON.stringify(current)` 全量序列化比较以抑制重渲染。config 体积小、广播频率低（保存驱动），成本可接受；仅记录观察，若未来 config 增大（大量插件/映射）需改为字段级 diff 或版本号。

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

## 执行的只读检查

- 读取 bundle.json 全量并按 id 排序计算 chunk 3 命中 bundles（index % 6 == 2）。
- 逐文件读取上述 60 个文件的 HEAD 内容。
- 追踪下游/上游调用：refresh-service.ts（脚本缓存 script-cache.ts、并发 with_concurrency limit=5、retry 路径）、connector-scheduler.ts（setTimeout 间隔调度）、tier1-poll-executor.ts、runtime.ts（script 优先于 poll 的执行分支）、local-api/server.ts `/v1/sessions`（默认 limit=100）、token-stats-store.ts `query_sessions` 默认 limit 与 SQL、manifest.json 三份（glm/tavily 均含 `script` 字段，确认走脚本路径）。
- `git log` 核对 grok-extractor（t216 id 全局唯一 + 半行容错，c41e15e0）、codex connector（t055）、usageboard-web（t279/t325）的引入历史。
- 未发现 `// @review-ok` 豁免标记。
