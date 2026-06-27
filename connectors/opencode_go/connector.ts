import type { ConnectorContext } from "../../src/main/core/connector/host-io";
import type { Observation } from "../../src/shared/types/observation";

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

function nearest_subscription_hash(bundle: string): string | null {
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

function parse_json_object(text: string): UsagePayload {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("OpenCode Go usage response invalid");
    return JSON.parse(text.slice(start, end + 1)) as UsagePayload;
}

function to_number(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function status_for_usage(used: number): Observation["status"] {
    if (used >= 90) return "critical";
    if (used >= 75) return "warning";
    return "normal";
}

function observation(
    workspace_id: string,
    account_label: string,
    raw_label: "rolling" | "weekly" | "monthly",
    normalized_label: string,
    window: Observation["window"],
    usage: UsageWindow,
    now: number,
): Observation {
    const used = to_number(usage.usagePercent ?? usage.used);
    const reset_in_sec = to_number(usage.resetInSec);
    return {
        provider: "opencode_go",
        source_instance_id: workspace_id,
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

async function main(): Promise<Observation[]> {
    const cookie = required_cookie();
    const headers = { Cookie: cookie };

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
    const server_response = await ctx.http.get_raw("default", server_path, { headers });
    const usage = parse_json_object(server_response.body);

    if (!usage.rollingUsage || !usage.weeklyUsage || !usage.monthlyUsage) {
        throw new Error("OpenCode Go usage response invalid");
    }

    const now = Date.now();
    const account_label = (ctx.params["ACCOUNT_LABEL"] ?? "").trim() || workspace_id;
    return [
        observation(
            workspace_id,
            account_label,
            "rolling",
            "滚动",
            "second",
            usage.rollingUsage,
            now,
        ),
        observation(workspace_id, account_label, "weekly", "一周", "day", usage.weeklyUsage, now),
        observation(
            workspace_id,
            account_label,
            "monthly",
            "一月",
            "month",
            usage.monthlyUsage,
            now,
        ),
    ];
}

void main;
