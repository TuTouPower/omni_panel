import { readFileSync } from "node:fs";

/**
 * @typedef {{ port: number, url: string, pid: number, userData: string, startedAt: string }} CliInstanceInfo
 */

/**
 * cli.json 契约解析（t344）：缺字段/类型错误返回可读错误，避免 any 透传。
 * 字段契约见 src/main/cli/cli-json.ts（port/url/pid/userData/startedAt）。
 * @param {unknown} path
 * @returns {{ ok: true, info: CliInstanceInfo } | { ok: false, error: string }}
 */
export function parse_cli_json(path) {
    if (typeof path !== "string" || path.length === 0) {
        return { ok: false, error: "cli.json 路径为空或缺失" };
    }
    let raw;
    try {
        raw = readFileSync(path, "utf8");
    } catch (error) {
        return {
            ok: false,
            error: `读取 cli.json 失败：${error instanceof Error ? error.message : String(error)}`,
        };
    }
    if (typeof raw !== "string" || raw.length === 0) {
        return { ok: false, error: "cli.json 为空或缺失" };
    }
    /** @type {unknown} */
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        return {
            ok: false,
            error: `cli.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
        };
    }
    if (typeof parsed !== "object" || parsed === null) {
        return { ok: false, error: "cli.json 根节点须为对象" };
    }
    /** @type {Record<string, unknown>} */
    const info = parsed;
    if (typeof info["port"] !== "number")
        return { ok: false, error: "cli.json 缺 number 字段 port" };
    if (typeof info["url"] !== "string") return { ok: false, error: "cli.json 缺 string 字段 url" };
    if (typeof info["pid"] !== "number") return { ok: false, error: "cli.json 缺 number 字段 pid" };
    /** @type {CliInstanceInfo} */
    const validated = {
        port: info["port"],
        url: info["url"],
        pid: info["pid"],
        userData: typeof info["userData"] === "string" ? info["userData"] : "",
        startedAt: typeof info["startedAt"] === "string" ? info["startedAt"] : "",
    };
    return { ok: true, info: validated };
}
