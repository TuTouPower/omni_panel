# Review Bundle: robustness | chunk 3

- Perspective: robustness（错误处理、失败回滚、超时、重试、幂等、竞态防护、日志上下文、静默失败、恢复能力；不涉及安全）
- Chunk: 3（`index % 6 == 2`）
- Bundles reviewed: 19（connectors_codex / connectors_glm / connectors_tavily / scripts / src_main_core_config / src_main_core_observation / src_main_core_session_history / src_main_index_ts / src_preload_oauth_api_ts / src_renderer_components_AccountRow_tsx / src_renderer_components_ConfirmDelete_tsx / src_renderer_components_DragGrip_tsx / src_renderer_components_ProviderNav_tsx / src_renderer_components_TokenPanel_tsx / src_renderer_components_VendorCard_tsx / src_renderer_components_session_library / src_renderer_hooks / src_renderer_vite_env_d_ts / src_web_usageboard_web_ts）
- Files reviewed: 60
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][65] src/main/core/session-history/claude-code-extractor.ts:124 — 增量提取无半行容错：游标落行中间时该记录永久跳过 — `extract_claude_code_incremental` 直接 `buf.subarray(cursor.offset)` 从字节游标续读，游标无条件推进到 `statSync(file).size`（143-148 行）。若上次读取发生在写入半行时（claude_code 订阅走 `pick_strategy` 的 fs.watch（subscription-service.ts:180），事件按 write syscall 粒度触发，大记录跨 tick 分块写时首事件读到中间偏移），该半行 JSON 解析失败被跳过且游标越过它，下次读取不再重读 → 消息从实时窗口与 extract_cache 缓存查询中永久消失（cache 在 `refresh_cache_after_change` 以追加方式更新，mtime/size 已与文件一致，query 命中缺消息缓存，需重启或重新订阅才恢复）。同一代码库 grok 提取器在 t216（commit c41e15e0）专门加了「半行容错 + 未完成尾行驻留行首」并有测试「半行写入：cursor 落在行中间时增量不丢该记录」，claude 未获得同等防护。修复：仿照 grok-extractor.ts:145-159 的游标回退逻辑（lastIndexOf(0x0a) 找行边界、部分行不完整则从行首重读、尾行不完整则游标驻留行首）。注意 `refresh_cache_after_change`（subscription-service.ts:410-425）也要改为从文件重读完整行。

- [Medium][45] src/main/core/session-history/kimi-extractor.ts:152 — 增量提取同缺半行容错，且 UTF-8 截断致字节 id 错位 — `extract_kimi_code_incremental` 同样直接 `buf.subarray(cursor.offset).toString("utf-8")` 后 `scan_lines(content, cursor.offset)`。两个后果：(1) 2s 轮询（subscription-service.ts:180 poll 策略）恰好落在某记录 write 中间时，该记录被跳过且游标越过，与 claude 同；无 grok 式行边界回退。(2) 若游标切在多字节 UTF-8 字符中间，decode 产出 U+FFFD（3 字节）而文件原字节可能是 1-4 字节，`scan_lines` 以 `Buffer.byteLength` 累计的行起始偏移与全量提取（base=0）的 `kimi:${offset}` id 全局错位 1-3 字节，窗口按 id 去重会丢新消息或重复显示。修复：增量读取前回退到最近行边界（grok-extractor.ts:145-159 模式），并在 UTF-8 截断时从 `buf.lastIndexOf(0x0a)` 之前的完整字节位置起算。

- [Medium][70] scripts/package-and-run.ts:112 — better-sqlite3 ABI 恢复只走成功路径，构建中断后开发环境 NODE_MODULE_VERSION 失配 — main() 中 `ensure_sqlite_abi.mjs electron`（112 行）切到 Electron ABI 后，electron-vite build / vite build / electron-builder 任一 execSync 抛错都会让 135 行的 `ensure_sqlite_abi.mjs node` 恢复永不执行（无 try/finally），node_modules/better-sqlite3 停留在 Electron ABI，后续 `tsx`/node 直接运行报 `NODE_MODULE_VERSION` 错误，需手工重跑恢复。修复：把 112-135 打包段包进 try/finally，finally 里恢复 Node ABI（或捕获异常后恢复再 rethrow）。

- [Low][50] scripts/package-and-run.ts:51 — Windows 下等待循环的休眠命令必然抛错中断打包 — `execSync("timeout /t 1 /nobreak >nul 2>&1 || sleep 1", { shell: "cmd.exe" })`：`timeout` 在 stdin 被 pipe（execSync 默认）时输出 "Input redirection is not supported" 并以非零退出；随后 `|| sleep 1` 中 `sleep` 不是 cmd 命令，错误级 9009，execSync 抛错且不在 try 内 → wait_for_exit 在进程仍存活需重试的第一轮即崩溃（Windows 专属；Linux 上 GNU `timeout /t ...` 同样失败但 `sleep 1` 可用，故不炸）。修复：按平台分支（Windows 用 `powershell Start-Sleep -Milliseconds`，或 `node -e "setTimeout(...)"`），并给该 execSync 加 try/catch。

- [Low][45] src/main/core/session-history/subscription-service.ts:437 — 「watcher 已死则重建」注释与实现不符，watcher 死亡后订阅静默停摆 — subscribe 的幂等分支 `existing.watcher ??= this.start_watcher(existing)` 只在 `watcher === null` 时重建；fs.watch 出错时（196-198 行 error 回调）只 `log.warn`，`sub.watcher` 仍非 null，watcher 实际已失效（如被监控文件删除后部分平台 watcher 关闭）→ 订阅永不重建、无轮询降级，更新静默丢失，且无任何日志说明订阅已死。修复：error 回调里 stop 当前 watcher 并置 null（或降级为 poll），触发下次 subscribe/变化时重建。

