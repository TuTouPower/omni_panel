// UsageBoardPlugin:
// {
//   "schemaVersion": 1,
//   "name": "Tavily",
//   "name@zh-Hans": "Tavily",
//   "name@en": "Tavily",
//   "icon": "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/tavily-color.png",
//   "description": "查询 Tavily Search 月度用量",
//   "description@zh-Hans": "查询 Tavily Search 月度用量",
//   "description@en": "Query Tavily Search monthly usage",
//   "parameters": [
//     {
//       "name": "API_KEY",
//       "label": "Api Key",
//       "label@zh-Hans": "Api Key",
//       "label@en": "API Key",
//       "type": "secret",
//       "required": true,
//       "placeholder": "Tavily API Key"
//     }
//   ]
// }
// /UsageBoardPlugin

import {
    definePlugin,
    requireParam,
    ok,
    failFromHttp,
    numeric,
    statusFor,
    colorFor,
} from "@omni-usage/plugin-sdk";

const METADATA_ENDPOINTS = { default: "https://api.tavily.com" };

function nextMonthStartIso(): string {
    const now = new Date();
    const nextMonth = now.getUTCMonth() + 1 <= 11 ? now.getUTCMonth() + 1 : 0;
    const nextYear = now.getUTCMonth() + 1 <= 11 ? now.getUTCFullYear() : now.getUTCFullYear() + 1;
    return `${String(nextYear)}-${String(nextMonth + 1).padStart(2, "0")}-01T00:00:00Z`;
}

const translations = {
    total_usage: { "zh-Hans": "总用量", en: "Total usage" },
    search: { "zh-Hans": "搜索", en: "Search" },
    crawl: { "zh-Hans": "爬取", en: "Crawl" },
    extract: { "zh-Hans": "提取", en: "Extract" },
    map: { "zh-Hans": "地图", en: "Map" },
    research: { "zh-Hans": "研究", en: "Research" },
    no_quota_items: { "zh-Hans": "未获取到用量数据", en: "No usage data found." },
};

interface AccountPayload {
    plan_limit?: unknown;
    plan_usage?: unknown;
    search_usage?: unknown;
    crawl_usage?: unknown;
    extract_usage?: unknown;
    map_usage?: unknown;
    research_usage?: unknown;
}

interface UsagePayload {
    account?: AccountPayload;
}

definePlugin(
    async (ctx) => {
        const apiKey = requireParam(ctx.params, "API_KEY");

        const result = await ctx.http.getJson<UsagePayload>("default", "/usage", {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!result.ok) return failFromHttp(result.error, "tavily");

        try {
            const account = result.value.account;
            if (typeof account !== "object")
                return failFromHttp({ kind: "invalid_json", status: 200, raw: "" }, "tavily");
            const planLimit = numeric(account.plan_limit);
            if (planLimit <= 0)
                return failFromHttp({ kind: "invalid_json", status: 200, raw: "" }, "tavily");
            const planUsage = numeric(account.plan_usage);
            const resetAt = nextMonthStartIso();

            const items = [
                {
                    id: "tavily-total-month",
                    name: ctx.t("total_usage"),
                    used: Math.max(planUsage, 0),
                    limit: Math.max(planLimit, 0),
                    displayStyle: "ratio" as const,
                    resetAt,
                    status: statusFor(planUsage, planLimit),
                    color: colorFor(planUsage, planLimit),
                },
            ];

            const details: [string, string, keyof AccountPayload][] = [
                ["tavily-search", "search", "search_usage"],
                ["tavily-crawl", "crawl", "crawl_usage"],
                ["tavily-extract", "extract", "extract_usage"],
                ["tavily-map", "map", "map_usage"],
                ["tavily-research", "research", "research_usage"],
            ];

            for (const [itemId, nameKey, usageKey] of details) {
                const used = numeric(account[usageKey]);
                if (used > 0) {
                    items.push({
                        id: itemId,
                        name: ctx.t(nameKey),
                        used: Math.max(used, 0),
                        limit: Math.max(planUsage, 0),
                        displayStyle: "ratio" as const,
                        status: statusFor(used, planUsage),
                        color: colorFor(used, planUsage),
                    });
                }
            }

            return ok({ items });
        } catch {
            return failFromHttp({ kind: "invalid_json", status: 200, raw: "" }, "tavily");
        }
    },
    { metadata: { endpoints: METADATA_ENDPOINTS }, translations },
);
