// UsageBoardPlugin:
// {
//   "schemaVersion": 1,
//   "name": "MiMo",
//   "supportedProviders": ["mimo"],
//   "defaultSource": "direct",
//   "name@zh-Hans": "MiMo",
//   "name@en": "MiMo",
//   "description": "查询小米 MiMo 开放平台用量。Cookie 必须包含 api-platform_serviceToken，否则会 401",
//   "description@zh-Hans": "查询小米 MiMo 开放平台用量。Cookie 必须包含 api-platform_serviceToken，否则会 401",
//   "description@en": "Query Xiaomi MiMo platform usage. Cookie must include api-platform_serviceToken or you'll get 401",
//   "parameters": [
//     {
//       "name": "SESSION_COOKIE",
//       "label": "Cookie",
//       "label@zh-Hans": "Cookie",
//       "label@en": "Cookie",
//       "type": "secret",
//       "required": true,
//       "description": "获取方式：打开 platform.xiaomimimo.com 并登录，F12 → Network → 刷新页面 → 点击任意 api 请求 → 复制 Request Headers 中的完整 Cookie 值。注意：document.cookie 无法获取 httpOnly 的 serviceToken",
//       "description@zh-Hans": "获取方式：打开 platform.xiaomimimo.com 并登录，F12 → Network → 刷新页面 → 点击任意 api 请求 → 复制 Request Headers 中的完整 Cookie 值。注意：document.cookie 无法获取 httpOnly 的 serviceToken",
//       "description@en": "How to get: open platform.xiaomimimo.com and login, F12 → Network → refresh → click any API request → copy full Cookie from Request Headers. Note: document.cookie cannot access httpOnly serviceToken",
//       "placeholder": "cookie-preferences=...; api-platform_serviceToken=..."
//     }
//   ],
//   "endpoints": {
//     "default": "https://platform.xiaomimimo.com"
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

const METADATA_ENDPOINTS = { default: "https://platform.xiaomimimo.com" };
const SOURCE_INSTANCE_ID = process.env.OMNI_SOURCE_INSTANCE_ID ?? "unknown-source";

const translations = {
    plan_quota: { "zh-Hans": "套餐额度", en: "Plan Quota" },
    compensation: { "zh-Hans": "补偿积分", en: "Compensation" },
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

definePlugin(
    async (ctx) => {
        const cookie = requireParam(ctx.params, "SESSION_COOKIE");
        const headers = { Cookie: cookie };

        const [usageResult, detailResult] = await Promise.all([
            ctx.http.getJson<UsagePayload>("default", "/api/v1/tokenPlan/usage", { headers }),
            ctx.http.getJson<DetailPayload>("default", "/api/v1/tokenPlan/detail", { headers }),
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
                displayStyle: "ratio" as const,
                ...(resetAt && { resetAt }),
                status: statusFor(item.used, item.limit),
                color: colorFor(item.used, item.limit),
            };
        });

        return ok({ items, badge: planName });
    },
    { metadata: { endpoints: METADATA_ENDPOINTS }, translations },
);
