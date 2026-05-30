// UsageBoardPlugin:
// {
//   "schemaVersion": 1,
//   "name": "DeepSeek",
//   "name@zh-Hans": "DeepSeek",
//   "name@en": "DeepSeek",
//   "icon": "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/deepseek-color.png",
//   "description": "查询 DeepSeek API 余额",
//   "description@zh-Hans": "查询 DeepSeek API 余额",
//   "description@en": "Query DeepSeek API balance",
//   "parameters": [
//     {
//       "name": "API_KEY",
//       "label": "Api Key",
//       "label@zh-Hans": "Api Key",
//       "label@en": "API Key",
//       "type": "secret",
//       "required": true,
//       "placeholder": "DeepSeek API Key"
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
//   ]
// }
// /UsageBoardPlugin

import { definePlugin, requireParam, ok, failFromHttp, numeric } from "@omni-usage/plugin-sdk";

const METADATA_ENDPOINTS = { default: "https://api.deepseek.com" };
const DEFAULT_LIMIT = 100;

const translations = {
    balance: { "zh-Hans": "余额", en: "Balance" },
};

function parseLimit(raw: string): number {
    const value = Number(raw);
    return value > 0 ? value : DEFAULT_LIMIT;
}

function colorForBalance(
    balance: number,
    limit: number,
): "blue" | "yellow" | "orange" | "red" | undefined {
    if (limit <= 0) return undefined;
    const ratio = balance / limit;
    if (ratio <= 0.1) return "red";
    if (ratio <= 0.2) return "orange";
    if (ratio <= 0.4) return "yellow";
    return "blue";
}

interface BalanceInfo {
    currency: string;
    total_balance: string;
}
interface BalanceResponse {
    balance_infos: BalanceInfo[];
}

definePlugin(
    async (ctx) => {
        const apiKey = requireParam(ctx.params, "API_KEY");
        const limitAmount = parseLimit(ctx.params.LIMIT ?? "");

        const result = await ctx.http.getJson<BalanceResponse>("default", "/user/balance", {
            headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        });
        if (!result.ok) return failFromHttp(result.error, "deepseek");

        try {
            const items = result.value.balance_infos.map((info) => {
                const currency = info.currency;
                const totalBalance = numeric(info.total_balance);
                const suffix = currency !== "CNY" ? ` (${currency})` : "";
                return {
                    id: `balance-${currency}`,
                    name: `${ctx.t("balance")}${suffix}`,
                    used: Math.round(totalBalance * 100) / 100,
                    limit: Math.round(limitAmount * 100) / 100,
                    displayStyle: "ratio" as const,
                    status: "normal" as const,
                    color: colorForBalance(totalBalance, limitAmount),
                };
            });

            return ok({ items });
        } catch {
            return failFromHttp({ kind: "invalid_json", status: 200, raw: "" }, "deepseek");
        }
    },
    { metadata: { endpoints: METADATA_ENDPOINTS }, translations },
);
