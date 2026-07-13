import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { ScriptObservation } from "../../src/shared/types/observation";

declare const ctx: ConnectorContext;

interface UsageWindow {
    readonly usagePercent?: number;
    readonly used?: number;
    readonly resetInSec?: number;
}

interface UsagePayload {
    readonly rollingUsage?: UsageWindow;
    readonly weeklyUsage?: UsageWindow;
    readonly monthlyUsage?: UsageWindow;
}

const SERVER_ARGS_PREFIX = "/_server?id=";
const SERVER_ARGS = { t: { t: 9, i: 0, l: 1, a: [{ t: 1, s: "" }], o: 0 }, f: 31, m: [] };
const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

function required_cookie(): string {
    const cookie = (ctx.params["SESSION_COOKIE"] ?? "").trim();
    if (!cookie) throw new Error("Missing required secret: SESSION_COOKIE");
    return cookie;
}

function header_value(headers: Record<string, string>, name: string): string | undefined {
    const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return match?.[1];
}

function extract_workspace_id(location: string | undefined): string | null {
    if (!location) return null;
    const match = /\/workspace\/([^/?#]+)/.exec(location);
    return match?.[1] ?? null;
}

function extract_assets(html: string): string[] {
    const assets = new Set<string>();
    const regex = /["'](\/_build\/assets\/[^"']+\.js)["']/g;
    for (const match of html.matchAll(regex)) {
        const asset = match[1];
        if (asset) assets.add(asset);
    }
    return [...assets];
}

function escape_regex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function subscription_hash_from_query(bundle: string): string | null {
    const references = new Map<string, string>();
    const reference_regex =
        /(?:const\s+)?(\w+)\s*=\s*createServerReference\(["']([a-f0-9]{64})["']/gi;
    for (const match of bundle.matchAll(reference_regex)) {
        const variable_name = match[1];
        const hash = match[2];
        if (variable_name && hash) references.set(variable_name, hash);
    }

    for (const [variable_name, hash] of references) {
        const usage_regex = new RegExp(
            `(?:query|action)\\(\\s*${escape_regex(variable_name)}\\s*,\\s*["']lite\\.subscription\\.get["']`,
        );
        if (usage_regex.test(bundle)) return hash;
    }

    return null;
}

function nearest_subscription_hash(bundle: string): string | null {
    const query_hash = subscription_hash_from_query(bundle);
    if (query_hash) return query_hash;

    const target = bundle.indexOf("lite.subscription.get");
    if (target < 0) return null;

    let best_hash: string | null = null;
    let best_distance = Number.POSITIVE_INFINITY;
    const regex = /createServerReference\(["']([a-f0-9]{64})["']\)/gi;
    for (const match of bundle.matchAll(regex)) {
        const hash = match[1];
        if (!hash) continue;
        const distance = Math.abs(match.index - target);
        if (distance < best_distance) {
            best_hash = hash;
            best_distance = distance;
        }
    }
    return best_hash;
}

function parse_window_fields(content: string): UsageWindow | null {
    const usage_match = /usagePercent:(\d+(?:\.\d+)?)/.exec(content);
    const reset_match = /resetInSec:(\d+)/.exec(content);
    if (!usage_match) return null;
    return {
        usagePercent: Number(usage_match[1]),
        resetInSec: reset_match ? Number(reset_match[1]) : 0,
    };
}

function extract_window(text: string, window_name: string): UsageWindow | null {
    const index = text.indexOf(window_name);
    if (index < 0) return null;
    const section = text.slice(index, index + 300);
    const escaped_window_name = escape_regex(window_name);

    const reference = new RegExp(`${escaped_window_name}:\\$R\\[(\\d+)\\]`).exec(section);
    if (reference?.[1]) {
        const definition = new RegExp(`\\$R\\[${reference[1]}\\]=\\{([^}]+)\\}`).exec(text);
        if (definition?.[1]) return parse_window_fields(definition[1]);
    }

    const inline = new RegExp(`${escaped_window_name}:(?:\\$R\\[\\d+\\]=)?\\{([^}]+)\\}`).exec(
        section,
    );
    if (inline?.[1]) return parse_window_fields(inline[1]);
    return parse_window_fields(section);
}

function parse_usage_payload(text: string): UsagePayload {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
        try {
            return JSON.parse(text.slice(start, end + 1)) as UsagePayload;
        } catch {
            // OpenCode's server response is often JavaScript with $R references.
        }
    }

    const rolling_usage = extract_window(text, "rollingUsage");
    const weekly_usage = extract_window(text, "weeklyUsage");
    const monthly_usage = extract_window(text, "monthlyUsage");
    return {
        ...(rolling_usage ? { rollingUsage: rolling_usage } : {}),
        ...(weekly_usage ? { weeklyUsage: weekly_usage } : {}),
        ...(monthly_usage ? { monthlyUsage: monthly_usage } : {}),
    };
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function status_for_usage(used: number): ScriptObservation["status"] {
    if (used >= 90) return "critical";
    if (used >= 75) return "warning";
    return "normal";
}

function observation(
    workspace_id: string,
    account_label: string,
    raw_label: "rolling" | "weekly" | "monthly",
    normalized_label: string,
    window: ScriptObservation["window"],
    usage: UsageWindow,
    now: number,
): ScriptObservation {
    const used = to_number(usage.usagePercent ?? usage.used);
    const reset_in_sec = to_number(usage.resetInSec);
    return {
        provider: "opencode_go",
        account_id: workspace_id,
        account_label,
        metric_id: `opencode_go:${raw_label}`,
        raw_label,
        normalized_label,
        window,
        used,
        limit: 100,
        display_style: "percent",
        reset_at: now + reset_in_sec * 1000,
        status: status_for_usage(used),
        observed_at: now,
        source: "session",
        stale: false,
        last_error: null,
    };
}

async function main(): Promise<ScriptObservation[]> {
    const cookie = required_cookie();
    const headers = {
        Cookie: cookie,
        "User-Agent": USER_AGENT,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    };

    const auth = await ctx.http.get_raw("login", "/auth", { headers });
    const workspace_id = extract_workspace_id(header_value(auth.headers, "location"));
    if (auth.status < 300 || auth.status >= 400 || !workspace_id) {
        throw new Error("Cookie 可能已失效，未跳转到 workspace");
    }

    const [workspace, go_page] = await Promise.all([
        ctx.http.get_raw("default", `/workspace/${workspace_id}`, { headers }),
        ctx.http.get_raw("default", `/workspace/${workspace_id}/go`, { headers }),
    ]);

    const asset_paths = [...extract_assets(workspace.body), ...extract_assets(go_page.body)];
    const bundles = await Promise.all(
        asset_paths.map((path) =>
            ctx.http.get_raw("default", path, { headers }).then((res) => res.body),
        ),
    );
    const hash = bundles
        .map(nearest_subscription_hash)
        .find((value): value is string => Boolean(value));
    if (!hash) throw new Error("OpenCode Go 页面协议可能已变更");

    const args = {
        ...SERVER_ARGS,
        t: { ...SERVER_ARGS.t, a: [{ t: 1, s: workspace_id }] },
    };
    const server_path = `${SERVER_ARGS_PREFIX}${hash}&args=${encodeURIComponent(JSON.stringify(args))}`;
    const server_response = await ctx.http.get_raw("default", server_path, {
        headers: {
            ...headers,
            Accept: "*/*",
            Referer: `https://opencode.ai/workspace/${workspace_id}`,
            "x-server-id": hash,
            "x-server-instance": "server-fn:0",
        },
    });
    const usage = parse_usage_payload(server_response.body);

    if (!usage.rollingUsage || !usage.weeklyUsage || !usage.monthlyUsage) {
        throw new Error("OpenCode Go usage response invalid");
    }

    const now = Date.now();
    return [
        observation(
            workspace_id,
            workspace_id,
            "rolling",
            "滚动",
            "second",
            usage.rollingUsage,
            now,
        ),
        observation(workspace_id, workspace_id, "weekly", "一周", "day", usage.weeklyUsage, now),
        observation(
            workspace_id,
            workspace_id,
            "monthly",
            "一月",
            "month",
            usage.monthlyUsage,
            now,
        ),
    ];
}

void main;
