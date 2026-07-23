import { useCallback, useEffect, useRef, useState } from "react";
import type { ConnectorInfo } from "../../shared/types/ipc";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { AddServiceId } from "../lib/common-services";
import { VendorMark, Icon } from "./Icon";
import { ADD_COMMON_SERVICES } from "../lib/common-services";
import { parse_cookie_text } from "../../shared/lib/cookie_parser";

// ── Auth method routing ──

export type AuthMethod = "apikey" | "session" | "local";

export const VENDOR_AUTH_MAP: Partial<Record<AddServiceId, AuthMethod>> = {
    deepseek: "apikey",
    glm: "apikey",
    tavily: "apikey",
    minimax: "apikey",
    kimi: "apikey",
    getoneapi: "apikey",
    exa: "apikey",
    tikhub: "apikey",
    cpa: "apikey",
    mimo: "session",
    opencode_go: "session",
    grok: "apikey",
    claude: "local",
    codex: "local",
    antigravity: "local",
};

const AUTH_APIKEY_META: Partial<
    Record<UsageProvider, { prefix: string; endpoint: string; docs: string }>
> = {
    deepseek: {
        prefix: "sk-",
        endpoint: "https://api.deepseek.com",
        docs: "platform.deepseek.com → API Keys",
    },
    kimi: {
        prefix: "sk-kimi-",
        endpoint: "https://api.kimi.com/coding/v1",
        docs: "kimi.com/code/console → 创建 API Key",
    },
    tavily: {
        prefix: "tvly-",
        endpoint: "https://api.tavily.com",
        docs: "app.tavily.com → API Keys",
    },
};

const AUTH_SESSION_META: Partial<
    Record<UsageProvider, { host: string; login_url: string; cookie_keys: string[] }>
> = {
    mimo: {
        host: "platform.xiaomimimo.com",
        login_url: "https://platform.xiaomimimo.com/console/plan-manage",
        cookie_keys: ["api-platform_serviceToken", "api-platform_slh", "api-platform_ph"],
    },
    opencode_go: {
        host: "opencode.ai",
        login_url: "https://opencode.ai/auth",
        cookie_keys: ["session", "__Host-session", "__Secure-session"],
    },
};

const OPENCODE_GO_COOKIE_SCRIPT = `(() => {
    if (!location.hostname.endsWith("opencode.ai")) {
        alert("请先打开 opencode.ai 后再运行脚本");
        return;
    }
    const cookie = document.cookie;
    if (!cookie) {
        alert("未读取到 Cookie。可能是 HttpOnly 限制，请改用浏览器导出的 Cookie JSON 或 Netscape 格式。");
        return;
    }
    navigator.clipboard.writeText(cookie).then(
        () => alert("Cookie 已复制"),
        () => alert("复制失败，请手动复制 document.cookie"),
    );
})();`;

const AUTH_LOCAL_PATHS: Partial<Record<AddServiceId, string[]>> = {
    claude: ["~/.claude/.credentials.json", "~/.config/claude/auth.json"],
    codex: ["~/.codex/auth.json"],
    antigravity: ["~/.antigravity/session.json"],
};

// ── Props ──

export interface AddAccountParams {
    vendor_id: AddServiceId;
    account_name: string;
    auth_method: AuthMethod;
    parameter_values: Record<string, string>;
    endpoint_overrides?: Record<string, string>;
    secrets: Record<string, string>;
}

interface AddAccountDialogProps {
    plugin_infos: ConnectorInfo[];
    on_close: () => void;
    on_save: (params: AddAccountParams) => Promise<void>;
}

// ── Sub-components ──

