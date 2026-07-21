import { AccountRow } from "./AccountRow";
import type { VendorId } from "./Icon";

interface VendorCardRow {
    instance_id: string;
    account_label: string;
    enabled: boolean;
    status: "ok" | "error" | "auth" | "disabled" | "unknown";
    upcoming_reset_off?: boolean | undefined;
    /** t041：无可用 accountKey（overview/未启用/空 items）时为 false，隐藏 bell 按钮。 */
    can_toggle_upcoming?: boolean | undefined;
}

interface VendorCardProps {
    provider: VendorId;
    rows: VendorCardRow[];
    on_toggle: (instance_id: string) => void;
    on_refresh: (instance_id: string) => void;
    on_edit: (instance_id: string) => void;
    on_delete: (instance_id: string) => void;
    on_toggle_upcoming?: (instance_id: string) => void;
    desensitizeRemarks?: boolean | undefined;
}

export function VendorCard({
    provider,
    rows,
    on_toggle,
    on_refresh,
    on_edit,
    on_delete,
    on_toggle_upcoming,
    desensitizeRemarks = false,
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
                    upcoming_reset_off={row.upcoming_reset_off}
                    on_toggle_upcoming={
                        on_toggle_upcoming && row.can_toggle_upcoming !== false
                            ? () => {
                                  on_toggle_upcoming(row.instance_id);
                              }
                            : undefined
                    }
                    desensitizeRemarks={desensitizeRemarks}
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
