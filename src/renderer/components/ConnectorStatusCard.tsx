import { Card } from "./Card";

interface ConnectorStatusCardProps {
    title: string;
    status: string;
    details?: string;
}

export function ConnectorStatusCard({ title, status, details }: ConnectorStatusCardProps) {
    return (
        <Card className="space-y-2" data-testid="connector-status-card">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-xs text-[var(--muted-foreground)]">{status}</div>
            {details && <div className="text-xs text-[var(--muted-foreground)]">{details}</div>}
        </Card>
    );
}
