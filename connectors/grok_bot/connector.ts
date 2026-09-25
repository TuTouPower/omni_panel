import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

void ctx;

interface SandUsageResponse {
    readonly usagePercent?: number;
    readonly hasAvailableUsage?: boolean;
    readonly nextResetTimestampUtc?: string;
    readonly grokPlanLabel?: string;
}

const ENDPOINT_KEY = "cursor_api";
const SAND_PATH = "/aiserver.v1.DashboardService/GetSandUsageStatus";

function base64url_decode(str: string): string {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
        base64 += "=";
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let output = "";
    let bc = 0;
    let bs = 0;
    for (let idx = 0; idx < base64.length; idx++) {
        const char = base64.charAt(idx);
        const char_index = chars.indexOf(char);
        if (char_index >= 0 && char !== "=") {
            bs = bc % 4 ? bs * 64 + char_index : char_index;
            if (bc++ % 4) {
                output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
            }
        }
    }
    return output;
}

function parse_jwt_info(token: string): { email?: string | undefined; sub?: string | undefined } {
    try {
        const parts = token.split(".");
        if (parts.length < 2 || !parts[1]) {
            ctx.log.debug(
                `parse_jwt_info: invalid token format (parts length: ${String(parts.length)})`,
            );
            return {};
        }
        const json = base64url_decode(parts[1]);
        const payload = JSON.parse(json) as Record<string, unknown>;
        const email = typeof payload["email"] === "string" ? payload["email"] : undefined;
        const sub = typeof payload["sub"] === "string" ? payload["sub"] : undefined;
        return { email, sub };
    } catch (err) {
        ctx.log.debug(
            `parse_jwt_info: failed to parse payload: ${err instanceof Error ? err.message : String(err)}`,
        );
        return {};
    }
}

function obfuscate(b: Uint8Array): Uint8Array {
    let p = 165;
    for (let i = 0; i < b.length; i++) {
        const c = b[i] ?? 0;
        b[i] = ((c ^ p) + (i % 256)) & 255;
        p = b[i] ?? 0;
    }
    return b;
}

function to_base64url_6bytes(b: Uint8Array): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const b0 = b[0] ?? 0;
    const b1 = b[1] ?? 0;
    const b2 = b[2] ?? 0;
    const b3 = b[3] ?? 0;
    const b4 = b[4] ?? 0;
    const b5 = b[5] ?? 0;
    return (
        chars.charAt((b0 >> 2) & 63) +
        chars.charAt(((b0 & 3) << 4) | ((b1 >> 4) & 15)) +
        chars.charAt(((b1 & 15) << 2) | ((b2 >> 6) & 3)) +
        chars.charAt(b2 & 63) +
        chars.charAt((b3 >> 2) & 63) +
        chars.charAt(((b3 & 3) << 4) | ((b4 >> 4) & 15)) +
        chars.charAt(((b4 & 15) << 2) | ((b5 >> 6) & 3)) +
        chars.charAt(b5 & 63)
    );
}

function generate_uuid(): string {
    // A75: 使用标准安全随机器代替 Math.random
    return crypto.randomUUID();
}

function generate_checksum(mid: string, now = Date.now()): string {
    const ks = BigInt(Math.floor(now / 1e6));
    const b = new Uint8Array([
        Number((ks >> 40n) & 0xffn),
        Number((ks >> 32n) & 0xffn),
        Number((ks >> 24n) & 0xffn),
        Number((ks >> 16n) & 0xffn),
        Number((ks >> 8n) & 0xffn),
        Number(ks & 0xffn),
    ]);
    return to_base64url_6bytes(obfuscate(b)) + mid;
}

function parse_timestamp(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value !== "string") return null;
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
}

async function main(): Promise<ScriptObservation[]> {
    const token = ctx.params["ACCESS_TOKEN"] ?? "";
    const jwt = parse_jwt_info(token);
    // A13: 优先采用有效 sub 或根据 token 派生稳定非空 id，杜绝空字符串与碰撞
    const raw_sub = jwt.sub?.trim();
    let fallback_id = "grok_bot";
    if (token) {
        let h = 0;
        for (let i = 0; i < token.length; i++) {
            h = ((h << 5) - h + token.charCodeAt(i)) | 0;
        }
        fallback_id = `grok_bot_${Math.abs(h).toString(16)}`;
    }
    const account_id = raw_sub && raw_sub.length > 0 ? raw_sub : fallback_id;
    const raw_email = jwt.email?.trim();
    const account_label = raw_email && raw_email.length > 0 ? raw_email : "Grok Bot";

    const mid = generate_uuid();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-cursor-checksum": generate_checksum(mid),
        "x-cursor-client-type": "sand",
        "x-cursor-client-version": "0.1.0",
        "x-sand-box-namespace": "prod",
        "x-ghost-mode": "true",
        "x-request-id": generate_uuid(),
    };

    let sand_res: SandUsageResponse | null = null;
    let sand_err: string | null = null;

    // A128 / AC-007: 外部网络输入边界 zod safeParse 防御
    const sand_usage_schema = ctx.z?.object({
        usagePercent: ctx.z.number(),
        hasAvailableUsage: ctx.z.boolean().optional(),
        nextResetTimestampUtc: ctx.z.string().optional(),
        grokPlanLabel: ctx.z.string().optional(),
    });

    const sand_opts = sand_usage_schema ? { headers, schema: sand_usage_schema } : { headers };

    try {
        sand_res = (await ctx.http.post_json(
            ENDPOINT_KEY,
            SAND_PATH,
            {},
            sand_opts,
        )) as SandUsageResponse;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A7: 401/403 明确抛出错误，驱动 refresh-service 触发换票重试
        if (
            message.includes("401") ||
            message.includes("403") ||
            message.includes("Unauthorized")
        ) {
            throw new Error(`Grok Bot 会话已失效 (401): ${message}`);
        }
        sand_err = message;
    }

    const now = Date.now();
    const observations: ScriptObservation[] = [];

    // 周用量 (Weekly Usage)
    if (
        sand_res &&
        typeof sand_res.usagePercent === "number" &&
        Number.isFinite(sand_res.usagePercent)
    ) {
        const pct = Math.max(0, Math.min(100, sand_res.usagePercent));
        const reset_at = parse_timestamp(sand_res.nextResetTimestampUtc);
        observations.push({
            provider: "grok_bot",
            account_id,
            account_label,
            metric_id: "grok_bot:weekly",
            raw_label: "weekly_usage",
            normalized_label: "周用量",
            window: "week",
            cycleDurationMs: 7 * 24 * 3600 * 1000,
            used: pct,
            limit: 100,
            display_style: "percent",
            reset_at,
            status: ctx.status.for_pct(pct),
            observed_at: now,
            source: "poll",
            stale: false,
            last_error: null,
        });
    }

    if (observations.length === 0) {
        const err_desc = sand_err ?? "no usable usage data returned";
        ctx.report_failed_account("grok_bot", account_id, account_label, err_desc);
    }

    return observations;
}

void main;
