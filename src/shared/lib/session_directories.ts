/** Shared desktop/HTTP bounds for exact session-directory filters. */
export const DIRECTORIES_MAX = 32;
export const DIRECTORY_LEN_MAX = 1024;
export const INVALID_DIRECTORIES_MESSAGE = `directories must be an array of <= ${String(DIRECTORIES_MAX)} non-empty strings, each <= ${String(DIRECTORY_LEN_MAX)} characters`;

export function valid_directories(value: unknown): value is string[] | undefined {
    if (value === undefined) return true;
    if (!Array.isArray(value) || value.length > DIRECTORIES_MAX) return false;
    return value.every(
        (d: unknown) => typeof d === "string" && d.length > 0 && d.length <= DIRECTORY_LEN_MAX,
    );
}
