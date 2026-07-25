import { useState, useEffect, useCallback } from "react";
import { useGrokDeviceLogin } from "../hooks/useGrokDeviceLogin";

export interface GrokLoginSectionProps {
    readonly instance_id: string;
}

export function GrokLoginSection({ instance_id }: GrokLoginSectionProps) {
    const [has_token, set_has_token] = useState(false);
    const [checking, set_checking] = useState(true);
    const { phase, device_code, error, start, set_error, reset } = useGrokDeviceLogin(instance_id);
    const grok_api = window.usageboard.grok;
    const settings_api = "login_start" in grok_api ? grok_api : null;

    useEffect(() => {
        let mounted = true;
        grok_api
            .login_status(instance_id)
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
    }, [grok_api, instance_id]);

    const handle_login = useCallback(async () => {
        if (!settings_api) return;
        const result = await start();
        if (result?.saved) {
            set_has_token(true);
        }
    }, [settings_api, start]);

    const handle_logout = useCallback(async () => {
        if (!settings_api) {
            set_error("当前窗口不支持 Grok 退出登录");
            return;
        }
        try {
            await settings_api.logout(instance_id);
            set_has_token(false);
            reset();
        } catch (logout_error) {
            set_error(logout_error instanceof Error ? logout_error.message : String(logout_error));
        }
    }, [instance_id, settings_api, reset, set_error]);

    if (checking) {
        return (
            <div className="ad-field" data-testid={`grok-login-checking-${instance_id}`}>
                <p className="ad-hint">检查登录状态...</p>
            </div>
        );
    }

    if (has_token && phase !== "error") {
        return (
            <div className="ad-field" data-testid={`grok-login-logged-in-${instance_id}`}>
                <label className="ad-label">Grok 授权</label>
                <p className="ad-hint">{phase === "success" ? "登录成功" : "已授权"}</p>
                {error && (
                    <p className="ad-hint" data-testid={`grok-login-error-${instance_id}`}>
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
        <div className="ad-field" data-testid={`grok-login-section-${instance_id}`}>
            <label className="ad-label">Grok 授权</label>
            {phase === "idle" && (
                <button type="button" className="cf-secondary" onClick={() => void handle_login()}>
                    Grok 登录
                </button>
            )}
            {phase === "starting" && <p className="ad-hint">正在获取设备码...</p>}
            {phase === "polling" && device_code && (
                <div>
                    <p className="ad-hint">
                        请访问{" "}
                        <a
                            href={
                                device_code.verification_uri_complete ??
                                device_code.verification_uri
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            {device_code.verification_uri}
                        </a>
                    </p>
                    <p className="ad-hint">
                        输入代码：<code>{device_code.user_code}</code>
                    </p>
                    <p className="ad-hint">等待授权完成...</p>
                </div>
            )}
            {phase === "success" && <p className="ad-hint">登录成功</p>}
            {phase === "error" && (
                <p className="ad-hint" data-testid={`grok-login-error-${instance_id}`}>
                    登录失败：{error}
                </p>
            )}
            {(phase === "error" || phase === "success") && (
                <button type="button" className="cf-secondary" onClick={() => void handle_login()}>
                    重新登录
                </button>
            )}
        </div>
    );
}
