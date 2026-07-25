import { useCallback, useEffect, useRef, useState } from "react";

export type LoginPhase = "idle" | "starting" | "polling" | "success" | "error";

export interface DeviceCodeDisplay {
    readonly user_code: string;
    readonly verification_uri: string;
    readonly verification_uri_complete: string | null;
}

export interface UseGrokDeviceLoginResult {
    readonly phase: LoginPhase;
    readonly device_code: DeviceCodeDisplay | null;
    readonly error: string | null;
    readonly start: () => Promise<{ saved: boolean; token?: string } | null>;
    readonly set_error: (message: string | null) => void;
    readonly set_phase_error: (message: string) => void;
    readonly reset: () => void;
}

export function useGrokDeviceLogin(instance_id: string): UseGrokDeviceLoginResult {
    const [phase, set_phase] = useState<LoginPhase>("idle");
    const [device_code, set_device_code] = useState<DeviceCodeDisplay | null>(null);
    const [error, set_error] = useState<string | null>(null);
    const mounted_ref = useRef(true);
    const active_ref = useRef(false);

    const is_mounted = useCallback(() => mounted_ref.current, []);

    useEffect(() => {
        mounted_ref.current = true;
        return () => {
            mounted_ref.current = false;
            if (active_ref.current) {
                const grok_api = window.usageboard.grok;
                if ("login_cancel" in grok_api) {
                    void grok_api.login_cancel(instance_id);
                }
            }
        };
    }, [instance_id]);

    const reset = useCallback(() => {
        active_ref.current = false;
        set_phase("idle");
        set_device_code(null);
        set_error(null);
    }, []);

    const set_error_message = useCallback((message: string | null) => {
        active_ref.current = false;
        set_error(message);
    }, []);

    const set_phase_error = useCallback((message: string) => {
        active_ref.current = false;
        set_error(message);
        set_phase("error");
    }, []);

    const start = useCallback(async () => {
        if (active_ref.current) {
            return null;
        }
        const grok_api = window.usageboard.grok;
        if (!("login_start" in grok_api)) {
            set_phase("error");
            set_error("当前环境不支持 OAuth 设备码登录");
            return null;
        }
        set_phase("starting");
        set_error(null);
        active_ref.current = true;
        try {
            const start = await grok_api.login_start();
            if (!is_mounted()) return null;
            set_device_code({
                user_code: start.user_code,
                verification_uri: start.verification_uri,
                verification_uri_complete: start.verification_uri_complete,
            });
            set_phase("polling");
            const expires_at = Date.now() + start.expires_in * 1000;
            const result = await grok_api.login_poll(
                instance_id,
                start.device_code,
                start.interval,
                expires_at,
            );
            if (!is_mounted()) return null;
            if (result.saved) {
                set_phase("success");
                set_device_code(null);
                active_ref.current = false;
                return result;
            }
            set_phase("error");
            set_error("登录未完成");
            active_ref.current = false;
            return null;
        } catch (login_error) {
            if (!is_mounted()) return null;
            set_phase("error");
            set_error(login_error instanceof Error ? login_error.message : String(login_error));
            active_ref.current = false;
            return null;
        }
    }, [instance_id, is_mounted]);

    return {
        phase,
        device_code,
        error,
        start,
        set_error: set_error_message,
        set_phase_error,
        reset,
    };
}
