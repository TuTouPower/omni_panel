import { VendorMark, Icon } from "../Icon";
import { ADD_COMMON_SERVICES } from "../../lib/common-services";
import type { AddServiceId } from "../../lib/common-services";
import { Button } from "../ui/Button";

export interface VendorPickerProps {
    readonly plugin_infos: unknown[];
    readonly on_select: (vendor_id: AddServiceId) => void;
}

export function VendorPicker({ on_select }: VendorPickerProps) {
    // 内置 provider 始终可添加（auto_seed 保证 connector definition 存在）；
    // 用户删除账号后可重新添加，不因 plugin_infos 缺失而禁用。
    const can_add = () => true;

    return (
        <div className="flex flex-col gap-2">
            <div className="text-[length:var(--text-label-md)] font-semibold uppercase tracking-wide text-[var(--color-on-surface-muted)]">
                常用服务
            </div>
            <div className="grid grid-cols-3 gap-2.5">
                {ADD_COMMON_SERVICES.map((s) => {
                    const available = can_add();
                    return (
                        <Button
                            variant="secondary"
                            className="h-auto flex-col gap-2 rounded-xl p-4 text-[var(--color-on-surface)]"
                            key={s.id}
                            type="button"
                            disabled={!available}
                            onClick={() => {
                                on_select(s.id);
                            }}
                        >
                            <VendorMark id={s.id} size={28} />
                            <span>{s.label}</span>
                        </Button>
                    );
                })}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[length:var(--text-label-md)] font-semibold uppercase tracking-wide text-[var(--color-on-surface-muted)]">
                <Icon name="folder" size={13} strokeWidth={1.8} />
                <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => {
                        window.usageboard.settings.openConnectorsDir();
                    }}
                >
                    打开脚本目录
                </Button>
            </div>
        </div>
    );
}
