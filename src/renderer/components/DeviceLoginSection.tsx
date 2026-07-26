import { useState, useEffect, useCallback } from "react";
import { Icon } from "./Icon";
import { useDeviceLogin } from "../hooks/use-device-login";
import { build_device_login_url } from "../lib/device-login-url";
import type {
    GrokReadonlyApi,
    GrokSettingsApi,
    KimiReadonlyApi,
    KimiSettingsApi,
} from "../../shared/types/ipc";

export type OAuthDeviceVendor = "grok" | "kimi";

type DeviceApi = GrokReadonlyApi | GrokSettingsApi | KimiReadonlyApi | KimiSettingsApi;
type DeviceSettingsApi = GrokSettingsApi | KimiSettingsApi;

function is_settings_api(api: DeviceApi): api is DeviceSettingsApi {
    return "logout" in api;
}

export interface DeviceLoginSectionProps {
    readonly vendor: OAuthDeviceVendor;
    readonly instance_id: string;
    readonly secret_name?: string;
    readonly buttonLabel?: string;
    readonly checkStatus?: boolean;
    readonly onSecrets: (secrets: Record<string, string>) => void | Promise<void>;
}

const vendor_label: Record<OAuthDeviceVendor, string> = {
    grok: "Grok",
    kimi: "Kimi",
};

export function DeviceLoginSection({
    vendor,
    instance_id,
    secret_name = "OAUTH_TOKEN",
    buttonLabel,
    checkStatus = true,
    onSecrets,
}: DeviceLoginSectionProps) {
    const { phase, device_code, error, start, set_error, set_phase_error, reset } = useDeviceLogin(
        vendor,
        instance_id,
    );
    const api = window.usageboard[vendor];
    const api_available = "login_status" in api;
    const settings_api = is_settings_api(api) ? api : null;
    const [has_token, set_has_token] = useState(false);
    const [checking, set_checking] = useState(true);

    useEffect(() => {
        if (!checkStatus) {
            set_checking(false);
            return;
        }
        if (!api_available) {
            set_checking(false);
            return;
        }
        let mounted = true;
        api.login_status(instance_id)
            .then((status) => {
                if (!mounted) return;
                set_has_token(status.has_token);
                set_checking(false);
            })
            .catch(() => {
                if (!mounted) return;
                set_checking(false);
            });
        return () => {
            mounted = false;
        };
    }, [api, api_available, checkStatus, instance_id]);

    const handle_start = useCallback(async () => {
        const result = await start();
        if (!result?.saved) return;
        const secrets: Record<string, string> = {
            [secret_name]: result.token ?? "",
        };
        if (result.refresh_token) {
            secrets["OAUTH_REFRESH_TOKEN"] = result.refresh_token;
        }
        if (result.expires_at) {
            secrets["OAUTH_EXPIRES_AT"] = result.expires_at;
        }
        try {
            await onSecrets(secrets);
            set_has_token(true);
        } catch (save_error) {
            set_phase_error(
                save_error instanceof Error ? save_error.message : "保存账号失败，请重试",
            );
        }
    }, [start, secret_name, onSecrets, set_phase_error]);

    const handle_logout = useCallback(async () => {
        if (!settings_api) {
            set_error("当前窗口不支持退出登录");
            return;
        }
        try {
            await settings_api.logout(instance_id);
            set_has_token(false);
            reset();
        } catch (logout_error) {
            set_error(logout_error instanceof Error ? logout_error.message : String(logout_error));
        }
    }, [settings_api, instance_id, reset, set_error]);

    if (checking) {
        return (
            <div className="ad-field" data-testid={`device-login-checking-${instance_id}`}>
                <p className="ad-hint">检查登录状态...</p>
            </div>
        );
    }

    if (has_token && phase !== "error") {
        return (
            <div className="ad-field" data-testid={`device-login-logged-in-${instance_id}`}>
                <label className="ad-label">{vendor_label[vendor]} 授权</label>
                <p className="ad-hint">{phase === "success" ? "登录成功" : "已授权"}</p>
                {error && (
                    <p className="ad-hint" data-testid={`device-login-error-${instance_id}`}>
                        退出登录失败：{error}
                    </p>
                )}
                <button type="button" className="cf-secondary" onClick={() => void handle_logout()}>
                    退出登录
                </button>
            </div>
        );
    }

    return (
        <div className="ad-field" data-testid={`device-login-section-${instance_id}`}>
            <label className="ad-label">{vendor_label[vendor]} 授权</label>
            {phase === "idle" && (
                <button type="button" className="cf-secondary" onClick={() => void handle_start()}>
                    {buttonLabel ?? `${vendor_label[vendor]} 登录`}
                </button>
            )}
            {phase === "starting" && <p className="ad-hint">正在获取设备码...</p>}
            {phase === "polling" && device_code && (
                <div>
                    {device_code.user_code ? (
                        <p className="ad-hint">
                            请访问{" "}
                            <a
                                href={build_device_login_url(device_code)}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {build_device_login_url(device_code)}
                            </a>
                        </p>
                    ) : (
                        <p className="ad-hint">
                            输入代码：<code>{device_code.user_code}</code>
                        </p>
                    )}
                    <p className="ad-hint">等待授权完成...</p>
                </div>
            )}
            {phase === "success" && <p className="ad-hint">登录成功</p>}
            {phase === "error" && (
                <p className="ad-hint" data-testid={`device-login-error-${instance_id}`}>
                    <Icon name="alert_circle" size={12} strokeWidth={1.8} />
                    登录失败：{error}
                </p>
            )}
            {(phase === "error" || phase === "success") && (
                <button type="button" className="cf-secondary" onClick={() => void handle_start()}>
                    重新登录
                </button>
            )}
        </div>
    );
}
