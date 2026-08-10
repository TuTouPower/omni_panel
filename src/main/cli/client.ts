/**
 * CLI 瘦客户端（t276）：控制子命令经 local-api 作用于运行中实例，执行完即退出。
 *
 * 实例发现：默认读 `<dataRoot>/cli.json` 取得端口；`--port` 覆盖。cli.json 缺失/
 * 端口连接失败 → 「实例未运行」可读错误 + 非零退出码（AC6）。
 */
import { existsSync, readFileSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { get as httpGet, request as httpRequest } from "node:http";
import { cli_json_path, type CliInstanceInfo } from "./cli-json";
import { getDataRoot } from "../core/paths";
import type { CliExportOptions } from "./args";

function write_stdout(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        process.stdout.write(text, (error?: Error | null) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

export interface ControlClientDeps {
    dataRoot?: string;
    /** stdout 输出（可注入测试）。 */
    write?: (text: string) => void | Promise<void>;
}

export type ControlCommand =
    | "open"
    | "refresh-all"
    | "pause"
    | "resume"
    | "restart"
    | "quit"
    | "autostart";

export interface ResolvedInstance {
    port: number;
    url: string;
}

/** 读 cli.json 取得运行实例端口；cli.json 缺失或异常抛「实例未运行」。 */
export function resolve_instance(deps: ControlClientDeps, portOverride?: number): ResolvedInstance {
    const dataRoot = deps.dataRoot ?? getDataRoot();
    if (portOverride !== undefined) {
        return { port: portOverride, url: `http://localhost:${String(portOverride)}/` };
    }
    const path = cli_json_path(dataRoot);
    if (!existsSync(path)) {
        throw new Error("实例未运行（找不到 cli.json，先以 --cli serve 启动）");
    }
    let info: CliInstanceInfo;
    try {
        info = JSON.parse(readFileSync(path, "utf8")) as CliInstanceInfo;
    } catch {
        throw new Error("cli.json 损坏，无法读取端口");
    }
    if (typeof info.port !== "number" || info.port <= 0) {
        throw new Error("cli.json 缺少有效端口");
    }
    return { port: info.port, url: info.url };
}

/** POST 控制端点。返回响应文本；连接失败抛「实例未运行」可读错误。 */
export function post_control(port: number, action: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            {
                host: "localhost",
                port,
                path: `/v1/control/${action}`,
                method: "POST",
                timeout: 5000,
            },
            (res) => {
                let body = "";
                res.on("data", (c: Buffer) => {
                    body += c.toString();
                });
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        resolve(body);
                    } else {
                        reject(new Error(`控制端点返回 ${String(res.statusCode ?? "?")}: ${body}`));
                    }
                });
            },
        );
        req.on("timeout", () => {
            req.destroy(new Error("控制请求超时"));
        });
        req.on("error", (err: Error) => {
            reject(new Error(`实例未运行或不可达：${err.message}`));
        });
        req.end();
    });
}

export function get_config_export(port: number, include_secrets: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
        const req = httpGet(
            {
                host: "localhost",
                port,
                path: `/v1/config/export?includeSecrets=${String(include_secrets)}`,
                timeout: 5000,
            },
            (res) => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", (chunk: string) => {
                    body += chunk;
                });
                res.on("end", () => {
                    if (res.statusCode === 200) {
                        resolve(body);
                    } else {
                        reject(new Error(`导出端点返回 ${String(res.statusCode ?? "?")}: ${body}`));
                    }
                });
            },
        );
        req.on("timeout", () => {
            req.destroy(new Error("导出请求超时"));
        });
        req.on("error", (err: Error) => {
            reject(new Error(`实例未运行或不可达：${err.message}`));
        });
    });
}

/** GET 面板 URL 可达性检查（open 用）。 */
export function fetch_url(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        httpGet(url, (res) => {
            res.resume();
            if (res.statusCode && res.statusCode < 500) {
                resolve();
            } else {
                reject(new Error(`面板返回 ${String(res.statusCode ?? "?")}`));
            }
        }).on("error", (err: Error) => {
            reject(new Error(`面板不可达：${err.message}`));
        });
    });
}

/** WSL 下用 wslview/explorer.exe 打开宿主机浏览器；失败仅提示不算错误。 */
export function open_in_browser(url: string, deps: ControlClientDeps): void {
    const write = deps.write ?? ((t: string) => process.stdout.write(t));
    // WSL 环境尝试 wslview；Windows 用 start；其它平台提示手动打开。
    if (process.platform === "linux" && process.env["WSL_DISTRO_NAME"]) {
        const try_launch = (cmd: string, args: string[]): void => {
            execFile(cmd, args, (err) => {
                if (err) {
                    void write(`无法自动打开浏览器（${cmd} 失败），请手动访问：${url}\n`);
                }
            });
        };
        try_launch("wslview", [url]);
    } else if (process.platform === "win32") {
        spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else {
        void write(`请在浏览器打开：${url}\n`);
    }
}

/**
 * 执行控制子命令。返回退出码（0 成功，1 失败已输出错误）。
 * 调用方据此 app.exit，不抛。
 */
export async function run_control_command(
    command: ControlCommand,
    options: { port?: number },
    deps: ControlClientDeps = {},
): Promise<number> {
    const write = deps.write ?? ((t: string) => process.stdout.write(t));
    try {
        switch (command) {
            case "autostart": {
                // Linux 无自启动集成（systemd 文档引导）；Windows 走 loginItem。
                if (process.platform === "linux") {
                    await write("autostart 在 Linux 上不受支持（可手动配置 systemd 自启动）\n");
                    return 0;
                }
                // Windows 桌面沿用 setLoginItemSettings（与 tray toggle 一致）。
                const { app } = await import("electron");
                const current = app.getLoginItemSettings().openAtLogin;
                app.setLoginItemSettings({ openAtLogin: !current });
                await write(`autostart 已${current ? "关闭" : "开启"}\n`);
                return 0;
            }
            case "open": {
                const inst = resolve_instance(deps, options.port);
                await fetch_url(inst.url);
                await write(`面板地址：${inst.url}\n`);
                open_in_browser(inst.url, deps);
                return 0;
            }
            case "refresh-all":
            case "pause":
            case "resume":
            case "restart":
            case "quit": {
                const inst = resolve_instance(deps, options.port);
                await post_control(inst.port, command);
                await write(`${command} 已发送\n`);
                return 0;
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`OmniPanel: ${msg}\n`);
        return 1;
    }
}

export async function run_export_command(
    options: CliExportOptions,
    deps: ControlClientDeps = {},
): Promise<number> {
    const write = deps.write ?? write_stdout;
    try {
        const inst = resolve_instance(deps, options.port);
        const body = await get_config_export(inst.port, options.includeSecrets === true);
        await write(body.endsWith("\n") ? body : `${body}\n`);
        return 0;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`OmniPanel: ${msg}\n`);
        return 1;
    }
}

// re-export for callers/tests
export { getDataRoot } from "../core/paths";
