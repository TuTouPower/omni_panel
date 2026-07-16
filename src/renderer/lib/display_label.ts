/** Resolve account remark/label for UI; empty when desensitize is on. */
export function resolve_account_display_label(
    label: string | undefined | null,
    desensitize: boolean,
): string {
    if (desensitize) return "";
    return label?.trim() ?? "";
}
