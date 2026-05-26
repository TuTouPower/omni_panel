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

import {
    definePlugin,
    requireParam,
    fetchJson,
    ok,
    fail,
    makeTranslator,
    appLanguage,
    numeric,
} from "@omni-usage/plugin-sdk";

const ENDPOINT = "https://api.deepseek.com/user/balance";
const DEFAULT_LIMIT = 100;

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

const translations = {
    balance: { "zh-Hans": "余额", en: "Balance" },
};

interface BalanceInfo {
    currency: string;
    total_balance: string;
}
interface BalanceResponse {
    balance_infos: BalanceInfo[];
}

definePlugin(async ({ params }) => {
    const apiKey = requireParam(params, "API_KEY");
    const language = appLanguage(params);
    const translate = makeTranslator(translations);
    const limitAmount = parseLimit(params.LIMIT ?? "");

    let data: BalanceResponse;
    try {
        data = await fetchJson<BalanceResponse>(ENDPOINT, {
            headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        });
    } catch (err) {
        if (err instanceof Error && "statusCode" in err) {
            const s = (err as { statusCode: number }).statusCode;
            if (s === 401) return fail("AUTH_FAILED", translate(language, "missing_api_key"));
            if (s === 429) return fail("RATE_LIMITED", "Rate limited. Try again later.");
            if (s >= 500) return fail("SERVER_ERROR", `Service unavailable (HTTP ${String(s)})`);
            return fail("HTTP_ERROR", `HTTP ${String(s)} from ${ENDPOINT}`);
        }
        return fail("NETWORK_ERROR", translate(language, "network_error"));
    }

    try {
        const items = data.balance_infos.map((info) => {
            const currency = info.currency;
            const totalBalance = numeric(info.total_balance);
            const suffix = currency !== "CNY" ? ` (${currency})` : "";
            return {
                id: `balance-${currency}`,
                name: `${translate(language, "balance")}${suffix}`,
                used: Math.round(totalBalance * 100) / 100,
                limit: Math.round(limitAmount * 100) / 100,
                displayStyle: "ratio" as const,
                status: "normal" as const,
                color: colorForBalance(totalBalance, limitAmount),
            };
        });

        return ok({ items });
    } catch {
        return fail("PARSE_ERROR", translate(language, "usage_parse_failed"));
    }
});
