export function SetGroupLabel({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={
                "mb-[9px] mt-1 text-[length:var(--text-label-md)] font-semibold uppercase tracking-[0.05em] " +
                "text-[var(--color-on-surface-muted)] [&:not(:first-child)]:mt-6 " +
                (className ?? "")
            }
        >
            {children}
        </div>
    );
}

export function SetRow({
    title,
    sub,
    children,
}: {
    title: string;
    sub?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className="flex items-center gap-3 border-b-[0.5px] border-[var(--color-hairline)] py-3 last:border-b-0"
            data-testid="set-row"
        >
            <div className="min-w-0">
                <div className="text-[length:var(--text-body-md)] font-[550] text-[var(--color-on-surface)]">
                    {title}
                </div>
                {sub && (
                    <div className="mt-1 text-[length:var(--text-body-sm)] leading-[1.4] text-[var(--color-on-surface-muted)]">
                        {sub}
                    </div>
                )}
            </div>
            <div className="ml-auto shrink-0">{children}</div>
        </div>
    );
}