- [Low][45] src/main/core/session-history/subscription-service.ts:223 — poll watcher 只比对 mtime，文件被替换/截断重写时字节游标静默跳过新内容 — poll 分支仅以 `statSync(file_path).mtimeMs` 变化触发 on_change，随后 handle_change 用旧 `sub.cursor`（字节 offset）做增量：若源文件被替换或截断重写（删除重建、truncate+rewrite），旧游标可能落在新文件长度之外，`subarray` 返回空 → 新内容整体不推送，游标推进到新 size 后继续增量，重建后的会话消息全部静默缺失，无检测无日志。fs.watch 分支同样不验证文件身份。修复：handle_change 前校验 `safe_stat` 与 cursor 的一致性（size 回退即视为重写，重置 cursor 走全量），或提取器对 `cursor.offset > file.size` 返回全量。

- [Low][50] src/renderer/hooks/use-config.ts:82 — 乐观保存失败不回滚，UI 状态与主进程 config 永久分叉 — `save`/`update_config` 先 `config_ref.current = newConfig; setConfig(newConfig)` 再排队写盘；写盘失败仅 `log`（85-92、104-110 行），state 保持失败的配置，主进程仍是旧值，后续其它窗口的保存会以该脏 state 为 base 覆盖（renderer 的 save 不走 `saveIfBaseMatches` 冲突检测）。用户视角：改动显示已保存但实际未生效，且无任何可见错误提示。修复：save 失败时回滚 config_ref/state 到上一已确认值并向 UI 暴露错误；或改用带 base 的 CAS 保存。

- [Low][40] src/renderer/hooks/use_connector_catalog.ts:57 — createInstance 持久化后后续步骤失败 → 孤儿实例无回滚 — `create_instance_and_save` 先 `createInstance(manifest_id)`（该调用已把新实例写入 config），随后 `savePluginSettings`/OAuth logout 任一步抛错，新建实例带着默认参数残留在 config，对话框显示失败但用户下次打开会看到一个空账号，无补偿删除。修复：save 失败时调用删除/回滚接口清理刚创建的 instanceId。

- [Low][40] src/renderer/components/session-library/SessionLibrary.tsx:309 — summaries 批量请求失败把 key 置 "" 且永久阻断重试 — summaries effect 的 catch（309-314 行）给所有 needed key 写 `""`，而 effect 的 needed 判定是 `summaries[k] === undefined`（291 行）：一次瞬时网络失败后这些会话在该组件生命周期内永不重试摘要，UI 长期显示空摘要（成功路径对无摘要的会话同样写 ""，二者不可区分）。修复：区分「已成功空摘要」与「失败」，失败 key 不落 summaries（留 undefined）或加失败计数/退避重试。

- [Low][45] src/main/index.ts:837 — 预热的 settings 窗口 loadURL 失败只 log，打开即白屏且无重试 — `ensure_settings_window` 的 `loadURL(...).catch` 仅 log.error；失败后 settingsWin 保持 unloaded，`createOrFocusSettings` 的 show() 会显示空白窗口，且 settings_bounds_applied 已置位，后续打开不触发任何重载。trayMenuWin 的 loadURL（1078 行）同样。修复：show 前检测 `webContents.isLoading()`/`getURL()` 为空则重试 loadURL，或失败时销毁引用下次重建。

- [Info][30] src/web/usageboard-web.ts:161 — token-stats 轮询 setInterval 无条件创建且永不清理 — `setInterval(..., POLL_MS)` 在 create_web_usageboard 时即启动，即使没有任何 `onUpdated` 订阅者，也每 10s 空转遍历空 Set 直到页面卸载（无 dispose 钩子）。桌面端是事件驱动无此定时器。修复：首个订阅者注册时再启动 interval、最后一个注销时 clearInterval。

- [Info][25] src/main/core/observation/observation-store.ts:235 — 非 stale 观测的同键同 ts 重复插入无去重保护 — `insert` 只对 `obs.stale` 的副本做同 (provider, account, metric, instance, observed_at) 的删除后插入（t174）；非 stale 路径若上游同一轮内对同键重复 insert（refresh-service.ts:321 失败重试路径 `max_attempts` 循环在插入失败 throw 前重跑，重复成功插入），会落两行同 ts 非 stale 行，`get_latest` 的 `ORDER BY observed_at DESC, stale DESC` 无 tie-breaker 取行不确定。概率低（同 ms 内重复），但 insert 前置的幂等删除可统一覆盖两种 stale 值。建议：非 stale 插入前同样按键删旧（或改为 INSERT OR REPLACE 语义）。

## Reviewed files

- connectors/codex/connector.ts, connectors/codex/manifest.json, connectors/glm/connector.ts, connectors/glm/manifest.json, connectors/tavily/connector.ts, connectors/tavily/manifest.json
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

## Executed read-only checks

- `git rev-parse HEAD`（51ea3972）、`git status --porcelain`（干净）
- `git log --oneline` 对 claude/grok/kimi extractor：确认 grok 半行容错修复为 t216（c41e15e0），claude/kimi 无对应提交；`git show c41e15e0` 核对修复内容
- 测试覆盖比对：grok-extractor.test.ts 有「半行写入：cursor 落在行中间时增量不丢该记录（p050）」，claude/kimi extractor 测试无半行用例（grep 半行/mid/partial）
- grep 跟踪 `observationStore.insert` 调用点（refresh-service.ts:321/351/491、local-api/server.ts:787）验证重复插入路径
- 读 net-client.ts get_json 契约（HTTP≥400 throw、空 body 返回 null）核对 connector 错误路径
- 读 refresh-service.ts:280-360 验证 stale 副本插入与重试循环
