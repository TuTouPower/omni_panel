export interface CliInstanceInfo {
    port: number;
    url: string;
    pid: number;
    userData: string;
    startedAt: string;
}

export function parse_cli_json(
    path: unknown,
): { ok: true; info: CliInstanceInfo } | { ok: false; error: string };
