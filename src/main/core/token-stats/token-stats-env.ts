/**
 * t437: legacy `local`/`win` 行的目标 env（纯函数，可单测）。
 * directory：盘符形（`D:\…`/`D:/…`）→ win；`/Users/` 前缀 → mac；其他非
 * NULL → linux；NULL → 宿主默认。
 */
export function legacy_env_from_directory(
    directory: string | null,
    host_default: "win" | "mac" | "linux",
): "win" | "mac" | "linux" {
    if (directory === null) return host_default;
    if (/^[A-Za-z]:[\\/]/.test(directory)) return "win";
    if (directory.startsWith("/Users/")) return "mac";
    return "linux";
}
