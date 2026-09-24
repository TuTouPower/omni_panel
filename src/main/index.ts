import {
    app,
    BrowserWindow,
    nativeTheme,
    Tray,
    nativeImage,
    screen,
    powerMonitor,
    session,
    ipcMain,
    shell,
} from "electron";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { CLI_HELP_TEXT } from "./cli/help-text";
import { open_connectors_dir } from "./core/open-connectors-dir";
import { createConfigStore, run_config_transaction } from "./core/config/config-store";
import { build_secret_param_keys } from "./core/config/secret_param_keys";
import { auto_seed_connectors } from "./core/config/auto-seed";
import {
    getConfigPath,
    getDataRoot,
    getBundledConnectorsDir,
    getUserConnectorsDir,
    get_tray_icon_path,
    get_app_icon_path,
    is_test_build,
    get_observations_db_path,
    get_token_stats_db_path,
    get_snapshot_cache_path,
} from "./core/paths";
import { initLogging, defaultLogLevelForEnv } from "./core/logging";
import { createLogger, setLogLevel } from "../shared/lib/logger";
import { createRuntimeStore } from "./core/scheduler/runtime-store";
import { createSecretsStore } from "./core/config/secrets-store";
import { create_file_vault_backend } from "./core/vault/file-vault-backend";
import { create_session_manager, is_valid_opencode_login } from "./core/session/session-manager";
import { create_observation_store } from "./core/observation/observation-store";
import {
    create_retention_scheduler,
    type RetentionScheduler,
} from "./core/observation/observation-retention";
import { createRefreshService } from "./core/scheduler/refresh-service";
import { createConnectorScheduler } from "./core/scheduler/connector-scheduler";
import { decide_settings_close } from "./core/settings-close-action";
import { createWindowManager, WINDOW_CONFIGS, SECURE_WEB_PREFS } from "./window/window-manager";
import {
    createSchedulerOrchestrator,
    to_connector_list_config,
} from "./core/scheduler/scheduler-orchestrator";
import { apply_launch_at_login, read_launch_at_login } from "./core/launch-at-login";
import type { LoginItemApi, LaunchAtLoginState } from "./core/launch-at-login";
import { hydrate_runtime_store } from "./core/scheduler/hydrate-runtime-store";
import { discover_connector_definitions } from "./core/connector/manifest-loader";
import type { ConnectorDefinition } from "./core/connector/manifest-loader";
import { init_global_network } from "./core/connector/net-client";
import { build_csp_header } from "./security/csp";
import { registerConnectorIpc } from "./ipc/connector-ipc";
import { registerConfigIpc } from "./ipc/config-ipc";
import { set_renderer_index_path } from "./ipc/helpers";
import { registerEventIpc, sync_native_theme } from "./ipc/event-ipc";
import { registerAuthIpc, handleCookieLogin, trySilentCookieRefresh } from "./ipc/auth-ipc";
import { registerGrokAuthIpc } from "./ipc/grok_auth_ipc";
import { registerKimiAuthIpc } from "./ipc/kimi_auth_ipc";
import { registerTokenStatsIpc } from "./ipc/token-stats-ipc";
import { registerDevPanelIpc } from "./ipc/dev-panel-ipc";
import { registerTrendIpc } from "./ipc/trend-ipc";
import { registerSessionHistoryIpc } from "./ipc/session-history-ipc";
import { flush_session_index } from "./core/session-history/session-locator";
import {
    SessionHistorySubscriptionService,
    type Env,
    type SessionQueryFilters,
    type SessionsProvider,
} from "./core/session-history/subscription-service";
import { create_history_window_controller } from "./core/main-panel/history-window-controller";
import { create_token_stats_store } from "./core/token-stats/token-stats-store";
import { create_token_stats_manager } from "./core/token-stats/manager";
import { create_token_stats_query_dispatcher } from "./core/token-stats/query-dispatcher";
import { host_from_platform } from "./core/token-stats/paths";
import { build_token_stats_config } from "./core/token-stats/build-config";
import { create_dev_panel_scan_manager } from "./core/dev-panel/scan-manager";
import { create_dev_panel_model_routing_manager } from "./core/dev-panel/model-routing";
import { create_local_api_server } from "./core/local-api/server";
import type { LocalAPIServer } from "./core/local-api/server";
import type { AppConfiguration } from "../shared/types/config";
import { createOnConfigImported } from "./config-callbacks";
import type { TokenStatsSessionFilters } from "../shared/types/token-stats";
import { registerSessionIpc } from "./ipc/session-ipc";
import { create_grok_oauth_manager } from "./core/auth/grok_oauth_manager";
import { create_kimi_oauth_manager } from "./core/auth/kimi_oauth_manager";
import { create_grok_bot_oauth_manager } from "./core/auth/grok_bot_oauth_manager";
import { registerGrokBotAuthIpc } from "./ipc/grok_bot_auth_ipc";
import { resolve_effective_proxy_url, proxy_config_changed } from "./core/network/effective_proxy";
import { close_all_proxy_agents } from "./core/network/proxy-pool";
import { registerLogIpc } from "./ipc/log-ipc";
import { registerBuildInfoIpc } from "./ipc/build-info-ipc";
import { registerPopupIpc } from "./ipc/popup-ipc";
import { parseSizeReport } from "./ipc/size-validation";
import { IPC_CHANNELS } from "../shared/types/ipc";
import {
    create_main_panel_controller,
    should_hide_popup_on_outside_focus,
} from "./core/main-panel/main-panel-controller";
import { setup_application_menu } from "./menu/application-menu";
import { create_agent_window_controller } from "./core/main-panel/agent-window-controller";
import { apply_window_bounds, watch_window_bounds, get_saved_bounds } from "./window/window-bounds";
import type { MainPanelController } from "./core/main-panel/main-panel-types";
import { clear_dock_badge } from "./core/dock-badge";
import { apply_dock_visibility } from "./core/dock-visibility";
import { cleanup_temp_files } from "./core/storage/write-json";
import { extract_user_argv, resolve_entry, type CliArgs } from "./cli/args";
import { run_background_serve_parent } from "./cli/background_serve";
import { import_config_file } from "./cli/import-config";
import { write_cli_json } from "./cli/cli-json";
import { is_e2e_headless } from "./e2e-headless";

const process_log = createLogger("process");

// Suppress EPIPE when stdout pipe is closed (e.g. launched from script with broken pipe)
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") return;
    process_log.error("Uncaught exception", err);
});

process.on("unhandledRejection", (reason: unknown) => {
    process_log.error(
        "Unhandled promise rejection",
        reason instanceof Error ? reason : String(reason),
    );
});

// 单一入口：用户 argv → help / gui / cli（含 serve 默认后台）。
const entry = resolve_entry(extract_user_argv(process.argv), {
    stdout_is_tty: process.stdout.isTTY,
});
if (entry.kind === "help") {
    process.stdout.write(CLI_HELP_TEXT);
    process.exit(0);
}
if (entry.kind === "invalid") {
    process.stderr.write(`OmniPanel: ${entry.message}\n`);
    process.stdout.write(CLI_HELP_TEXT);
    process.exit(1);
}
if (entry.kind === "cli" && entry.background_serve && entry.command.type === "serve") {
    run_background_serve_parent(entry.command.options);
}
const cli_args: CliArgs =
    entry.kind === "cli" ? { cli: true, command: entry.command } : { cli: false };
const cliMode = cli_args.cli;

// Prevent white screen on systems where GPU process crashes
app.disableHardwareAcceleration();

// 测试构建：setName 让单实例锁与 userData 独立于正常实例。
// app.name 决定 requestSingleInstanceLock 的锁标识与 %APPDATA%/<name> 目录。
if (is_test_build()) {
    app.setName("OmniPanelTest");
}

// t322: serve 支持 `--user-data-dir <path>` 覆盖 userData 目录。
// app.setPath 需在 getDataRoot()（whenReady 内）之前调用，否则 dataRoot、
// 单实例锁与 cli.json 均落在默认目录。
if (cliMode && cli_args.command?.type === "serve" && cli_args.command.options.userDataDir) {
    app.setPath("userData", cli_args.command.options.userDataDir);
}

