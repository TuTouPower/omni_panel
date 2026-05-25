export function EmptyState({
    message = "暂无数据",
    action,
    onAction,
    ...rest
}: {
    message?: string;
    action?: string;
    onAction?: () => void;
    "data-testid"?: string;
}) {
    return (
        <div
            className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)]"
            {...rest}
        >
            <p className="text-sm">{message}</p>
            {action && onAction && (
                <button
                    type="button"
                    onClick={onAction}
                    className="mt-3 rounded-[var(--radius)] border border-[var(--border)] px-4 py-1.5 text-sm"
                >
                    {action}
                </button>
            )}
        </div>
    );
}