function VendorPicker({
    on_select,
}: {
    plugin_infos: ConnectorInfo[];
    on_select: (vendor_id: AddServiceId) => void;
}) {
    // 内置 provider 始终可添加（auto_seed 保证 connector definition 存在）；
    // 用户删除账号后可重新添加，不因 plugin_infos 缺失而禁用。
    const can_add = (_provider: AddServiceId) => true;

    return (
        <div className="pick-body">
            <div className="set-group-label" style={{ marginTop: 0 }}>
                常用服务
            </div>
            <div className="pick-grid">
                {ADD_COMMON_SERVICES.map((s) => {
                    const available = can_add(s.id);
                    return (
                        <button
                            className={"pick-card" + (available ? "" : " disabled")}
                            key={s.id}
                            type="button"
                            disabled={!available}
                            onClick={() => {
                                on_select(s.id);
                            }}
                        >
                            <VendorMark id={s.id} size={28} />
                            <span className="pick-label">{s.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ApiKeyForm({
    vendor_id,
    account_name,
    set_account_name,
    form_ref,
}: {
    vendor_id: AddServiceId;
    account_name: string;
    set_account_name: (v: string) => void;
    form_ref: React.RefObject<{ api_key: string; endpoint_override?: string }>;
}) {
    const meta = AUTH_APIKEY_META[vendor_id as UsageProvider] ?? {
        prefix: "sk-",
        endpoint: "",
        docs: "",
    };
    const [key, set_key] = useState("");
    const [show_key, set_show_key] = useState(false);
    const [endpoint, set_endpoint] = useState("");

    useEffect(() => {
        form_ref.current = {
            api_key: key,
            ...(endpoint ? { endpoint_override: endpoint } : {}),
        };
    }, [key, endpoint, form_ref]);

    return (
        <div>
            <div className="ad-field">
                <label className="ad-label">
                    备注<span className="ad-opt">显示用</span>
                </label>
                <input
                    className="ad-input"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={account_name}
                    autoFocus
                    onChange={(e) => {
                        set_account_name(e.target.value);
                    }}
                    placeholder="例如：工作账号"
                />
            </div>
            <div className="ad-field">
                <label className="ad-label">API 密钥</label>
                <div className="ad-key">
                    <input
                        className="ad-input mono"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        type={show_key ? "text" : "password"}
                        value={key}
                        onChange={(e) => {
                            set_key(e.target.value);
                        }}
                        placeholder={(meta.prefix || "sk-") + "…"}
                    />
                    <button
                        className="ad-eye"
                        type="button"
                        onClick={() => {
                            set_show_key((v) => !v);
                        }}
                        title={show_key ? "隐藏" : "显示"}
                    >
                        <Icon name={show_key ? "eye_off" : "eye"} size={16} />
                    </button>
                </div>
                <div className="ad-hint">
                    <Icon name="lock" size={12} strokeWidth={1.8} />
                    密钥仅加密保存在本地
                    {meta.docs ? `，在 ${meta.docs} 获取` : ""}
                </div>
            </div>
            <div className="ad-field">
                <label className="ad-label">
                    接口地址<span className="ad-opt">可选</span>
                </label>
                <input
                    className="ad-input mono"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={endpoint}
                    onChange={(e) => {
                        set_endpoint(e.target.value);
                    }}
                    placeholder={meta.endpoint || "默认（官方接口）"}
                />
            </div>
        </div>
    );
}

function SessionForm({
    vendor_id,
    account_name,
    set_account_name,
    form_ref,
}: {
    vendor_id: AddServiceId;
    account_name: string;
    set_account_name: (v: string) => void;
    form_ref: React.RefObject<{ cookie: string }>;
}) {
    const meta = AUTH_SESSION_META[vendor_id as UsageProvider] ?? {
        host: "",
        login_url: "",
        cookie_keys: [],
    };
    const [cookie, set_cookie] = useState("");
    const is_opencode_go = vendor_id === "opencode_go";
    const placeholder = is_opencode_go
        ? "支持 JSON、EditThisCookie、Netscape、k=v; k=v"
        : "在浏览器登录 " + meta.host + " 后，从开发者工具复制完整 Cookie…";

    useEffect(() => {
        form_ref.current = { cookie };
    }, [cookie, form_ref]);

    const handle_copy_script = useCallback(() => {
        const clipboard = "clipboard" in navigator ? navigator.clipboard : null;
        if (!clipboard) {
            alert("当前环境无法写入剪贴板，请手动复制脚本");
            return;
        }
        void clipboard.writeText(OPENCODE_GO_COOKIE_SCRIPT).catch(() => {
            alert("复制失败，请手动复制脚本");
        });
    }, []);

    return (
        <>
            <div className="ad-field">
                <label className="ad-label">
                    备注<span className="ad-opt">显示用</span>
                </label>
                <input
                    className="ad-input"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={account_name}
                    onChange={(e) => {
                        set_account_name(e.target.value);
                    }}
                    placeholder="例如：工作账号"
                />
            </div>
            <div className="ad-field">
                <label className="ad-label">Cookie 字符串</label>
                {is_opencode_go && (
                    <button className="ad-test" type="button" onClick={handle_copy_script}>
                        复制脚本
                    </button>
                )}
                <textarea
                    className="aa-textarea mono"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    value={cookie}
                    onChange={(e) => {
                        set_cookie(e.target.value);
                    }}
                    placeholder={placeholder}
                />
                <div className="cookie-keys">
                    <span className="ck-label">需包含</span>
                    {meta.cookie_keys.map((k: string) => (
                        <code key={k} className="ck-chip">
                            {k}
                        </code>
                    ))}
                </div>
                <div className="ad-hint" style={{ marginTop: 6 }}>
                    <Icon name="info" size={12} strokeWidth={1.8} />
                    保存后可在账号设置中使用网页登录自动捕获 Cookie
                </div>
            </div>
        </>
    );
}

function LocalScanForm({ vendor_id }: { vendor_id: AddServiceId }) {
    const paths = AUTH_LOCAL_PATHS[vendor_id] ?? [];
    const [phase, set_phase] = useState<"scanning" | "done">("scanning");

    // Mock scan — in production this would use IPC to read the filesystem
    useEffect(() => {
        const t = setTimeout(() => {
            set_phase("done");
            // For now, show the paths as being scanned; no real file I/O
            // from the renderer. A future IPC channel can provide real results.
        }, 800);
        return () => {
            clearTimeout(t);
        };
    }, [vendor_id]);

    return (
        <>
            <div className="scan-paths">
                <span className="sp-h">
                    <Icon name="search" size={13} strokeWidth={1.8} />
                    扫描位置
                </span>
                {paths.map((p) => (
                    <code key={p} className="sp-path">
                        {p}
                    </code>
                ))}
            </div>

            {phase === "scanning" ? (
                <div className="scan-busy">
                    <span className="sb-spin">
                        <Icon name="refresh" size={16} />
                    </span>
                    正在扫描本地授权文件…
                </div>
            ) : (
                <div className="scan-found">
                    <div className="sf-head">
                        <span className="sf-title">未发现有效凭证</span>
                        <button
                            className="sf-rescan"
                            type="button"
                            onClick={() => {
                                set_phase("scanning");
                            }}
                        >
                            <Icon name="refresh" size={13} strokeWidth={1.8} />
                            重新扫描
                        </button>
                    </div>
                    <div className="lm-empty" style={{ marginTop: 12 }}>
                        <span className="lme-ic">
                            <Icon name="file" size={20} />
                        </span>
                        <div className="lme-title">未找到本地授权文件</div>
                        <div className="lme-sub">
                            请确保已安装对应的 CLI 工具并完成登录，然后点击重新扫描。
                        </div>
                    </div>
                    <button className="scan-manual" type="button" disabled title="尚未实现">
                        <Icon name="folder" size={14} />
                        手动选择文件…
                    </button>
                </div>
            )}
        </>
    );
}

// ── Main Dialog ──

export function AddAccountDialog({
    plugin_infos,
    on_close,
    on_save,
}: AddAccountDialogProps) {
    const [step, set_step] = useState<"vendor" | "auth">("vendor");
    const [vendor_id, set_vendor_id] = useState<AddServiceId | null>(null);
    const [account_name, set_account_name] = useState("");
    const [saving, set_saving] = useState(false);
    const [error_message, set_error_message] = useState<string | null>(null);
    const api_form_ref = useRef<{ api_key: string; endpoint_override?: string }>({
        api_key: "",
    });
    const session_form_ref = useRef<{ cookie: string }>({
        cookie: "",
    });

    const auth_method: AuthMethod = (vendor_id && VENDOR_AUTH_MAP[vendor_id]) ?? "apikey";

    const vendor_label =
        ADD_COMMON_SERVICES.find((s) => s.id === vendor_id)?.label ?? vendor_id ?? "";

    const sub_by_auth: Record<AuthMethod, string> = {
        apikey: "粘贴 API 密钥即可接入",
        session: "网页登录或粘贴 Cookie",
        local: "扫描本地 CLI 授权文件",
    };

    const title = vendor_id ? `添加 ${vendor_label} 账号` : "添加账号";
    const sub = vendor_id ? sub_by_auth[auth_method] : "";
    const wide = auth_method === "local";

    // ESC to close
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") on_close();
        };
        window.addEventListener("keydown", h);
        return () => {
            window.removeEventListener("keydown", h);
        };
    }, [on_close]);

    const handle_select_vendor = useCallback((id: AddServiceId) => {
        set_vendor_id(id);
        set_account_name("");
        set_error_message(null);
        set_step("auth");
    }, []);

    const handle_back = useCallback(() => {
        set_step("vendor");
        set_vendor_id(null);
        set_account_name("");
        set_error_message(null);
    }, []);

    const handle_save = useCallback(async () => {
        if (!vendor_id || saving) return;
        set_error_message(null);
        set_saving(true);
        try {
            const params: AddAccountParams = {
                vendor_id,
                account_name: account_name || vendor_label,
                auth_method,
                parameter_values: {},
                secrets: {},
            };

            // Collect form data based on auth method
            if (auth_method === "apikey") {
                const data = api_form_ref.current;
                params.secrets = { API_KEY: data.api_key };
                if (data.endpoint_override) {
                    params.endpoint_overrides = {
                        default: data.endpoint_override,
                    };
                }
            } else if (auth_method === "session") {
                const data = session_form_ref.current;
                const cookie = data.cookie.trim();
                if (vendor_id === "opencode_go" && !cookie) {
                    set_error_message("请粘贴 Cookie 或先网页登录");
                    return;
                }
                if (cookie) {
                    let session_cookie = cookie;
                    if (vendor_id === "opencode_go") {
                        try {
                            session_cookie = parse_cookie_text(cookie).header;
                        } catch (error) {
                            alert(error instanceof Error ? error.message : "无法识别 Cookie 格式");
                            return;
                        }
                    }
                    params.secrets = { SESSION_COOKIE: session_cookie };
                }
            }

            await on_save(params);
            on_close();
        } finally {
            set_saving(false);
        }
    }, [vendor_id, account_name, auth_method, vendor_label, saving, on_save, on_close]);

    return (
        <div className="acct-dialog-scrim" onMouseDown={on_close}>
            <div
                className={"acct-dialog aa" + (wide ? " wide" : "")}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
            >
                {/* Header */}
                <div className="ad-head">
                    {step === "auth" && vendor_id ? (
                        <span className="ad-mark">
                            <VendorMark id={vendor_id} size={24} />
                        </span>
                    ) : (
                        <span className="ad-mark">
                            <VendorMark id="overview" size={24} />
                        </span>
                    )}
                    <div className="ad-htext">
                        <div className="ad-title">{title}</div>
                        {sub && <div className="ad-sub">{sub}</div>}
                    </div>
                    {step === "auth" && (
                        <button
                            className="ad-back"
                            type="button"
                            onClick={handle_back}
                            title="返回选择服务"
                        >
                            <Icon name="back" size={17} strokeWidth={2} />
                        </button>
                    )}
                    <button className="ad-close" onClick={on_close} title="关闭" type="button">
                        <Icon name="close" size={17} strokeWidth={2} />
                    </button>
                </div>

                {/* Body */}
                <div className="ad-body">
                    {step === "vendor" && (
                        <VendorPicker
                            plugin_infos={plugin_infos}
                            on_select={handle_select_vendor}
                        />
                    )}
                    {step === "auth" && vendor_id && (
                        <>
                            {auth_method === "apikey" && (
                                <ApiKeyForm
                                    vendor_id={vendor_id}
                                    account_name={account_name}
                                    set_account_name={set_account_name}
                                    form_ref={api_form_ref}
                                />
                            )}
                            {auth_method === "session" && (
                                <SessionForm
                                    vendor_id={vendor_id}
                                    account_name={account_name}
                                    set_account_name={set_account_name}
                                    form_ref={session_form_ref}
                                />
                            )}
                            {auth_method === "local" && <LocalScanForm vendor_id={vendor_id} />}
                        </>
                    )}
                </div>

                {/* Footer */}
                {step === "auth" && (
                    <div className="ad-foot">
                        {error_message && <div className="ad-hint">{error_message}</div>}
                        {auth_method !== "local" && (
                            <button className="ad-test" type="button" disabled>
                                <Icon name="refresh" size={14} strokeWidth={1.9} />
                                测试连接
                            </button>
                        )}
                        <div className="ad-foot-r">
                            <button className="ad-btn ghost" type="button" onClick={on_close}>
                                取消
                            </button>
                            <button
                                className={"ad-btn primary" + (saving ? " disabled" : "")}
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                    void handle_save();
                                }}
                            >
                                {auth_method === "local" ? "导入账号" : "添加账号"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
