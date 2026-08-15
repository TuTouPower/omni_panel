import type { AppConfiguration } from "../../../../shared/types/config";
import { Button } from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";
import { SetGroupLabel, SetRow } from "../../../components/settings/SetRow";
import { Select } from "../../../components/ui/Select";

export function DataSection({
    config,
    data_msg,
    handle_export,
    handle_export_logs,
    handle_import,
    save_config,
    show_secret_option,
    include_secrets,
    on_include_secrets_change,
}: {
    config: AppConfiguration;
    data_msg: string | null;
    handle_export: () => Promise<void>;
    handle_export_logs: () => Promise<void>;
    handle_import: () => Promise<void>;
    save_config: (payload: AppConfiguration) => Promise<void>;
    show_secret_option: boolean;
    include_secrets: boolean;
    on_include_secrets_change: (value: boolean) => void;
}) {
    const cacheMaxMb = config.cacheMaxMb ?? 100;

    return (
        <>
            <SetGroupLabel>存储</SetGroupLabel>
            <SetRow title="本地缓存上限" sub="历史趋势数据占用的最大空间，超出后自动清理最旧记录">
                <Select
                    value={cacheMaxMb === 0 ? "不限制" : `${String(cacheMaxMb)} MB`}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === "不限制") {
                            void save_config({ ...config, cacheMaxMb: 0 });
                            return;
                        }
                        const mb = parseInt(v, 10);
                        if (!isNaN(mb)) {
                            void save_config({ ...config, cacheMaxMb: mb });
                        }
                    }}
                >
                    {["50 MB", "100 MB", "200 MB", "500 MB", "不限制"].map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </Select>
            </SetRow>
            <SetRow title="本地用量缓存" sub="历史趋势数据 · 暂未开放">
                <Button variant="secondary" size="sm" disabled>
                    暂未开放
                </Button>
            </SetRow>
            <SetGroupLabel>数据</SetGroupLabel>
            <SetRow
                title="导出设置"
                sub={
                    show_secret_option
                        ? "导出配置；默认不含明文密钥"
                        : "导出全部配置与账号密钥到 JSON 文件"
                }
            >
                <div className="flex items-center gap-3">
                    {show_secret_option && (
                        <label className="flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
                            <Checkbox
                                aria-label="包含明文密钥"
                                checked={include_secrets}
                                onChange={(event) => {
                                    on_include_secrets_change(event.target.checked);
                                }}
                            />
                            <span>包含明文密钥</span>
                        </label>
                    )}
                    {show_secret_option && include_secrets && (
                        <span className="text-[length:var(--text-label-md)] text-[var(--color-error)]">
                            文件含明文密钥，请妥善保管
                        </span>
                    )}
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            void handle_export();
                        }}
                    >
                        {data_msg === "设置已导出" ? "已导出" : "导出"}
                    </Button>
                </div>
            </SetRow>
            <SetRow title="导入设置" sub="从 JSON 文件恢复配置与账号密钥">
                <div className="flex flex-col items-end gap-1">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            void handle_import();
                        }}
                    >
                        {data_msg?.startsWith("导入失败") ? "失败" : "导入"}
                    </Button>
                    {data_msg?.startsWith("导入失败") && (
                        <div
                            role="alert"
                            className="max-w-[360px] text-right text-[length:var(--text-label-md)] text-[var(--color-error)]"
                        >
                            {data_msg}
                        </div>
                    )}
                </div>
            </SetRow>
            <SetRow title="导出运行日志" sub="导出当前运行日志文件">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                        void handle_export_logs();
                    }}
                >
                    {data_msg === "日志已导出" ? "已导出" : "导出日志"}
                </Button>
            </SetRow>
            <SetGroupLabel className="text-[var(--color-error)]">危险区域</SetGroupLabel>
            <SetRow title="重置应用" sub="清除全部账号、设置与缓存（暂未开放）">
                <Button
                    variant="secondary"
                    size="sm"
                    className="text-[var(--color-error)]"
                    disabled
                >
                    暂未开放
                </Button>
            </SetRow>
        </>
    );
}
