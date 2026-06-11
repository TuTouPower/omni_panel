// UsageBoardPlugin:
// {
//   "schemaVersion": 1,
//   "name": "MiMo",
//   "supportedProviders": ["mimo"],
//   "defaultSource": "direct",
//   "name@zh-Hans": "MiMo",
//   "name@en": "MiMo",
//   "description": "查询小米 MiMo 开放平台用量",
//   "description@zh-Hans": "查询小米 MiMo 开放平台用量",
//   "description@en": "Query Xiaomi MiMo platform usage",
//   "parameters": [
//     {
//       "name": "SESSION_COOKIE",
//       "label": "Cookie",
//       "label@zh-Hans": "Cookie",
//       "label@en": "Cookie",
//       "type": "secret",
//       "required": true,
//       "description": "包含 api-platform_serviceToken、api-platform_slh、api-platform_ph 的完整 Cookie。推荐点击「网页登录」自动获取。",
//       "description@zh-Hans": "包含 api-platform_serviceToken、api-platform_slh、api-platform_ph 的完整 Cookie。推荐点击「网页登录」自动获取。",
//       "description@en": "Full Cookie string containing api-platform_serviceToken, api-platform_slh, api-platform_ph. Use the Login button to auto-fill.",
//       "placeholder": "api-platform_serviceToken=...; api-platform_slh=...（点击「网页登录」可自动填入）"
//     },
//     {
//       "name": "LIMIT",
//       "label": "Amount Limit",
//       "label@zh-Hans": "金额上限",
//       "label@en": "Amount Limit",
//       "type": "integer",
//       "required": false,
//       "defaultValue": "100",
//       "placeholder": "100"
//     }
//   ],
//   "endpoints": {
//     "default": "https://platform.xiaomimimo.com",
//     "login": "https://platform.xiaomimimo.com/console/plan-manage"
//   }
// }
// /UsageBoardPlugin

import {
    definePlugin,
    requireParam,
    ok,
    fail,
    failFromHttp,
    statusFor,
    colorFor,
    numeric,
} from "@omni-usage/plugin-sdk";

const METADATA_ENDPOINTS = {
    default: "https://platform.xiaomimimo.com",
    login: "https://platform.xiaomimimo.com/console/plan-manage",
};
const SOURCE_INSTANCE_ID = process.env.OMNI_SOURCE_INSTANCE_ID ?? "unknown-source";
const DEFAULT_LIMIT = 100;

function parseLimit(raw: string): number {
    const value = Number(raw);
    return value > 0 ? value : DEFAULT_LIMIT;
}

const translations = {
    plan_quota: { "zh-Hans": "套餐额度", en: "Plan Quota" },
    compensation: { "zh-Hans": "补偿积分", en: "Compensation" },
    balance: { "zh-Hans": "余额", en: "Balance" },
    invalid_response: { "zh-Hans": "响应数据格式异常", en: "Invalid response format" },
    expired: { "zh-Hans": "已过期", en: "Expired" },
};

interface UsageItemPayload {
    name: string;
    used: number;
    limit: number;
    percent: number;
}

interface UsagePayload {
    code: number;
    message?: string;
    data?: {
        usage?: {
            items?: UsageItemPayload[];
        };
    };
}

interface DetailPayload {
    code: number;
    message?: string;
    data?: {
        planCode?: string;
        planName?: string;
        currentPeriodEnd?: string;
        expired?: boolean;
    };
}

interface BalancePayload {
    code: number;
    message?: string;
    data?: {
        balance?: number | string;
        totalConsumption?: number | string;
        totalRecharge?: number | string;
    };
}

definePlugin(
    async (ctx) => {
        const cookie = requireParam(ctx.params, "SESSION_COOKIE");
        const limitAmount = parseLimit(ctx.params.LIMIT ?? "");
        const headers = {
            Cookie: cookie,
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
            Referer: "https://platform.xiaomimimo.com/console/plan-manage",
            Origin: "https://platform.xiaomimimo.com",
            "x-timeZone": "Asia/Shanghai",
            Accept: "*/*",
            "Accept-Language": "zh",
            "Content-Type": "application/json",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
        };

        const [usageResult, detailResult, balanceResult] = await Promise.all([
            ctx.http.getJson<UsagePayload>("default", "/api/v1/tokenPlan/usage", { headers }),
            ctx.http.getJson<DetailPayload>("default", "/api/v1/tokenPlan/detail", { headers }),
            ctx.http.getJson<BalancePayload>("default", "/api/v1/balance", { headers }),
        ]);

        if (!usageResult.ok) return failFromHttp(usageResult.error, "mimo");
        if (!detailResult.ok) return failFromHttp(detailResult.error, "mimo");

        const usage = usageResult.value;
        const detail = detailResult.value;

        if (usage.code !== 0 || !usage.data?.usage?.items) {
            return fail("MIMO_PARSE_ERROR", usage.message ?? ctx.t("invalid_response"));
        }

        const planName = detail.data?.planName ?? "MiMo";
        const resetAt = detail.data?.currentPeriodEnd
            ? new Date(detail.data.currentPeriodEnd).toISOString()
            : null;

        const itemContext = {
            provider: "mimo" as const,
            source: "direct" as const,
            sourceInstanceId: SOURCE_INSTANCE_ID,
            accountId: SOURCE_INSTANCE_ID,
            accountLabel: planName,
        };

        const items = usage.data.usage.items.map((item) => {
            const label =
                item.name === "plan_total_token"
                    ? ctx.t("plan_quota")
                    : item.name === "compensation_total_token"
                      ? ctx.t("compensation")
                      : item.name;

            return {
                id: `mimo-${item.name}`,
                ...itemContext,
                name: label,
                used: item.used,
                limit: item.limit,
                displayStyle: "percent" as const,
                ...(resetAt && { resetAt }),
                status: statusFor(item.used, item.limit),
                color: colorFor(item.used, item.limit),
            };
        });

        // Balance: non-blocking — if it fails, still return usage items.
        // Displayed as a ratio bar (balance / limit) like DeepSeek.
        if (balanceResult.ok && balanceResult.value.code === 0 && balanceResult.value.data) {
            const balanceData = balanceResult.value.data;
            const balance = numeric(balanceData.balance ?? 0);
            if (Number.isFinite(balance)) {
                items.push({
                    id: "mimo-balance",
                    ...itemContext,
                    name: ctx.t("balance"),
                    used: Math.round(balance * 100) / 100,
                    limit: Math.round(limitAmount * 100) / 100,
                    displayStyle: "ratio" as const,
                    status: balance >= 0 ? "normal" : "critical",
                    color: balance >= 0 ? "blue" : "red",
                });
            }
        }

        return ok({ items, badge: planName });
    },
    { metadata: { endpoints: METADATA_ENDPOINTS }, translations },
);