// Single-instance lock — prevent duplicate app instances.
// t276: CLI 控制子命令是瘦客户端，需访问运行中实例，不能持有锁（否则自锁
// 无法连上自身）；跳过锁直接执行 HTTP 请求。
const is_thin_client =
    cliMode && cli_args.command !== undefined && cli_args.command.type !== "serve";
if (!is_thin_client) {
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
        app.quit();
    }
}

function getPreloadPath(): string {
    return join(__dirname, "../preload/index.js");
}

/** t360: 取某 provider 的所有启用实例 id（enabled && manifestId 匹配该 def）。 */
function active_instance_ids_for_provider(
    allDefinitions: ConnectorDefinition[],
    plugins: AppConfiguration["plugins"],
    provider: string,
): string[] {
    const def = allDefinitions.find((d) => d.manifest.provider === provider);
    if (!def) return [];
    return plugins
        .filter((plugin) => plugin.enabled && plugin.manifestId === def.manifest.id)
        .map((plugin) => plugin.instanceId);
}

const windowManager = createWindowManager({
    getPreloadPath,
    getIconPath: get_app_icon_path,
    rendererIndexPath: resolve(join(__dirname, "../renderer/index.html")),
});

// t067: IPC file:// sender 精确比对 rendererIndexPath。
set_renderer_index_path(resolve(join(__dirname, "../renderer/index.html")));

let cleanupEventIpc: (() => void) | null = null;
let cleanupPopupIpc: (() => void) | null = null;
let local_api: LocalAPIServer | null = null;

