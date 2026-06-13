import { AccountRow } from "./AccountRow";

interface VendorCardRow {
    instance_id: string;
    account_label: string;
    enabled: boolean;
    status: "ok" | "error" | "auth" | "disabled" | "unknown";
}

interface VendorCardProps {
    provider: string;
    rows: VendorCardRow[];
    on_toggle: (instance_id: string) => void;
    on_refresh: (instance_id: string) => void;
    on_edit: (instance_id: string) => void;
    on_delete: (instance_id: string) => void;
}

export function VendorCard({
    provider,
    rows,
    on_toggle,
    on_refresh,
    on_edit,
    on_delete,
}: VendorCardProps) {
    return (
        <div className="acc-card">
            {rows.map((row) => (
                <AccountRow
                    key={row.instance_id}
                    mode="direct"
                    provider={provider}
                    account_label={row.account_label}
                    enabled={row.enabled}
                    status={row.status}
                    on_toggle={() => {
                        on_toggle(row.instance_id);
                    }}
                    on_refresh={() => {
                        on_refresh(row.instance_id);
                    }}
                    on_edit={() => {
                        on_edit(row.instance_id);
                    }}
                    on_delete={() => {
                        on_delete(row.instance_id);
                    }}
                />
            ))}
        </div>
    );
}
