import type { AccountOverrides, AppConfiguration } from "../../shared/types/config";
import { add_watched_metric, remove_watched_metric } from "../lib/account-overrides";
import { LabelMapDialog } from "./LabelMapDialog";

interface CpaLabelMapDialogProps {
    readonly instance_id: string;
    readonly vendor_id: string;
    readonly account_name: string;
    readonly save_target: "account" | "provider";
    readonly config: AppConfiguration;
    readonly on_save_config: (config: AppConfiguration) => Promise<void>;
    readonly on_close: () => void;
}

export function CpaLabelMapDialog({
    instance_id,
    vendor_id,
    account_name,
    save_target,
    config,
    on_save_config,
    on_close,
}: CpaLabelMapDialogProps) {
    const watched_metrics = config.accountOverrides?.upcomingResetWatched?.[vendor_id] ?? {};
    const existing_map =
        save_target === "provider"
            ? (config.providerLabelMaps?.[vendor_id] ?? {})
            : (config.accountLabelMaps?.[instance_id] ?? {});

    return (
        <LabelMapDialog
            instance_id={instance_id}
            vendor_id={vendor_id}
            account_name={account_name}
            existing_map={existing_map}
            watched_metrics={watched_metrics}
            on_save={async (target_instance_id, map) => {
                if (save_target === "provider") {
                    await on_save_config({
                        ...config,
                        providerLabelMaps: {
                            ...(config.providerLabelMaps ?? {}),
                            [vendor_id]: map,
                        },
                    });
                } else {
                    await on_save_config({
                        ...config,
                        accountLabelMaps: {
                            ...(config.accountLabelMaps ?? {}),
                            [target_instance_id]: map,
                        },
                    });
                }
                on_close();
            }}
            on_toggle_watched={(raw_label, account_keys) => {
                if (account_keys.length === 0) return;
                const all_watched = account_keys.every(
                    (account_key) => watched_metrics[account_key]?.includes(raw_label) ?? false,
                );
                let next: AccountOverrides = config.accountOverrides ?? {};
                for (const account_key of account_keys) {
                    next = all_watched
                        ? remove_watched_metric(next, vendor_id, account_key, raw_label)
                        : add_watched_metric(next, vendor_id, account_key, raw_label);
                }
                void on_save_config({ ...config, accountOverrides: next });
            }}
            on_close={on_close}
        />
    );
}
