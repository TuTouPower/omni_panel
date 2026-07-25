import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared device-code login hook (t118, extracts the grok/kimi duplicate).
 * The two vendor hooks differed only in the `window.usageboard.<namespace>`
 * lookup and variable names; behavior is identical.
 */

export type LoginPhase = "idle" | "starting" | "polling" | "success" | "error";

export interface DeviceCodeDisplay {
    readonly user_code: string;
    readonly verification_uri: string;
    readonly verification_uri_complete: string | null;
}

export interface UseDeviceLoginResult {
    readonly phase: LoginPhase;
    readonly device_code: DeviceCodeDisplay | null;
    readonly error: string | null;
    readonly start: () => Promise<{
        saved: boolean;
        token?: string;
        refresh_token?: string;
        expires_at?: string;
    } | null>;
    readonly set_error: (message: string | null) => void;
    readonly set_phase_error: (message: string) => void;
    readonly reset: () => void;
}

interface LoginPollResult {
    saved: boolean;
    token?: string;
    refresh_token?: string;
    expires_at?: string;
}

export function useDeviceLogin(
    namespace: "grok" | "kimi",
    instance_id: string,
): UseDeviceLoginResult {
    // api derives from preload's actual contract (Grok/Kimi readonly|settings);
    // readonly-only routes are filtered by `"login_start" in api` guards.
    const api = window.usageboard[namespace];
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
            if (active_ref.current && "login_cancel" in api) {
                void api.login_cancel(instance_id);
            }
        };
    }, [api, instance_id]);

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
        if (active_ref.current) return null;
        if (!("login_start" in api)) {
            set_phase("error");
            set_error("当前环境不支持 OAuth 设备码登录");
            return null;
        }
        set_phase("starting");
        set_error(null);
        active_ref.current = true;
        try {
            const login_start = await api.login_start();
            if (!is_mounted()) return null;
            set_device_code({
                user_code: login_start.user_code,
                verification_uri: login_start.verification_uri,
                verification_uri_complete: login_start.verification_uri_complete,
            });
            set_phase("polling");
            const expires_at = Date.now() + login_start.expires_in * 1000;
            const result = (await api.login_poll(
                instance_id,
                login_start.device_code,
                login_start.interval,
                expires_at,
            )) as LoginPollResult;
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
    }, [api, instance_id, is_mounted]);

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
