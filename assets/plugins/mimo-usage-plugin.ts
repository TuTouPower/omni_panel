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
} from "@omni-usage/plugin-sdk";

const METADATA_ENDPOINTS = {
    default: "https://platform.xiaomimimo.com",
    login: "https://platform.xiaomimimo.com/console/plan-manage",
};
const SOURCE_INSTANCE_ID = process.env.OMNI_SOURCE_INSTANCE_ID ?? "unknown-source";

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
        balance?: number;
        totalConsumption?: number;
        totalRecharge?: number;
    };
}

definePlugin(
    async (ctx) => {
        const cookie = requireParam(ctx.params, "SESSION_COOKIE");
        const headers = { Cookie: cookie };

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

        // Balance: non-blocking — if it fails, still return usage items
        if (balanceResult.ok && balanceResult.value.code === 0 && balanceResult.value.data) {
            const balanceData = balanceResult.value.data;
            const balance = balanceData.balance ?? 0;
            items.push({
                id: "mimo-balance",
                ...itemContext,
                name: ctx.t("balance"),
                used: balance,
                limit: balance >= 0 ? 0 : Math.abs(balance),
                displayStyle: "ratio" as const,
                status: balance >= 0 ? "normal" : "critical",
                color: balance >= 0 ? "blue" : "red",
            });
        }

        return ok({ items, badge: planName });
    },
    { metadata: { endpoints: METADATA_ENDPOINTS }, translations },
);
