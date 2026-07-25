import { VendorMark, Icon } from "../Icon";
import { ADD_COMMON_SERVICES } from "../../lib/common-services";
import type { AddServiceId } from "../../lib/common-services";

export interface VendorPickerProps {
    readonly plugin_infos: unknown[];
    readonly on_select: (vendor_id: AddServiceId) => void;
}

export function VendorPicker({ on_select }: VendorPickerProps) {
    // 内置 provider 始终可添加（auto_seed 保证 connector definition 存在）；
    // 用户删除账号后可重新添加，不因 plugin_infos 缺失而禁用。
    const can_add = () => true;

    return (
        <div className="pick-body">
            <div className="set-group-label" style={{ marginTop: 0 }}>
                常用服务
            </div>
            <div className="pick-grid">
                {ADD_COMMON_SERVICES.map((s) => {
                    const available = can_add();
                    return (
                        <button
                            className={"pick-card" + (available ? "" : " disabled")}
                            key={s.id}
                            type="button"
                            disabled={!available}
                            onClick={() => {
                                on_select(s.id);
                            }}
                        >
                            <VendorMark id={s.id} size={28} />
                            <span className="pick-label">{s.label}</span>
                        </button>
                    );
                })}
            </div>
            <div
                className="set-group-label"
                style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}
            >
                <Icon name="folder" size={13} strokeWidth={1.8} />
                <button
                    type="button"
                    className="ad-test"
                    onClick={() => {
                        window.usageboard.settings.openConnectorsDir();
                    }}
                >
                    打开脚本目录
                </button>
            </div>
        </div>
    );
}
