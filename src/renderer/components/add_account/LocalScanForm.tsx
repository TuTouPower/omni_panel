import { useState, useEffect } from "react";
import { Icon } from "../Icon";
import type { AddServiceId } from "../../lib/common-services";

const AUTH_LOCAL_PATHS: Partial<Record<AddServiceId, string[]>> = {
    claude: ["~/.claude/.credentials.json", "~/.config/claude/auth.json"],
    codex: ["~/.codex/auth.json"],
    antigravity: ["~/.antigravity/session.json"],
};

export interface LocalScanFormProps {
    readonly vendor_id: AddServiceId;
}

export function LocalScanForm({ vendor_id }: LocalScanFormProps) {
    const paths = AUTH_LOCAL_PATHS[vendor_id] ?? [];
    const [phase, set_phase] = useState<"scanning" | "done">("scanning");

    // Mock scan — in production this would use IPC to read the filesystem
    useEffect(() => {
        const t = setTimeout(() => {
            set_phase("done");
            // For now, show the paths as being scanned; no real file I/O
            // from the renderer. A future IPC channel can provide real results.
        }, 800);
        return () => {
            clearTimeout(t);
        };
    }, [vendor_id]);

    return (
        <>
            <div className="scan-paths">
                <span className="sp-h">
                    <Icon name="search" size={13} strokeWidth={1.8} />
                    扫描位置
                </span>
                {paths.map((p) => (
                    <code key={p} className="sp-path">
                        {p}
                    </code>
                ))}
            </div>

            {phase === "scanning" ? (
                <div className="scan-busy">
                    <span className="sb-spin">
                        <Icon name="refresh" size={16} />
                    </span>
                    正在扫描本地授权文件…
                </div>
            ) : (
                <div className="scan-found">
                    <div className="sf-head">
                        <span className="sf-title">未发现有效凭证</span>
                        <button
                            className="sf-rescan"
                            type="button"
                            onClick={() => {
                                set_phase("scanning");
                            }}
                        >
                            <Icon name="refresh" size={13} strokeWidth={1.8} />
                            重新扫描
                        </button>
                    </div>
                    <div className="lm-empty" style={{ marginTop: 12 }}>
                        <span className="lme-ic">
                            <Icon name="file" size={20} />
                        </span>
                        <div className="lme-title">未找到本地授权文件</div>
                        <div className="lme-sub">
                            请确保已安装对应的 CLI 工具并完成登录，然后点击重新扫描。
                        </div>
                    </div>
                    <button className="scan-manual" type="button" disabled title="尚未实现">
                        <Icon name="folder" size={14} />
                        手动选择文件…
                    </button>
                </div>
            )}
        </>
    );
}
