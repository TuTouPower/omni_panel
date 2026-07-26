import type { AppConfiguration } from "../../../../shared/types/config";
import { SetRow } from "../../../components/settings/SetRow";
import { Select } from "../../../components/settings/Select";

export function DataSection({
    config,
    data_msg,
    handle_export,
    handle_export_logs,
    handle_import,
    save_config,
}: {
    config: AppConfiguration;
    data_msg: string | null;
    handle_export: () => Promise<void>;
    handle_export_logs: () => Promise<void>;
    handle_import: () => Promise<void>;
    save_config: (payload: AppConfiguration) => Promise<void>;
}) {
    const cacheMaxMb = config.cacheMaxMb ?? 100;

    return (
        <>
            <div className="set-group-label">存储</div>
            <SetRow title="本地缓存上限" sub="历史趋势数据占用的最大空间，超出后自动清理最旧记录">
                <Select
                    value={cacheMaxMb === 0 ? "不限制" : `${String(cacheMaxMb)} MB`}
                    onChange={(v) => {
                        if (v === "不限制") {
                            void save_config({ ...config, cacheMaxMb: 0 });
                            return;
                        }
                        const mb = parseInt(v, 10);
                        if (!isNaN(mb)) {
                            void save_config({ ...config, cacheMaxMb: mb });
                        }
                    }}
                    options={["50 MB", "100 MB", "200 MB", "500 MB", "不限制"]}
                />
            </SetRow>
            <SetRow title="本地用量缓存" sub="历史趋势数据 · 占用 4.2 MB">
                <button
                    className="set-select"
                    style={{ background: "var(--field-bg)" }}
                    type="button"
                >
                    清除
                </button>
            </SetRow>
            <div className="set-group-label">数据</div>
            <SetRow title="导出设置" sub="导出全部配置与账号密钥到 JSON 文件">
                <button
                    className="set-select"
                    style={{ background: "var(--field-bg)" }}
                    type="button"
                    onClick={() => {
                        void handle_export();
                    }}
                >
                    {data_msg === "设置已导出" ? "已导出" : "导出"}
                </button>
            </SetRow>
            <SetRow title="导入设置" sub="从 JSON 文件恢复配置与账号密钥">
                <button
                    className="set-select"
                    style={{ background: "var(--field-bg)" }}
                    type="button"
                    onClick={() => {
                        void handle_import();
                    }}
                >
                    {data_msg === "导入失败" ? "失败" : "导入"}
                </button>
            </SetRow>
            <SetRow title="导出运行日志" sub="导出当前运行日志文件">
                <button
                    className="set-select"
                    style={{ background: "var(--field-bg)" }}
                    type="button"
                    onClick={() => {
                        void handle_export_logs();
                    }}
                >
                    {data_msg === "日志已导出" ? "已导出" : "导出日志"}
                </button>
            </SetRow>
            <div className="set-group-label" style={{ color: "var(--red)" }}>
                危险区域
            </div>
            <SetRow title="重置应用" sub="清除全部账号、设置与缓存">
                <button
                    className="set-select"
                    style={{
                        color: "var(--red)",
                        borderColor: "color-mix(in srgb,var(--red) 35%,transparent)",
                    }}
                    type="button"
                >
                    重置
                </button>
            </SetRow>
        </>
    );
}
