import type React from "react";
import type { AddServiceId } from "../../lib/provider_registry";
import type { AuthDescriptor } from "../../../shared/schemas/auth";
import type { ConnectorInfo, LocalScanResult } from "../../../shared/types/ipc";
import { ApiKeyForm } from "./ApiKeyForm";
import { SessionForm } from "./SessionForm";
import { LocalScanForm } from "./LocalScanForm";
import { OAuthDeviceForm } from "../forms/OAuthDeviceForm";
import { GrokBotPkceForm } from "../forms/GrokBotPkceForm";
import { WebLoginForm } from "../forms/WebLoginForm";
import { CpaMgmtForm } from "../forms/CpaMgmtForm";
import { ExaServiceKeyForm } from "../forms/ExaServiceKeyForm";
import type { AddAccountParams } from "./add_account_params";
import { fallback_secret_name } from "../../lib/auth-flow-registry";

export interface ApiKeyFormData {
    api_key: string;
    endpoint_override?: string;
}

export interface SessionFormData {
    cookie: string;
}

export interface FormContext {
    readonly vendor_id: AddServiceId;
    readonly account_name: string;
    readonly set_account_name: (name: string) => void;
    readonly auth_descriptor?: AuthDescriptor | null | undefined;
    readonly selected_connector?: ConnectorInfo | null | undefined;
    readonly api_form_ref: React.RefObject<ApiKeyFormData>;
    readonly session_form_ref: React.RefObject<SessionFormData>;
    readonly local_scan_result: LocalScanResult | null;
    readonly set_local_scan_result: (result: LocalScanResult | null) => void;
    readonly oauth_instance_id: string;
    readonly on_save: (params: AddAccountParams) => Promise<void>;
}

export interface FormRenderer {
    readonly handles_save: boolean;
    readonly match: (auth_method: string, ctx: FormContext) => boolean;
    readonly render: (ctx: FormContext) => React.ReactNode;
}

// A100 / AC-002: 表单注册表驱动化，消除 switch/if 级联分支
export const FORM_REGISTRY: readonly FormRenderer[] = [
    {
        handles_save: true,
        match: (method, ctx) =>
            method === "apikey" &&
            ctx.vendor_id === "exa" &&
            (ctx.auth_descriptor?.extra_fields?.length ?? 0) > 0,
        render: (ctx) => (
            <ExaServiceKeyForm
                key={ctx.vendor_id}
                vendor_id={ctx.vendor_id}
                secret_name={
                    ctx.auth_descriptor?.secret_name ??
                    fallback_secret_name(ctx.selected_connector ?? undefined)
                }
                account_name={ctx.account_name}
                set_account_name={ctx.set_account_name}
                on_save={ctx.on_save}
            />
        ),
    },
    {
        handles_save: false,
        match: (method) => method === "apikey",
        render: (ctx) => (
            <ApiKeyForm
                account_name={ctx.account_name}
                set_account_name={ctx.set_account_name}
                form_ref={ctx.api_form_ref}
            />
        ),
    },
    {
        handles_save: false,
        match: (method) => method === "session",
        render: (ctx) => (
            <SessionForm
                provider={ctx.vendor_id}
                secret_name={
                    ctx.auth_descriptor?.secret_name ??
                    fallback_secret_name(ctx.selected_connector ?? undefined)
                }
                login_url={
                    ctx.selected_connector?.metadata?.login_url ??
                    ctx.selected_connector?.metadata?.endpoints?.["login"] ??
                    undefined
                }
                cookie_names={ctx.selected_connector?.metadata?.cookie_names}
                account_name={ctx.account_name}
                set_account_name={ctx.set_account_name}
                form_ref={ctx.session_form_ref}
            />
        ),
    },
    {
        handles_save: false,
        match: (method) => method === "local_cli",
        render: (ctx) => (
            <LocalScanForm
                vendor_id={ctx.vendor_id}
                on_scan_result={(res) => {
                    ctx.set_local_scan_result(res);
                    if (res.details?.email && !ctx.account_name) {
                        ctx.set_account_name(res.details.email);
                    }
                }}
            />
        ),
    },
    {
        handles_save: true,
        match: (method) => method === "oauth_device",
        render: (ctx) => (
            <OAuthDeviceForm
                key={ctx.vendor_id}
                instance_id={ctx.oauth_instance_id}
                vendor={ctx.vendor_id === "kimi" ? "kimi" : "grok"}
                vendor_id={ctx.vendor_id}
                secret_name={
                    ctx.auth_descriptor?.secret_name ??
                    fallback_secret_name(ctx.selected_connector ?? undefined)
                }
                account_name={ctx.account_name}
                set_account_name={ctx.set_account_name}
                on_save={ctx.on_save}
            />
        ),
    },
    {
        handles_save: true,
        match: (method) => method === "oauth_pkce",
        render: (ctx) => (
            <GrokBotPkceForm
                key={ctx.vendor_id}
                instance_id={ctx.oauth_instance_id}
                account_name={ctx.account_name}
                set_account_name={ctx.set_account_name}
                on_save={ctx.on_save}
            />
        ),
    },
    {
        handles_save: true,
        match: (method, ctx) => method === "web_login" && Boolean(ctx.auth_descriptor?.login_url),
        render: (ctx) => (
            <WebLoginForm
                key={ctx.vendor_id}
                provider={ctx.vendor_id}
                login_url={ctx.auth_descriptor?.login_url ?? ""}
                secret_name={ctx.auth_descriptor?.secret_name ?? "COOKIE"}
                cookie_names={ctx.selected_connector?.metadata?.cookie_names}
                account_name={ctx.account_name}
                set_account_name={ctx.set_account_name}
                on_save={ctx.on_save}
            />
        ),
    },
    {
        handles_save: true,
        match: (method) => method === "cpa_mgmt",
        render: (ctx) => (
            <CpaMgmtForm
                key={ctx.vendor_id}
                vendor_id={ctx.vendor_id}
                default_endpoint={
                    ctx.selected_connector?.metadata?.endpoints?.["default"] ?? undefined
                }
                account_name={ctx.account_name}
                set_account_name={ctx.set_account_name}
                on_save={ctx.on_save}
            />
        ),
    },
];

export function resolve_form_renderer(
    auth_method: string,
    ctx: FormContext,
): FormRenderer | undefined {
    return FORM_REGISTRY.find((entry) => entry.match(auth_method, ctx));
}