void app.whenReady().then(async () => {
    try {
        // help 已在进程入口处理；此处兜底。
        if (cliMode && cli_args.command?.type === "help") {
            process.stdout.write(CLI_HELP_TEXT);
            app.exit(0);
            return;
        }
        if (cliMode && cli_args.command?.type === "export") {
            const { run_export_command } = await import("./cli/client");
            const exitCode = await run_export_command(cli_args.command.options);
            app.exit(exitCode);
            return;
        }
        // t276: CLI 控制子命令 = 瘦客户端，不进服务初始化。执行完即退出。
        if (
            cliMode &&
            cli_args.command &&
            cli_args.command.type !== "serve" &&
            cli_args.command.type !== "export" &&
            cli_args.command.type !== "help"
        ) {
            const { run_control_command } = await import("./cli/client");
            const cmd = cli_args.command;
            const exitCode = await run_control_command(cmd.type, cmd.options);
            app.exit(exitCode);
            return;
        }

        const dataRoot = getDataRoot();
        await cleanup_temp_files(dataRoot);

        // Load and seed configuration before writing any other files to the
        // user data directory. Otherwise initLogging/vault/observation-store
        // create the directory first, and config-store mistakes a fresh start
        // for a "config.json missing but directory exists" data-loss scenario.
        const bundledDir = getBundledConnectorsDir();
        const userDir = getUserConnectorsDir();
        const allDefinitions = await discover_connector_definitions(bundledDir, userDir);
        const configPath = getConfigPath();
        const configStore = createConfigStore(configPath, allDefinitions);

        let currentConfig = await configStore.load();
        // t195: manifest 健康检查从 load 抽出，启动期一次性执行（孤儿/非法
        // provider 插件清理并持久化）；运行期 load 走内存缓存。
        currentConfig = await configStore.prune_unhealthy_plugins(
            new Set(allDefinitions.map((definition) => definition.manifest.id)),
        );
        const seed_result = await run_config_transaction(configStore, async (latest, commit) => {
            const { seeded: seededPlugins, updatedExisting } = auto_seed_connectors(
                latest.plugins,
                allDefinitions,
                new Set(latest.removedConnectorIds ?? []),
            );
            if (seededPlugins.length === 0 && updatedExisting.length === 0) {
                return { config: latest, seededPlugins };
            }
            const updatedById = new Map(updatedExisting.map((p) => [p.instanceId, p]));
            const mergedPlugins = latest.plugins.map((p) => updatedById.get(p.instanceId) ?? p);
            const updated = { ...latest, plugins: [...mergedPlugins, ...seededPlugins] };
            await commit(updated);
            return { config: updated, seededPlugins };
        });
        const { config: seededConfig, seededPlugins } = seed_result;
        currentConfig = seededConfig;

        const cleanupLogging = await initLogging(dataRoot, {
            logLevel: currentConfig.logLevel ?? defaultLogLevelForEnv(),
            // t277+: CLI 模式 stdout 保持干净——只留 t275 AC2 的
            // "OmniPanel CLI mode listening on ..." 一行，日志全落文件。
            consoleOutput: !cliMode,
        });
        let logging_cleanup_done = false;
        const log = createLogger("main");

        log.info("Application starting");
        log.info(`Discovered ${String(allDefinitions.length)} connectors`);
        if (seededPlugins.length > 0) {
            log.info(`Auto-seeded ${String(seededPlugins.length)} connectors`);
        }

        // 全局连接池：每 origin 连接上限 + keepAlive 复用，消除并发 TLS 握手风暴
        init_global_network();

        // CSP programmatically. dev 放开 'unsafe-inline' 让 @vitejs/plugin-react 的
        // React Refresh preamble（inline <script>）能注入；prod 保持最严格 'self'。
        // 实现见 src/main/security/csp.ts（纯函数 + 单测，防回退）。
        const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
        const devOrigin = devServerUrl ? new URL(devServerUrl).origin : null;
        const devHost = devServerUrl ? new URL(devServerUrl).host : null;
        const csp_header = build_csp_header(devOrigin, devHost);
        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    "Content-Security-Policy": [csp_header],
                },
            });
        });

        const runtimeStore = createRuntimeStore(get_snapshot_cache_path());
        await runtimeStore.hydrateFromCache();
        const vault = await create_file_vault_backend(dataRoot);
        const secretsStore = createSecretsStore(vault);
        const observationStore = create_observation_store(get_observations_db_path());

        // CLI `--config <path>` 启动导入（t275）：需 definitions（secret 参数键）与
        // vault（secret 转存）就绪后执行。覆盖写入 config.json 并返回剥离后的配置，
        // 后续 build_secret_param_keys / orchestrator 用导入结果。
        if (cliMode && cli_args.command?.type === "serve" && cli_args.command.options.configPath) {
            currentConfig = await import_config_file(
                {
                    configPath,
                    configStore,
                    secretsStore,
                    definitions: allDefinitions,
                    vaultSnapshotPath: join(dataRoot, "secrets.vault.import.bak"),
                },
                cli_args.command.options.configPath,
            );
        }

        // Resolve system proxy for OAuth and connector HTTP requests.
        // If the user hasn't configured a proxy in settings, fall back to the
        // system proxy (e.g., Windows Internet Settings proxy at 127.0.0.1:7890).
        // Re-run on every config save so toggling a system proxy (Clash on/off)
        // takes effect without an app restart (D12).
        const detect_system_proxy = async (): Promise<string | undefined> => {
            try {
                const proxyInfo = await session.defaultSession.resolveProxy("https://auth.x.ai");
                const match = /PROXY\s+([^\s;]+)/.exec(proxyInfo);
                if (match?.[1]) {
                    const proxy = `http://${match[1]}`;
                    log.info(`Detected system proxy: ${proxy}`);
                    return proxy;
                }
            } catch {
                // resolveProxy not available or failed — continue without proxy
            }
            return undefined;
        };
        let detected_system_proxy = await detect_system_proxy();
        let currentConfigSnapshot = currentConfig;

        const login_item_api: LoginItemApi | undefined =
            typeof app.getLoginItemSettings === "function" &&
            typeof app.setLoginItemSettings === "function"
                ? {
                      getLoginItemSettings: () => app.getLoginItemSettings(),
                      setLoginItemSettings: (settings) => {
                          app.setLoginItemSettings(settings);
                      },
                  }
                : undefined;

        const secretParamKeys = build_secret_param_keys(currentConfig, allDefinitions);

        nativeTheme.themeSource = currentConfig.theme ?? "system";

        // Grok OAuth manager — device-code login + scheduled token refresh.
        // Read the current config for every request so proxy changes apply immediately.
        const grokOAuthManager = create_grok_oauth_manager({
            vault,
            get_proxy_url: () =>
                resolve_effective_proxy_url(
                    currentConfigSnapshot.proxy?.url,
                    detected_system_proxy,
                ),
        });

        // Kimi OAuth manager — mirrors Grok; device-code login + refresh.
        const kimiOAuthManager = create_kimi_oauth_manager({
            vault,
            get_proxy_url: () =>
                resolve_effective_proxy_url(
                    currentConfigSnapshot.proxy?.url,
                    detected_system_proxy,
                ),
        });

        // Grok Bot OAuth manager — browser PKCE login + token refresh.
        const grokBotOAuthManager = create_grok_bot_oauth_manager({
            vault,
            get_proxy_url: () =>
                resolve_effective_proxy_url(
                    currentConfigSnapshot.proxy?.url,
                    detected_system_proxy,
                ),
        });

        const refreshService = createRefreshService({
            definitions: allDefinitions,
            observationStore,
            runtimeStore,
            configStore,
            vault,
            resolve_proxy_url: (config) =>
                resolve_effective_proxy_url(config.proxy?.url, detected_system_proxy),
            sessionLogin: async (instanceId: string) => {
                // Try silent refresh first (no window popup).
                // trySilentCookieRefresh 内部从 definitions + config 查 provider 与 cookieNames。
                const silent = await trySilentCookieRefresh(
                    {
                        configStore,
                        secretsStore,
                        definitions: allDefinitions,
                        sessionManager,
                        // kimi_web 的续期请求与 connector 走同一代理策略，避免代理用户
                        // 下静默续期直连外网失败（t492 code review f002）。
                        get_proxy_url: () =>
                            resolve_effective_proxy_url(
                                currentConfigSnapshot.proxy?.url,
                                detected_system_proxy,
                            ),
                    },
                    instanceId,
                );
                if (silent.refreshed && silent.credential_changed) {
                    // t492/t504: 只有凭据真的变了才算重登成功——否则刷新服务会用同一份
                    // 失效凭据重试。未换到新凭据时回退到后台自动重登窗口。
                    return { saved: true, credential_changed: true };
                }
                // Fall back to auto login window (hidden in auto mode)
                const result = await handleCookieLogin(
                    { configStore, secretsStore, definitions: allDefinitions, sessionManager },
                    instanceId,
                    { auto: true },
                );
                if (!result.ok) throw new Error(result.error.message);
                // 交互式登录拿到的是全新凭据，视为已更换。
                return { saved: result.data.saved, credential_changed: result.data.saved };
            },
            oauth_refresh: async (instanceId: string, definition: ConnectorDefinition) => {
                // t172: OAuth(poll) 连接器 401/403 时的即时 token 刷新。manager 自带
                // per-instance 刷新去重与 token mutation 串行化；非 grok/kimi 的
                // oauth_device 连接器无内置刷新器，返回 undefined 走退化路径。
                if (definition.manifest.provider === "grok") {
                    return grokOAuthManager.refresh_now(instanceId);
                }
                if (definition.manifest.provider === "kimi") {
                    return kimiOAuthManager.refresh_now(instanceId);
                }
                if (definition.manifest.provider === "grok_bot") {
                    const res = await grokBotOAuthManager.refresh_now(instanceId);
                    return res.ok
                        ? { success: true }
                        : { success: false, error: res.error ?? "unknown error" };
                }
                return undefined;
            },
        });

        // Scheduler orchestrator — centralises scheduling, suspend/resume, shutdown
        const scheduler = createConnectorScheduler({
            refresh: (instanceId: string) => refreshService.refresh(instanceId),
        });
        const orchestrator = createSchedulerOrchestrator({ scheduler, configStore });

        const apply_configured_launch_at_login = (enabled: boolean): LaunchAtLoginState => {
            const state = apply_launch_at_login(login_item_api, enabled);
            if (!state.available) {
                log.info("Launch at login is unavailable on this platform");
            }
            return state;
        };

        // Config is the single source of truth: reconcile the OS login item in
        // both directions on every real application start.
        apply_configured_launch_at_login(currentConfig.launchAtLogin);
        // p254: 启动期按配置显隐 Dock 图标（即时生效，无需重启）。
        apply_dock_visibility(currentConfig.hideDockIcon ?? false);

        function noop_send_tray_state(): void {
            // The tray window is created after the LocalAPI and orchestrator.
        }

        let send_tray_state: () => void = noop_send_tray_state;

        async function set_launch_at_login_from_control(
            enabled: boolean,
        ): Promise<LaunchAtLoginState> {
            const current = read_launch_at_login(login_item_api);
            if (!current.available) return current;
            if (currentConfigSnapshot.launchAtLogin === enabled) {
                return apply_configured_launch_at_login(enabled);
            }
            const updated = { ...currentConfigSnapshot, launchAtLogin: enabled };
            await configStore.save(updated);
            onConfigSaved(updated);
            return read_launch_at_login(login_item_api);
        }

        let main_panel_controller: MainPanelController | null = null;
        let tray_ref: Tray | null = null;

        // Token stats: store + manager (subprocess-based collection) + isolated
        // read-only dashboard query worker (t193).
        const tokenStatsStore = create_token_stats_store(get_token_stats_db_path());
        const tokenStatsQueryDispatcher = create_token_stats_query_dispatcher({
            db_path: get_token_stats_db_path(),
        });
        const tokenStatsManager = create_token_stats_manager({
            store: tokenStatsStore,
            on_update: () => {
                // Broadcast to all windows that token stats were updated,
                // carrying the committed data version (t192).
                const data_version = tokenStatsStore.get_data_version();
                BrowserWindow.getAllWindows().forEach((win) => {
                    if (!win.isDestroyed()) {
                        win.webContents.send(IPC_CHANNELS.TOKEN_STATS_UPDATED, data_version);
                    }
                });
            },
        });
        tokenStatsManager.start(build_token_stats_config(currentConfigSnapshot));
        const dev_panel_manager = create_dev_panel_scan_manager();
        const dev_panel_model_routing = create_dev_panel_model_routing_manager({
            snapshot_path: join(getDataRoot(), "dev-panel-model-routing.snapshot.json"),
        });

        // Register IPC handlers
        await registerConnectorIpc({
            configStore,
            runtimeStore,
            refreshService,
            definitions: allDefinitions,
        });
        registerTokenStatsIpc(ipcMain, {
            store: tokenStatsStore,
            manager: tokenStatsManager,
            dispatcher: tokenStatsQueryDispatcher,
        });
        // t251: 会话/代理面板窗口 bounds 保存与恢复（复用设置窗口先例）。
        // createWindowFor 后应用保存的 bounds + 注册 move/resize 保存。
        const create_panel_window = (
            key: "agent" | "session" | "dev",
            route_query?: Record<string, string>,
        ) => {
            const bounds_key =
                key === "agent"
                    ? "agentWindowBounds"
                    : key === "session"
                      ? "historyWindowBounds"
                      : "devPanelWindowBounds";
            const win = windowManager.createWindowFor(key, route_query ? { route_query } : {});
            const saved = get_saved_bounds(currentConfigSnapshot, bounds_key);
            if (!apply_window_bounds(win, saved)) {
                // 无保存值或钳制异常：按配置默认尺寸居中（对齐 apply_settings_bounds 无值语义）。
                win.center();
            }
            watch_window_bounds(win, bounds_key, (k, value) => {
                currentConfigSnapshot = {
                    ...currentConfigSnapshot,
                    [k]: value,
                };
                // Thunk 防 renderer 保存无关键时快照回退（对齐 settings 先例）。
                configStore.scheduleSave(() => currentConfigSnapshot);
            });
            return win;
        };
        // t210: 会话历史订阅服务 + 历史窗口 singleton controller。
        // watcher 触发时由 session-history-ipc 按订阅方窗口推送（t219）；
        // 订阅方窗口关闭时经 SUBSCRIBE 挂的 destroyed 清理各自注销，不在此全局清空。
        const session_history_service = new SessionHistorySubscriptionService();
        const history_window_controller = create_history_window_controller({
            create_window: (loc) => {
                // 首次创建时经 URL query 传初始定位参数，renderer 启动同步读（见
                // spec 上下文区已核实契约；window 已存在时走 send_focus，不重复传）。
                return create_panel_window(
                    "session",
                    loc ? { loc: JSON.stringify(loc) } : undefined,
                );
            },
        });
        // 会话历史 IPC 通道组。sessions_provider 把 token-stats store 的
        // query_sessions 结果映射为 SessionRow（服务层不依赖 store 类型）。
        // t259: 与 web local-api 会话历史端点共享同一 provider/locator，保证同源。
        // t310: locator 路径输入与 t308 路径层对齐——host 从 process.platform 推导，
        // homedir 供 linux/mac 源，win_home 供 Windows 宿主 win 源，
        // win_home_wsl 供 Linux 宿主 win 源（t438）；
        // wsl_* 显式值优先，空串由 locator 自动探测。
        // t438: linux 宿主上 win 源经 win_home_wsl（/mnt/c/Users 自动发现）解析；
        // 传 null 由 locator 在 resolve 时惰性发现（review f001：一次性注入覆盖不了
        // 直接调 resolve_session_file 的路径）；发现失败 → win 会话不可达（零配置）。
        const session_history_host = host_from_platform(process.platform);
        const session_history_locator_paths = {
            host: session_history_host,
            homedir: homedir(),
            win_home: homedir(),
            win_home_wsl: null,
            wsl_distro: currentConfigSnapshot.tokenStats?.wslDistro ?? "Ubuntu-22.04",
            wsl_user: currentConfigSnapshot.tokenStats?.wslUser ?? "",
        };
        const session_history_sessions_provider: SessionsProvider = (
            filters_or_source: SessionQueryFilters | string,
            env?: Env,
        ) => {
            const filters: TokenStatsSessionFilters =
                typeof filters_or_source === "string"
                    ? { source: filters_or_source, ...(env ? { env } : {}) }
                    : ({
                          ...filters_or_source,
                          ...(filters_or_source.sources
                              ? { sources: [...filters_or_source.sources] }
                              : {}),
                      } as TokenStatsSessionFilters);
            return tokenStatsStore.query_sessions(filters).map((s) => ({
                id: s.id,
                source: s.source,
                // t310: session-history Env 已与 token-stats 对齐为 win|wsl|linux|mac，直接透传。
                env: s.env,
                title: s.title,
                model: s.model,
                started_at: s.started_at,
                ended_at: s.ended_at,
                session: s,
            }));
        };
        registerSessionHistoryIpc(ipcMain, {
            service: session_history_service,
            // WSL 配置与 token-stats collector 同源：显式值优先，空串由 locator 自动探测。
            locator_paths: session_history_locator_paths,
            sessions_provider: session_history_sessions_provider,
        });
        ipcMain.handle(
            IPC_CHANNELS.SESSION_HISTORY_OPEN,
            (_event, source: string, env: string, session_id: string) => {
                // 幂等（AC）：已开则聚焦并定位，未开则创建并带初始定位参数。
                // t212：纯跳转入口（无具体会话）传空 source，只开/聚焦空窗。
                const loc = source ? { source, env: env as Env, session_id } : undefined;
                history_window_controller.open_or_focus(loc);
            },
        );
        registerTrendIpc(ipcMain, { store: observationStore });
        const onConfigSaved = (updatedConfig: AppConfiguration): void => {
            const previousConfig = currentConfigSnapshot;
            currentConfigSnapshot = updatedConfig;
            if (previousConfig.theme !== updatedConfig.theme) {
                sync_native_theme(updatedConfig.theme);
            }
            if (previousConfig.launchAtLogin !== updatedConfig.launchAtLogin) {
                apply_configured_launch_at_login(updatedConfig.launchAtLogin);
            }
            // p254: Dock 显隐即时生效。
            if ((previousConfig.hideDockIcon ?? false) !== (updatedConfig.hideDockIcon ?? false)) {
                apply_dock_visibility(updatedConfig.hideDockIcon ?? false);
            }
            setLogLevel(updatedConfig.logLevel ?? defaultLogLevelForEnv());
            log.info("Config saved — reconciling scheduler and secret keys");
            const newKeys = build_secret_param_keys(updatedConfig, allDefinitions);
            secretParamKeys.clear();
            for (const [k, v] of newKeys) {
                secretParamKeys.set(k, v);
            }
            orchestrator.reconcile(
                to_connector_list_config(previousConfig),
                to_connector_list_config(updatedConfig),
            );
            const active_grok_instance_ids = active_instance_ids_for_provider(
                allDefinitions,
                updatedConfig.plugins,
                "grok",
            );
            grokOAuthManager.reconcile_auto_refresh(active_grok_instance_ids);
            const active_kimi_instance_ids = active_instance_ids_for_provider(
                allDefinitions,
                updatedConfig.plugins,
                "kimi",
            );
            kimiOAuthManager.reconcile_auto_refresh(active_kimi_instance_ids);
            // Update token stats config if changed
            tokenStatsManager.update_config(build_token_stats_config(updatedConfig));
            // t195 AC5: 代理探测只在代理相关字段变化时触发，纯 UI 偏好保存
            // 不再触发 resolveProxy 网络调用。
            if (proxy_config_changed(previousConfig.proxy, updatedConfig.proxy)) {
                void detect_system_proxy().then((proxy) => {
                    detected_system_proxy = proxy;
                });
            }
            for (const win of BrowserWindow.getAllWindows()) {
                if (!win.isDestroyed()) {
                    win.webContents.send(IPC_CHANNELS.CONFIG_CHANGED, updatedConfig);
                }
            }
            local_api?.publish_config_change(updatedConfig);
            main_panel_controller?.apply_config_change();
            send_tray_state();
        };
        const onConfigImported = createOnConfigImported(refreshService, log);

        await registerConfigIpc({
            configStore,
            secretsStore,
            secretParamKeys,
            onConfigSaved,
            onConfigImported,
            definitions: allDefinitions,
            configPath,
            vaultSnapshotPath: join(dataRoot, "secrets.vault.import.bak"),
            appVersion: app.getVersion(),
        });

        // Session manager — controlled login window + credential capture
        const sessionManager = create_session_manager({
            vault,
            has_display: () =>
                process.platform !== "linux" ||
                Boolean(process.env["DISPLAY"] ?? process.env["WAYLAND_DISPLAY"]),
            // t337/t506: 捕获 cookie 后有效性探测——优先探测 /console/api/orgs，回退探测 login_url。
            verify_cookie: async (cookie: string, login_url: string) => {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => {
                        controller.abort();
                    }, 10_000);
                    try {
                        const origin = new URL(login_url).origin;
                        const orgs_url = `${origin}/console/api/orgs`;
                        const res = await fetch(orgs_url, {
                            headers: {
                                Cookie: cookie,
                                "User-Agent":
                                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                                    "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
                                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                            },
                            redirect: "manual",
                            signal: controller.signal,
                        });
                        if (res.status === 200) {
                            const data: unknown = await res.json().catch(() => null);
                            if (Array.isArray(data) && data.length > 0) return true;
                        }

                        const fallback_res = await fetch(login_url, {
                            headers: {
                                Cookie: cookie,
                                "User-Agent":
                                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                                    "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
                                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                            },
                            redirect: "manual",
                            signal: controller.signal,
                        });
                        return is_valid_opencode_login(
                            fallback_res.status,
                            fallback_res.headers.get("location"),
                        );
                    } finally {
                        clearTimeout(timer);
                    }
                } catch {
                    return false;
                }
            },
            create_window: (partition, options) => {
                // p240: 自动重登用隐藏窗——页面照常发请求（关掉后台节流，否则 Chromium
                // 会推迟 SPA 的令牌刷新），但不闪屏。
                const hidden = options?.hidden === true;
                const window = new BrowserWindow({
                    width: 520,
                    height: 720,
                    // t280: headless 下登录窗不弹屏。
                    show: !is_e2e_headless() && !hidden,
                    webPreferences: {
                        contextIsolation: true,
                        nodeIntegration: false,
                        sandbox: true,
                        partition,
                        ...(hidden ? { backgroundThrottling: false } : {}),
                    },
                });
                return Object.assign(window, {
                    // t492: kimi_web 的 refresh token 只在页面 localStorage，主进程在
                    // sandbox + contextIsolation 下仍可 executeJavaScript 读取。
                    read_local_storage: async (key: string): Promise<string | null> => {
                        if (window.isDestroyed()) return null;
                        const value: unknown = await window.webContents.executeJavaScript(
                            `window.localStorage.getItem(${JSON.stringify(key)})`,
                        );
                        return typeof value === "string" ? value : null;
                    },
                });
            },
            create_session: (partition) => {
                const ses = session.fromPartition(partition);
                return {
                    on_before_send_headers(handler) {
                        ses.webRequest.onBeforeSendHeaders((details, callback) => {
                            handler({
                                url: details.url,
                                requestHeaders: details.requestHeaders,
                                resource_type: details.resourceType,
                            });
                            callback({ requestHeaders: details.requestHeaders });
                        });
                    },
                    async get_cookies(url: string) {
                        const cookies = await ses.cookies.get({ url });
                        return cookies.map((c) => ({ name: c.name, value: c.value }));
                    },
                };
            },
        });

        // Local HTTP API: serves the web panel UI + observation ingest.
        // dev：__dirname = out/main，web 产物在 out/web（electron-vite build 输出）。
        // 不能用 app.getAppPath()——以 `out/main/index.js` 文件参数启动时返回
        // out/main，web_root 会错指到 out/main/out/web（不存在，静态服务 401）。
        const web_root_path = app.isPackaged
            ? join(process.resourcesPath, "web")
            : resolve(__dirname, "..", "web");
        local_api = create_local_api_server(observationStore, {
            token_stats_store: tokenStatsStore,
            token_stats_running: () => tokenStatsManager.is_running(),
            token_stats_query_dispatcher: tokenStatsQueryDispatcher,
            dev_panel_deps: { manager: dev_panel_manager, model_routing: dev_panel_model_routing },
            token_stats_force_collect: () => {
                tokenStatsManager.force_collect();
            },
            theme_set: sync_native_theme,
            // serve --port 覆盖监听端口，优先级高于 OMNI_PANEL_PORT。
            ...(cliMode &&
            cli_args.command?.type === "serve" &&
            cli_args.command.options.port !== undefined
                ? { port: cli_args.command.options.port }
                : {}),
            config_deps: {
                configStore,
                secretsStore,
                secretParamKeys,
                onConfigSaved,
                onConfigImported,
                definitions: allDefinitions,
                configPath,
                vaultSnapshotPath: join(dataRoot, "secrets.vault.import.bak"),
                appVersion: app.getVersion(),
            },
            auth_deps: {
                cookie: {
                    configStore,
                    secretsStore,
                    definitions: allDefinitions,
                    sessionManager,
                },
                session: { sessionManager },
                grok: { manager: grokOAuthManager },
                kimi: { manager: kimiOAuthManager },
            },
            // t276: 控制端点复用 tray 纯 main 动作（refreshService / orchestrator / app）。
            control_deps: {
                refresh_all: () => {
                    void refreshService.refreshAll().catch((err: unknown) => {
                        log.error(
                            `[control] refresh-all failed: ${
                                err instanceof Error ? err.message : String(err)
                            }`,
                        );
                    });
                },
                pause: () => {
                    orchestrator.suspend("user");
                },
                resume: () => {
                    orchestrator.resume("user");
                },
                restart: () => {
                    app.relaunch();
                    app.quit();
                },
                quit: () => {
                    app.quit();
                },
                autostart: () =>
                    set_launch_at_login_from_control(!currentConfigSnapshot.launchAtLogin),
                get_state: () => ({
                    pause: orchestrator.get_pause_state(),
                    autostart: read_launch_at_login(login_item_api),
                }),
            },
            connector_deps: {
                configStore,
                runtimeStore,
                refreshService,
                definitions: allDefinitions,
            },
            user_data_path: dataRoot,
            session_history_deps: {
                service: session_history_service,
                sessions_provider: session_history_sessions_provider,
                locator_paths: session_history_locator_paths,
            },
            ...(existsSync(web_root_path) ? { web_root: web_root_path } : {}),
        });
        orchestrator.on_pause_state((pause) => {
            send_tray_state();
            local_api?.publish_control_state({
                pause,
                autostart: read_launch_at_login(login_item_api),
            });
        });
        await local_api.start();
        log.info(`Web panel: http://localhost:${String(local_api.get_port())}/v1/health`);
        // t275 AC2：CLI 模式启动成功后 stdout 打印面板地址。
        const panel_url = `http://localhost:${String(local_api.get_port())}/`;
        if (cliMode) {
            process.stdout.write(`OmniPanel CLI mode listening on ${panel_url}\n`);
        }
        // t275 AC2 / t459：GUI 与 serve 均在 LocalAPI 成功监听后写 cli.json（同路径
        // 同字段集，port/url 用实际监听端口），供外部瘦客户端发现运行中实例。cli.json
        // 是辅助产物，写失败只降级 warn，不阻断已成功启动的服务。启动时重写；退出后
        // 文件保留（端口即失效），瘦客户端以连接失败判断实例未运行。
        await write_cli_json(dataRoot, {
            port: local_api.get_port(),
            url: panel_url,
            userData: dataRoot,
        }).catch((err: unknown) => {
            log.warn(
                `Failed to write cli.json (instance discovery disabled): ${
                    err instanceof Error ? err.message : String(err)
                }`,
            );
        });
        await registerLogIpc(dataRoot);
        registerBuildInfoIpc(() => app.getVersion());
        cleanupEventIpc = registerEventIpc({
            runtimeStore,
            onThemeChanged: (is_dark) => local_api?.publish_theme_change(is_dark),
        });
        registerGrokAuthIpc({ manager: grokOAuthManager });
        registerKimiAuthIpc({ manager: kimiOAuthManager });
        registerGrokBotAuthIpc({ manager: grokBotOAuthManager });

        await registerSessionIpc({ sessionManager });
        registerAuthIpc({
            configStore,
            secretsStore,
            definitions: allDefinitions,
            sessionManager,
        });

        // Window references — shared between tray and E2E mode
        /** Custom tray menu frameless window (replaces native context menu). */
        let trayMenuWin: BrowserWindow | null = null;

        // Settings window singleton
        let settingsWin: BrowserWindow | null = null;
        // True once shutdown begins: settings then destroys instead of hiding.
        let quitting = false;
        // t343: observation 留存定时器（app ready 后启动，before-quit 清理）。
        let retention_scheduler: RetentionScheduler | null = null;
        // Whether saved bounds have been applied since the settings window was
        // (re)created. Apply only on first show, then keep user moves across reopens.
        let settings_bounds_applied = false;

        function save_settings_bounds(): void {
            if (!settingsWin || settingsWin.isDestroyed()) return;
            if (settingsWin.isMinimized() || settingsWin.isMaximized()) return;
            const bounds = settingsWin.getBounds();
            const display = screen.getDisplayMatching(bounds);
            const display_id = String(display.id);
            const saved = {
                x: bounds.x,
                y: bounds.y,
                width: Math.max(480, bounds.width),
                height: Math.max(360, bounds.height),
            };
            currentConfigSnapshot = {
                ...currentConfigSnapshot,
                settingsBounds: { ...saved, displayId: display_id },
            };
            // Thunk, not a value: the debounce may fire after the renderer saved
            // unrelated keys, and a snapshot captured here would revert them.
            configStore.scheduleSave(() => currentConfigSnapshot);
        }

        function apply_settings_bounds(win: BrowserWindow): void {
            const saved = currentConfigSnapshot.settingsBounds;
            if (!saved) {
                win.center();
                return;
            }
            const displays = screen.getAllDisplays();
            const preferred = screen.getPrimaryDisplay();
            const target_display = saved.displayId
                ? (displays.find((d) => String(d.id) === saved.displayId) ?? preferred)
                : preferred;
            const work = target_display.workArea;
            const width = Math.min(Math.max(480, saved.width), work.width);
            const height = Math.min(Math.max(360, saved.height), work.height);
            const x = Math.max(work.x, Math.min(saved.x, work.x + work.width - width));
            const y = Math.max(work.y, Math.min(saved.y, work.y + work.height - height));
            win.setBounds({ x, y, width, height });
        }

        // Create the hidden, pre-loaded settings window (idempotent). Kept alive
        // for the session so reopening just reveals an already-painted dark window
        // and skips the fresh-window show animation that flashes white on Windows.
        function ensure_settings_window(): void {
            if (settingsWin && !settingsWin.isDestroyed()) return;
            // load:false -> createWindowFor neither loads nor wires ready-to-show,
            // so the window stays hidden (show:false) while we pre-load it below.
            settingsWin = windowManager.createWindowFor("setting", { load: false });
            void settingsWin
                .loadURL(windowManager.getRendererUrl("setting"))
                .catch((err: unknown) => {
                    log.error(
                        `settings loadURL failed: ${err instanceof Error ? err.message : String(err)}`,
                    );
                });
            settingsWin.on("resize", save_settings_bounds);
            settingsWin.on("move", save_settings_bounds);
            // Hide instead of destroy on close (unless quitting) so the window
            // persists across opens.
            settingsWin.on("close", (event) => {
                if (decide_settings_close(quitting) === "hide") {
                    event.preventDefault();
                    settingsWin?.hide();
                }
            });
            settings_bounds_applied = false;
        }

        function createOrFocusSettings(): { created: boolean } {
            ensure_settings_window();
            const win = settingsWin;
            if (!win || win.isDestroyed()) return { created: false };
            if (!settings_bounds_applied) {
                apply_settings_bounds(win);
                settings_bounds_applied = true;
            }
            // t280: headless 下 settings 打开不弹屏。
            if (!is_e2e_headless()) win.show();
            win.focus();
            clear_dock_badge();
            return { created: true };
        }

        // Register IPC handler for opening settings from renderer
        ipcMain.handle(
            IPC_CHANNELS.SETTINGS_OPEN,
            (_event, context?: { instanceId?: string; provider?: string; accountId?: string }) => {
                createOrFocusSettings();
                if (!context || !settingsWin || settingsWin.isDestroyed()) return;
                const win = settingsWin;
                const wc = win.webContents;
                const send_navigate = () => {
                    if (!win.isDestroyed()) wc.send(IPC_CHANNELS.SETTINGS_NAVIGATE, context);
                };
                // The window may be pre-warmed (already loaded) or freshly created
                // (still loading). Send once it's ready either way.
                if (wc.isLoading()) {
                    // t368 AC-002: did-fail-load 时清缓冲（不再永久等待 did-finish-load），
                    // 并重建预热窗口供下次打开。
                    let settled = false;
                    const settle = () => {
                        if (settled) return;
                        settled = true;
                        wc.removeListener("did-fail-load", fail);
                    };
                    const fail = () => {
                        settle();
                        if (settingsWin && !settingsWin.isDestroyed()) {
                            settingsWin.destroy();
                            settingsWin = null;
                        }
                    };
                    wc.once("did-finish-load", () => {
                        settle();
                        send_navigate();
                    });
                    wc.once("did-fail-load", fail);
                } else {
                    send_navigate();
                }
            },
        );

        // t252: 通用窗口控制——按 event.sender（发起 IPC 的 webContents）路由到所属窗口。
        // 四面板自绘控制区复用（settings 专用 SETTINGS_MINIMIZE/MAXIMIZE/CLOSE 已删除）。
        const window_from_sender = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null => {
            const win = BrowserWindow.fromWebContents(event.sender);
            return win && !win.isDestroyed() ? win : null;
        };
        ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
            window_from_sender(event)?.minimize();
        });
        ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, (event) => {
            const win = window_from_sender(event);
            if (!win) return;
            if (win.isMaximized()) {
                win.unmaximize();
            } else {
                win.maximize();
            }
        });
        ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
            window_from_sender(event)?.close();
        });

        ipcMain.handle(IPC_CHANNELS.MAIN_PANEL_HIDE, () => {
            main_panel_controller?.hide();
        });
        ipcMain.handle(
            IPC_CHANNELS.MAIN_PANEL_GET_MODE,
            () => main_panel_controller?.get_mode() ?? "popup",
        );

        const main_panel_platform =
            process.platform === "darwin"
                ? "darwin"
                : process.platform === "win32"
                  ? "win32"
                  : "linux";

        main_panel_controller = create_main_panel_controller({
            platform: main_panel_platform,
            get_config: () => currentConfigSnapshot,
            save_config: (next) => {
                currentConfigSnapshot = next;
                // Thunk, not a value: the debounce may fire after the renderer
                // saved unrelated keys (card order, expansion), and a snapshot
                // captured here would revert them.
                configStore.scheduleSave(() => currentConfigSnapshot);
            },
            create_window: () => windowManager.createWindowFor("usage", { load: false }),
            get_renderer_url: (route: string) => windowManager.getRendererUrl(route),
            get_preload_path: getPreloadPath,
            get_app_icon_path,
            get_tray_bounds: () => tray_ref?.getBounds() ?? null,
            get_display_for_bounds: (bounds) => screen.getDisplayMatching(bounds),
            get_all_displays: () => screen.getAllDisplays(),
            get_primary_display: () => screen.getPrimaryDisplay(),
            on_show: () => {
                clear_dock_badge();
            },
        });

        // t493 AC-004: 安装 macOS 应用菜单（⌘W/⌘M/⌃⌘F/⌘H/⌘Q）
        setup_application_menu({
            platform: process.platform,
            is_usage_window: (win) => {
                const usage_win = main_panel_controller?.get_window();
                return usage_win != null && (usage_win as unknown as BrowserWindow) === win;
            },
            hide_usage_panel: () => {
                main_panel_controller?.hide();
            },
        });

        // Agent (token-stats) window singleton: tokenStats.open() reuses an
        // existing window instead of stacking multiple agent BrowserWindows.
        const agent_window_controller = create_agent_window_controller({
            create_window: () => create_panel_window("agent"),
        });
        const dev_panel_window_controller = create_agent_window_controller({
            create_window: () => create_panel_window("dev"),
        });
        registerDevPanelIpc(ipcMain, {
            manager: dev_panel_manager,
            model_routing: dev_panel_model_routing,
            open: () => dev_panel_window_controller.open_or_focus(),
        });

        cleanupPopupIpc = registerPopupIpc({
            report_content_height: (report) =>
                main_panel_controller?.report_content_height(report) ?? null,
        });

        // Open main panel BEFORE pre-warming settings so popup is the first window.
        // This matters for Playwright E2E tests which expect firstWindow() = popup.
        // t275：CLI 模式跳过全部窗口创建（主面板/设置预热），仅起服务。
        if (!cliMode) {
            main_panel_controller.open_or_focus();
        }

        // Pre-warm the settings window (hidden + loaded) so opening it later just
        // reveals an already-painted dark window, avoiding the fresh-window show
        // animation that flashes white on Windows.
        // Skip in E2E mode — tests expect settings.open() to emit a "window" event.
        if (!cliMode && process.env["E2E"] !== "1") {
            ensure_settings_window();
        }

        // Hydrate runtime store from observation history for manualRefreshOnly connectors
        hydrate_runtime_store({
            runtimeStore,
            observationStore,
            connectorConfigs: currentConfig.plugins,
            definitions: allDefinitions,
        });

        // Start periodic refresh for enabled plugins
        orchestrator.startAll(to_connector_list_config(currentConfig));

        // t343: observation 留存策略接入——启动即清理一次，之后每 24h 定时。
        // cacheMaxMb 经 get_cache_max_mb 动态读取 currentConfigSnapshot，
        // 运行时改设置立即生效；before-quit stop 清理定时器。
        retention_scheduler = create_retention_scheduler({
            prune: (older_than_ms) => observationStore.prune(older_than_ms),
            count_observations: () => observationStore.count_observations(),
            get_cache_max_mb: () => currentConfigSnapshot.cacheMaxMb,
            now: () => Date.now(),
        });
        retention_scheduler.start();

        // Start OAuth auto-refresh for enabled grok connector instances. The manager
        // gracefully skips instances without stored tokens.
        {
            const active_grok_instance_ids = active_instance_ids_for_provider(
                allDefinitions,
                currentConfig.plugins,
                "grok",
            );
            grokOAuthManager.reconcile_auto_refresh(active_grok_instance_ids);
        }
        // Kimi mirrors grok: start auto-refresh for enabled kimi instances on launch.
        {
            const active_kimi_instance_ids = active_instance_ids_for_provider(
                allDefinitions,
                currentConfig.plugins,
                "kimi",
            );
            kimiOAuthManager.reconcile_auto_refresh(active_kimi_instance_ids);
        }

        // Sleep/wake handling
        powerMonitor.on("suspend", () => {
            log.info("System suspending — stopping all schedulers");
            orchestrator.suspend("system");
        });

        powerMonitor.on("resume", () => {
            log.info("System resumed — restarting schedulers");
            orchestrator.resume("system");
        });

        // System tray — skip in CLI and E2E modes unless E2E_WITH_TRAY=1
        if (!cliMode && (process.env["E2E"] !== "1" || process.env["E2E_WITH_TRAY"] === "1")) {
            const trayIcon = nativeImage.createFromPath(get_tray_icon_path());
            if (trayIcon.isEmpty()) {
                log.warn("Tray icon loaded as empty image");
            }
            if (process.platform === "darwin") {
                trayIcon.setTemplateImage(true);
            }
            const tray = new Tray(trayIcon);
            tray_ref = tray;
            tray.setToolTip("OmniPanel — AI 用量监控");
            log.info("System tray created");
            if (process.env["E2E"] === "1") {
                // Expose tray click for E2E tests via IPC
                ipcMain.handle(IPC_CHANNELS.TEST_TRAY_CLICK, () => {
                    log.info("[E2E test] test:tray-click received, emitting tray click");
                    tray.emit("click");
                    log.info("[E2E test] tray click emitted");
                });
            }

            // Tray menu state is projected from the orchestrator/config single sources.
            const hasLoginItemApi = login_item_api !== undefined;

            // Custom tray menu window setup

            function hideTrayMenu(): void {
                if (!trayMenuWin || trayMenuWin.isDestroyed()) return;
                trayMenuWin.removeListener("blur", hideTrayMenu);
                trayMenuWin.hide();
                trayMenuWin.setSkipTaskbar(true);
            }

            // Create tray menu window once
            const trayMenuCfg = WINDOW_CONFIGS["tray_menu"];
            let tray_menu_size = {
                width: trayMenuCfg?.width ?? 184,
                height: trayMenuCfg?.height ?? 340,
            };
            trayMenuWin = new BrowserWindow({
                width: trayMenuCfg?.width ?? 184,
                height: trayMenuCfg?.height ?? 340,
                frame: false,
                transparent: true,
                skipTaskbar: true,
                alwaysOnTop: true,
                show: false,
                resizable: false,
                // t503 AC-002: macOS 下托盘菜单用 NSPanel + 跨全屏，随用量弹窗盖在
                // 全屏应用之上；Windows/Linux 保持普通窗口。
                ...(process.platform === "darwin"
                    ? { type: "panel", visibleOnFullScreen: true }
                    : {}),
                icon: get_app_icon_path(),
                webPreferences: {
                    ...SECURE_WEB_PREFS,
                    preload: getPreloadPath(),
                },
            });
            // t503 AC-002: 创建期声明跨空间可见（p253：右键菜单同样跟到当前 Space）。
            if (process.platform === "darwin") {
                trayMenuWin.setVisibleOnAllWorkspaces(true, {
                    visibleOnFullScreen: true,
                });
            }
            void trayMenuWin.loadURL(windowManager.getRendererUrl("tray")).catch((err: unknown) => {
                log.error(
                    `tray loadURL failed: ${err instanceof Error ? err.message : String(err)}`,
                );
            });

            // Forward pause/autostart state to tray menu renderer
            send_tray_state = (): void => {
                if (trayMenuWin && !trayMenuWin.isDestroyed()) {
                    try {
                        trayMenuWin.webContents.send(
                            IPC_CHANNELS.TRAY_PAUSE_STATE,
                            orchestrator.get_pause_state().paused,
                        );
                        trayMenuWin.webContents.send(
                            IPC_CHANNELS.TRAY_AUTOSTART_STATE,
                            hasLoginItemApi ? read_launch_at_login(login_item_api).enabled : false,
                        );
                    } catch {
                        // window may be destroyed mid-send
                    }
                }
            };
            trayMenuWin.webContents.on("did-finish-load", () => {
                send_tray_state();
            });
            trayMenuWin.on("closed", () => {
                trayMenuWin = null;
            });

            // Tray menu IPC handlers
            ipcMain.handle(IPC_CHANNELS.TRAY_OPEN_PANEL, () => {
                hideTrayMenu();
                tray.emit("click");
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_REFRESH_ALL, () => {
                void refreshService.refreshAll().catch((err: unknown) => {
                    log.error(
                        `tray refresh-all failed: ${err instanceof Error ? err.message : String(err)}`,
                    );
                });
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_TOGGLE_PAUSE, () => {
                if (!orchestrator.get_pause_state().paused) {
                    orchestrator.suspend("user");
                } else {
                    // resume() reloads config and startAll()s (which refreshes
                    // immediately). The previous rebuild()+startAll() here restarted
                    // every connector twice and desynced from the orchestrator's own
                    // suspend/resume generation — dropped.
                    orchestrator.resume("user");
                }
                send_tray_state();
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_TOGGLE_AUTOSTART, async () => {
                const state = await set_launch_at_login_from_control(
                    !currentConfigSnapshot.launchAtLogin,
                );
                send_tray_state();
                return state;
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_OPEN_SETTINGS, () => {
                hideTrayMenu();
                createOrFocusSettings();
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_OPEN_WEB, () => {
                if (!local_api) return;
                void shell.openExternal(`http://localhost:${String(local_api.get_port())}/`);
            });
            ipcMain.handle(IPC_CHANNELS.SETTINGS_OPEN_CONNECTORS_DIR, async () => {
                await open_connectors_dir({
                    dir: getUserConnectorsDir(),
                    mkdir: async (p) => {
                        await mkdir(p, { recursive: true });
                    },
                    open_path: (p) => shell.openPath(p),
                    log,
                });
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_CHECK_UPDATE, () => {
                log.info("Check for updates requested (not yet implemented)");
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_SURVEY, () => {
                log.info("Survey/feedback requested (not yet implemented)");
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_SPONSOR, () => {
                log.info("Sponsor/support author requested (not yet implemented)");
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_QUIT, () => {
                app.quit();
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_RESTART, () => {
                app.relaunch();
                app.quit();
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_HIDE, () => {
                hideTrayMenu();
            });
            ipcMain.handle(IPC_CHANNELS.TRAY_REPORT_MENU_SIZE, (_event, report: unknown) => {
                const parsed = parseSizeReport(report, ["width", "height"], 10000);
                if (!parsed) return;

                const width = parsed["width"];
                const height = parsed["height"];
                if (width === undefined || height === undefined) return;

                tray_menu_size = {
                    width: Math.max(1, Math.ceil(width)),
                    height: Math.max(1, Math.ceil(height)),
                };
                if (trayMenuWin && !trayMenuWin.isDestroyed() && trayMenuWin.isVisible()) {
                    const bounds = trayMenuWin.getBounds();
                    trayMenuWin.setBounds({ ...bounds, ...tray_menu_size });
                }
            });

            // Click → toggle main panel (left-click)
            tray.on("click", () => {
                if (trayMenuWin && !trayMenuWin.isDestroyed() && trayMenuWin.isVisible()) {
                    trayMenuWin.removeListener("blur", hideTrayMenu);
                    trayMenuWin.hide();
                }

                log.info("[tray] toggling main panel");
                main_panel_controller?.open_or_toggle();
            });

            // Right-click → show custom tray menu
            tray.on("right-click", () => {
                if (!trayMenuWin || trayMenuWin.isDestroyed()) return;
                // t503 AC-002: 二次右键收起（darwin 下 showInactive 无焦点、
                // 无 blur，此为主要收起路径；左键点击同样收起）。
                if (trayMenuWin.isVisible()) {
                    hideTrayMenu();
                    return;
                }

                // Copy the bounds - Electron doesn't guarantee getBounds() returns a
                // fresh object, so don't mutate the return value in place (A19).
                const trayBounds = { ...tray.getBounds() };
                // Tray.getBounds() returns zero on Windows; fall back to primary display center
                if (trayBounds.width <= 0 || trayBounds.height <= 0) {
                    const primary = screen.getPrimaryDisplay();
                    trayBounds.x = primary.workArea.x + primary.workArea.width / 2;
                    trayBounds.y = primary.workArea.y + primary.workArea.height / 2;
                    trayBounds.width = 0;
                    trayBounds.height = 0;
                }
                const display = screen.getDisplayNearestPoint({
                    x: trayBounds.x + trayBounds.width / 2,
                    y: trayBounds.y + trayBounds.height / 2,
                });
                const menuWidth = tray_menu_size.width;
                const menuHeight = tray_menu_size.height;

                const cx = Math.round(trayBounds.x + trayBounds.width / 2 - menuWidth / 2);
                const cy = trayBounds.y + trayBounds.height + 4;

                const clampedX = Math.max(
                    display.workArea.x,
                    Math.min(cx, display.workArea.x + display.workArea.width - menuWidth),
                );
                const clampedY =
                    cy + menuHeight > display.workArea.y + display.workArea.height
                        ? trayBounds.y - menuHeight - 4
                        : cy;

                trayMenuWin.setBounds({
                    x: clampedX,
                    y: clampedY,
                    width: menuWidth,
                    height: menuHeight,
                });
                send_tray_state();
                if (process.platform === "darwin") {
                    // t503 AC-002: 不激活应用，避免强切 Space；重申跨空间跟到当前 Space。
                    // p256 真解：非激活 NSPanel 上 focus() 只拿 key 不激活应用，
                    // 之后点任何外部（桌面/他应用/我方窗口）都失 key 走 blur 收起。
                    trayMenuWin.setVisibleOnAllWorkspaces(true, {
                        visibleOnFullScreen: true,
                    });
                    trayMenuWin.showInactive();
                    trayMenuWin.focus();
                } else {
                    trayMenuWin.show();
                    trayMenuWin.focus();
                }
                trayMenuWin.once("blur", hideTrayMenu);
            });

            // p256+p258 失活收起：
            // - 托盘菜单：我方任一其它窗口获焦即收。桌面空白/外部应用点击
            //   到不了本进程，仍靠再次点击托盘（见菜单内 tray-dismiss-hint）。
            // - 用量面板：仅 popup 模式 popover 语义自动收（floating 常驻；
            //   pinToTop 钉住豁免）。hide 经 restore_after_hide 恢复提权。
            app.on("browser-window-focus", (_event, focused) => {
                if (focused !== trayMenuWin) hideTrayMenu();
                const popup = main_panel_controller?.get_window() ?? null;
                if (
                    popup !== null &&
                    !popup.isDestroyed() &&
                    should_hide_popup_on_outside_focus({
                        mode: main_panel_controller?.get_mode() ?? "floating",
                        panel_visible: popup.isVisible(),
                        focused_is_panel: focused === popup,
                        pin_to_top: currentConfigSnapshot.pinToTop ?? false,
                    })
                ) {
                    main_panel_controller?.hide();
                }
            });
        } // end of E2E !== "1" tray block

        // Agent (token-stats) panel open is a window-level capability, not a
        // tray one. Registered outside the E2E-skipped tray block so the panel
        // stays reachable in test builds (E2E=1) too; the tray menu hides via
        // its own blur handler when a menu click leads here.
        ipcMain.handle(IPC_CHANNELS.TOKEN_STATS_OPEN, () => {
            agent_window_controller.open_or_focus();
        });

        app.on("before-quit", () => {
            log.info("Application shutting down");
            quitting = true;
            // t368 范围项 5: local_api/close_all_proxy 移入 will-quit Promise.all 等待
            // 完成，此处不再 fire-and-forget。
            tokenStatsQueryDispatcher.stop();
            // t368 AC-003: 退出时 stop collector 子进程（原缺失，重启后不全量重扫）。
            tokenStatsManager.stop();
            if (trayMenuWin && !trayMenuWin.isDestroyed()) {
                trayMenuWin.destroy();
                trayMenuWin = null;
            }
            if (settingsWin && !settingsWin.isDestroyed()) {
                settingsWin.destroy();
                settingsWin = null;
            }
            agent_window_controller.shutdown();
            dev_panel_manager.cancel();
            dev_panel_window_controller.shutdown();
            history_window_controller.shutdown();
            session_history_service.unsubscribe_all();
            main_panel_controller?.close_for_mode_switch();
            main_panel_controller = null;
            orchestrator.shutdown();
            grokOAuthManager.shutdown();
            kimiOAuthManager.shutdown();
            grokBotOAuthManager.shutdown();
            if (retention_scheduler !== null) {
                retention_scheduler.stop();
                retention_scheduler = null;
            }
            // t368 范围项 5: close_all_proxy/runtimeStore.flush 移入 will-quit await。
            flush_session_index(); // t264: 会话索引脏条目退出前落盘。
            cleanupEventIpc?.();
            cleanupEventIpc = null;
            cleanupPopupIpc?.();
            cleanupPopupIpc = null;
        });

        app.on("will-quit", (e) => {
            // t368 范围项 5: 收拢退出清理——local_api/close_all_proxy 从 before-quit
            // fire-and-forget 移入 Promise.all 等待完成，避免退出中断。
            const shutdown_tasks: Promise<unknown>[] = [
                runtimeStore.flushPendingCache(),
                local_api ? local_api.stop() : Promise.resolve(),
                close_all_proxy_agents(),
            ];
            if (configStore.hasPendingSave()) {
                shutdown_tasks.push(configStore.flushPendingSave());
            }
            if (!logging_cleanup_done) {
                shutdown_tasks.push(
                    cleanupLogging().then(() => {
                        logging_cleanup_done = true;
                    }),
                );
            }
            if (configStore.hasPendingSave() || !logging_cleanup_done) {
                e.preventDefault();
                void Promise.all(shutdown_tasks)
                    .catch((err: unknown) => {
                        log.error(
                            `shutdown flush failed: ${err instanceof Error ? err.message : String(err)}`,
                        );
                    })
                    .finally(() => {
                        app.quit();
                    });
            } else {
                void Promise.all(shutdown_tasks).catch((err: unknown) => {
                    log.error(
                        `shutdown flush failed: ${err instanceof Error ? err.message : String(err)}`,
                    );
                });
            }
        });

        // t488: macOS activate 事件时清理 Dock 角标并唤起主窗口。
        app.on("activate", () => {
            clear_dock_badge();
            if (!cliMode) {
                main_panel_controller?.open_or_focus();
            }
        });

        // Main panel already opened earlier (before settings pre-warm)
    } catch (err: unknown) {
        // D4: any startup failure (vault init, SQLite open, connector discovery,
        // config load, local API start) used to escape as an unhandledRejection and
        // leave a half-started app running with no window/tray/IPC. Surface the
        // error to the user and exit explicitly.
        const logger = createLogger("main");
        logger.error("Startup failed - aborting", err);
        const message = err instanceof Error ? err.message : String(err);
        // t275 AC8：CLI 模式无窗口，dialog 不可见且在无头显示下会阻塞挂起（xvfb
        // DISPLAY 下 showErrorBox 同步弹框等人点，进程不退出）；只向 stderr 写可读
        // 错误后非零退出。生产下 console transport 不挂载，日志仅落文件。
        if (cliMode) {
            process.stderr.write(`OmniPanel: 启动失败：${message}\n`);
            app.exit(1);
            return;
        }
        try {
            const { dialog } = await import("electron");
            dialog.showErrorBox(
                "OmniPanel 启动失败",
                `应用启动遇到错误：\n${message}\n\n请查看日志后重试。`,
            );
        } catch {
            // dialog not available — nothing more we can do
        }
        app.exit(1);
    }
});

app.on("window-all-closed", () => {
    // Don't quit — tray keeps app alive
});
