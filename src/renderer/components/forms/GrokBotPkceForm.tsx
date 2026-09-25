import { useCallback, useEffect, useRef, useState } from "react";
import type { AddAccountParams } from "../AddAccountDialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { SecretInput } from "../ui/SecretInput";

export interface GrokBotPkceFormProps {
    readonly instance_id: string;
    readonly account_name: string;
    readonly set_account_name: (v: string) => void;
    readonly on_save: (params: AddAccountParams) => Promise<void>;
}

export function GrokBotPkceForm({
    instance_id,
    account_name,
    set_account_name,
    on_save,
}: GrokBotPkceFormProps) {
    const [status, set_status] = useState<"idle" | "authorizing" | "saving" | "error">("idle");
    const [error_msg, set_error_msg] = useState<string | null>(null);
    const [show_manual, set_show_manual] = useState(false);
    const [manual_token, set_manual_token] = useState("");
    const [manual_refresh, set_manual_refresh] = useState("");

    const status_ref = useRef(status);
    status_ref.current = status;

    // A52: 组件卸载时自动通知主进程取消正在进行的轮询，避免后台孤儿任务残留
    useEffect(() => {
        return () => {
            void window.usageboard.grok_bot.login_cancel(instance_id).catch(() => undefined);
        };
    }, [instance_id]);

    const handle_browser_login = useCallback(async () => {
        // A52: 重入守卫
        if (status_ref.current === "authorizing" || status_ref.current === "saving") {
            return;
        }

        set_status("authorizing");
        set_error_msg(null);

        const api = window.usageboard.grok_bot;

        try {
            const start = await api.login_start();
            // A12: 仅传 login_id，不在前端和 IPC 链路流转 verifier 明文
            const poll_res = await api.login_poll(instance_id, start.uuid, start.login_id);

            if (!poll_res.saved || !poll_res.token) {
                set_status("error");
                set_error_msg(poll_res.error ?? "授权失败或已取消");
                return;
            }

            set_status("saving");
            const secrets: Record<string, string> = {
                ACCESS_TOKEN: poll_res.token,
            };
            if (poll_res.refresh_token) {
                secrets["REFRESH_TOKEN"] = poll_res.refresh_token;
            }

            // A53: 账号名 trim 规范化，防空白字符串穿透
            const safe_name = account_name.trim() || "Grok Bot";

            await on_save({
                vendor_id: "grok_bot",
                account_name: safe_name,
                auth_method: "oauth_pkce",
                parameter_values: {},
                secrets,
            });
        } catch (err) {
            set_status("error");
            set_error_msg(err instanceof Error ? err.message : String(err));
        }
    }, [account_name, instance_id, on_save]);

    const handle_cancel = useCallback(async () => {
        try {
            await window.usageboard.grok_bot.login_cancel(instance_id);
            set_status("idle");
            set_error_msg(null);
        } catch (err) {
            set_error_msg(`取消操作失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [instance_id]);

    const handle_manual_save = useCallback(async () => {
        const token = manual_token.trim();
        if (!token) {
            set_error_msg("请先输入 Access Token");
            return;
        }

        set_status("saving");
        set_error_msg(null);

        try {
            const secrets: Record<string, string> = {
                ACCESS_TOKEN: token,
            };
            if (manual_refresh.trim()) {
                secrets["REFRESH_TOKEN"] = manual_refresh.trim();
            }

            const safe_name = account_name.trim() || "Grok Bot";

            await on_save({
                vendor_id: "grok_bot",
                account_name: safe_name,
                auth_method: "oauth_pkce",
                parameter_values: {},
                secrets,
            });
        } catch (err) {
            set_status("error");
            set_error_msg(err instanceof Error ? err.message : String(err));
        }
    }, [account_name, manual_refresh, manual_token, on_save]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
                <label className="text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                    备注
                    <span className="ml-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                        显示用
                    </span>
                </label>
                <Input
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

            {status === "authorizing" ? (
                <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-container)] p-3">
                    <div className="text-[length:var(--text-label-md)] text-[var(--color-on-surface)]">
                        已打开浏览器进行授权，请在网页中完成登录...
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => void handle_cancel()}
                    >
                        取消
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <Button
                        variant="primary"
                        size="standard"
                        type="button"
                        disabled={status === "saving"}
                        onClick={() => void handle_browser_login()}
                    >
                        {status === "saving" ? "正在保存..." : "浏览器登录授权"}
                    </Button>
                </div>
            )}

            {error_msg && (
                <div className="text-[length:var(--text-body-sm)] text-[var(--color-error)]">
                    {error_msg}
                </div>
            )}

            <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                <button
                    type="button"
                    className="text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)] hover:underline cursor-pointer"
                    onClick={() => {
                        set_show_manual(!show_manual);
                    }}
                >
                    {show_manual ? "收起手动输入" : "手动输入 Token 备选"}
                </button>

                {show_manual && (
                    <div className="mt-2 flex flex-col gap-2">
                        <label className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                            Access Token (JWT)
                        </label>
                        <SecretInput
                            value={manual_token}
                            onChange={(e) => {
                                set_manual_token(e.target.value);
                            }}
                            placeholder="eyJhbGciOi..."
                        />
                        <label className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                            Refresh Token (可选)
                        </label>
                        <SecretInput
                            value={manual_refresh}
                            onChange={(e) => {
                                set_manual_refresh(e.target.value);
                            }}
                            placeholder="可选的刷新令牌"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            type="button"
                            disabled={!manual_token.trim() || status === "saving"}
                            onClick={() => void handle_manual_save()}
                        >
                            保存手动凭据
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
