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
        <div className="set-row">
            <div className="sr-text">
                <div className="sr-title">{title}</div>
                {sub && <div className="sr-sub">{sub}</div>}
            </div>
            <div className="sr-ctrl">{children}</div>
        </div>
    );
}
