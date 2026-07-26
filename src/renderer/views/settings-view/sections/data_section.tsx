import { useCallback, useEffect, useRef, useState } from "react";
import type { AppConfiguration } from "../../../../shared/types/config";
import { SetRow } from "../../../components/settings/SetRow";
import { Select } from "../../../components/settings/Select";

export function DataSection({
    config,
    save_config,
}: {
    config: AppConfiguration;
    save_config: (payload: AppConfiguration) => Promise<void>;
}) {
    const cacheMaxMb = config.cacheMaxMb ?? 100;
    const [dataMsg, setDataMsg] = useState<string | null>(null);
    const data_msg_timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // Clear any pending data-msg timer on unmount so it can't fire setDataMsg
    // after the component is gone (test teardown / route switch).
    useEffect(() => {
        return () => {
            clearTimeout(data_msg_timer.current);
        };
    }, []);

    const handleExport = useCallback(async () => {
        try {
            const { saved } = await window.usageboard.config.export();
            setDataMsg(saved ? "设置已导出" : null);
        } catch {
            setDataMsg("导出失败");
        }
        clearTimeout(data_msg_timer.current);
        data_msg_timer.current = setTimeout(() => {
            setDataMsg(null);
        }, 2000);
    }, []);

    const handleExportLogs = useCallback(async () => {
        try {
            const { saved } = await window.usageboard.logs.export();
            setDataMsg(saved ? "日志已导出" : null);
        } catch {
            setDataMsg("导出失败");
        }
        clearTimeout(data_msg_timer.current);
        data_msg_timer.current = setTimeout(() => {
            setDataMsg(null);
        }, 2000);
    }, []);

    const handleImport = useCallback(async () => {
        if (!window.confirm("导入将覆盖当前所有设置，确定继续？")) return;
        try {
            const { imported } = await window.usageboard.config.import();
            if (imported) {
                setDataMsg("导入成功，正在刷新...");
                window.location.reload();
            } else {
                setDataMsg(null);
            }
        } catch {
            setDataMsg("导入失败");
            clearTimeout(data_msg_timer.current);
            data_msg_timer.current = setTimeout(() => {
                setDataMsg(null);
            }, 2000);
        }
    }, []);

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
                        void handleExport();
                    }}
                >
                    {dataMsg === "设置已导出" ? "已导出" : "导出"}
                </button>
            </SetRow>
            <SetRow title="导入设置" sub="从 JSON 文件恢复配置与账号密钥">
                <button
                    className="set-select"
                    style={{ background: "var(--field-bg)" }}
                    type="button"
                    onClick={() => {
                        void handleImport();
                    }}
                >
                    {dataMsg === "导入失败" ? "失败" : "导入"}
                </button>
            </SetRow>
            <SetRow title="导出运行日志" sub="导出当前运行日志文件">
                <button
                    className="set-select"
                    style={{ background: "var(--field-bg)" }}
                    type="button"
                    onClick={() => {
                        void handleExportLogs();
                    }}
                >
                    {dataMsg === "日志已导出" ? "已导出" : "导出日志"}
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
