export function EmptyState({
    message = "暂无数据",
    ...rest
}: {
    message?: string;
    "data-testid"?: string;
}) {
    return (
        <div
            className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)]"
            {...rest}
        >
            <p className="text-sm">{message}</p>
        </div>
    );
}
