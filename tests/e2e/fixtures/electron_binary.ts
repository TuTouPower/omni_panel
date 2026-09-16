import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();

/**
 * Electron 可执行文件路径（跨平台）。
 *
 * electron npm 包在各平台的产物布局不同：Linux/Windows 是 `dist/electron[.exe]`，
 * macOS 是 `dist/Electron.app/Contents/MacOS/Electron`。包自身把相对路径写在
 * `dist/path.txt`（由 postinstall 生成，见 pnpm-workspace.yaml 的 onlyBuiltDependencies），
 * 这里读它解析，避免把单一平台布局硬编码进 e2e（与 p227 同类问题）。
 *
 * `path.txt` 缺失时直接抛错——那说明 electron 的 postinstall 没跑，
 * 错误信息里的路径本身就是诊断线索。
 */
export function resolve_electron_binary(): string {
    const relative = readFileSync(join(ROOT, "node_modules/electron/path.txt"), "utf8").trim();
    return resolve(ROOT, "node_modules/electron/dist", relative);
}
