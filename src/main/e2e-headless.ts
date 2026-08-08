/**
 * e2e headless 门控（t280）。
 *
 * 仅当 `E2E=1` 且 `E2E_HEADLESS=1` 同时存在时，app 侧窗口以 `show:false` 创建
 * （窗口存在可测但不弹屏），playwright chromium 同步 headless。双条件之外的代码
 * 路径零改动——正常启动/CI 行为与现状完全一致。
 */
export function is_e2e_headless(): boolean {
    return process.env["E2E"] === "1" && process.env["E2E_HEADLESS"] === "1";
}
