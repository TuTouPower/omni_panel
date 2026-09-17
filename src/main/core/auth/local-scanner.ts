import { readFile } from "node:fs/promises";
import { homedir as os_homedir } from "node:os";
import { join } from "node:path";
import type { LocalScanResult } from "../../../shared/types/ipc";

export interface LocalScannerDeps {
    read_file?: (path: string) => Promise<string>;
    homedir?: () => string;
}

const LOCAL_AUTH_PATHS: Record<string, string[]> = {
    codex: [".codex/auth.json"],
    claude: [".claude/.credentials.json", ".config/claude/auth.json"],
    antigravity: [".antigravity/session.json"],
};

function parse_jwt_payload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2 || !parts[1]) return null;
        const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const json = Buffer.from(normalized, "base64").toString("utf8");
        const parsed: unknown = JSON.parse(json);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        return null;
    } catch {
        return null;
    }
}

export async function scan_local_auth(
    vendor_id: string,
    deps: LocalScannerDeps = {},
): Promise<LocalScanResult> {
    const rel_paths = LOCAL_AUTH_PATHS[vendor_id];
    if (!rel_paths || rel_paths.length === 0) {
        return { found: false, path: "" };
    }

    const read = deps.read_file ?? ((p: string) => readFile(p, "utf8"));
    const home = deps.homedir ? deps.homedir() : os_homedir();

    for (const rel of rel_paths) {
        const full_path = join(home, rel);
        let content: string;
        try {
            content = await read(full_path);
        } catch {
            continue;
        }

        if (vendor_id === "codex") {
            try {
                const parsed: unknown = JSON.parse(content);
                if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                    return {
                        found: true,
                        path: full_path,
                        details: { valid: false, error: "授权文件格式错误" },
                    };
                }
                const obj = parsed as Record<string, unknown>;
                const tokens =
                    typeof obj["tokens"] === "object" && obj["tokens"] !== null
                        ? (obj["tokens"] as Record<string, unknown>)
                        : undefined;

                const access_token =
                    (typeof tokens?.["access_token"] === "string"
                        ? tokens["access_token"]
                        : undefined) ??
                    (typeof obj["access_token"] === "string" ? obj["access_token"] : undefined);

                const account_id =
                    (typeof tokens?.["account_id"] === "string"
                        ? tokens["account_id"]
                        : undefined) ??
                    (typeof obj["account_id"] === "string" ? obj["account_id"] : undefined);

                let email: string | undefined =
                    typeof obj["email"] === "string" ? obj["email"] : undefined;

                const id_token =
                    typeof tokens?.["id_token"] === "string" ? tokens["id_token"] : undefined;
                if (id_token && !email) {
                    const jwt = parse_jwt_payload(id_token);
                    if (jwt && typeof jwt["email"] === "string") {
                        email = jwt["email"];
                    }
                }

                if (!access_token || access_token.trim() === "") {
                    return {
                        found: true,
                        path: full_path,
                        details: { valid: false, error: "未发现有效凭据 (access_token 缺失)" },
                    };
                }

                return {
                    found: true,
                    path: full_path,
                    details: {
                        valid: true,
                        ...(email ? { email } : {}),
                        ...(account_id ? { accountId: account_id } : {}),
                    },
                };
            } catch (err: unknown) {
                return {
                    found: true,
                    path: full_path,
                    details: {
                        valid: false,
                        error: err instanceof Error ? err.message : "解析失败",
                    },
                };
            }
        }

        // 通用 vendor（如 claude, antigravity）
        try {
            const parsed: unknown = JSON.parse(content);
            const valid = typeof parsed === "object" && parsed !== null;
            return {
                found: true,
                path: full_path,
                details: { valid },
            };
        } catch {
            return {
                found: true,
                path: full_path,
                details: { valid: false, error: "授权文件格式错误" },
            };
        }
    }

    return { found: false, path: join(home, rel_paths[0] ?? "") };
}
