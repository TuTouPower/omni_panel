/**
 * CLI 实例发现文件 `cli.json`（t275）。
 *
 * `serve` 启动成功后把实例发现信息写入 `<dataRoot>/cli.json`，供后续瘦客户端
 * （t276）读取端口与面板地址，无需扫描进程。启动时重写；实例退出后文件保留（端口即
 * 失效），瘦客户端以「连接失败」判断实例未运行。
 */
import { join } from "node:path";
import { writeFileAtomic } from "../core/storage/write-json";

export interface CliInstanceInfo {
    port: number;
    url: string;
    pid: number;
    userData: string;
    startedAt: string;
}

export function cli_json_path(dataRoot: string): string {
    return join(dataRoot, "cli.json");
}

export async function write_cli_json(
    dataRoot: string,
    info: Omit<CliInstanceInfo, "pid" | "startedAt">,
): Promise<void> {
    const full: CliInstanceInfo = {
        ...info,
        pid: process.pid,
        startedAt: new Date().toISOString(),
    };
    await writeFileAtomic(cli_json_path(dataRoot), JSON.stringify(full, null, 2));
}
