import { useState, useEffect } from "react";
import { Icon } from "../Icon";
import { Button } from "../ui/Button";
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
            <div className="mb-3.5 flex flex-col gap-1.5">
                <span className="mb-0.5 flex items-center gap-1.5 text-label-md font-semibold text-[var(--color-on-surface-variant)]">
                    <Icon name="search" size={13} strokeWidth={1.8} />
                    扫描位置
                </span>
                {paths.map((p) => (
                    <code
                        key={p}
                        className="break-all rounded-md bg-[var(--color-surface-raised)] px-2.5 py-1.5 font-[var(--font-code-md)] text-label-md text-[var(--color-on-surface-variant)]"
                    >
                        {p}
                    </code>
                ))}
            </div>

            {phase === "scanning" ? (
                <div className="flex items-center justify-center gap-2 py-6 text-body-md text-[var(--color-on-surface-muted)]">
                    <span className="flex animate-spin">
                        <Icon name="refresh" size={16} />
                    </span>
                    正在扫描本地授权文件…
                </div>
            ) : (
                <div className="flex flex-col">
                    <div className="mb-2.5 flex items-center gap-2">
                        <span className="text-body-md font-semibold text-[var(--color-on-surface-variant)]">
                            未发现有效凭证
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto"
                            type="button"
                            onClick={() => {
                                set_phase("scanning");
                            }}
                        >
                            <Icon name="refresh" size={13} strokeWidth={1.8} />
                            重新扫描
                        </Button>
                    </div>
                    <div className="flex flex-col items-center p-7 text-center">
                        <span className="mb-2.5 text-[var(--color-on-surface-muted)]">
                            <Icon name="file" size={20} />
                        </span>
                        <div className="mb-1 text-body-md font-semibold text-[var(--color-on-surface-variant)]">
                            未找到本地授权文件
                        </div>
                        <div className="max-w-[260px] text-body-sm leading-relaxed text-[var(--color-on-surface-muted)]">
                            请确保已安装对应的 CLI 工具并完成登录，然后点击重新扫描。
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        className="mt-2 flex w-full border-dashed"
                        type="button"
                        disabled
                        title="尚未实现"
                    >
                        <Icon name="folder" size={14} />
                        手动选择文件…
                    </Button>
                </div>
            )}
        </>
    );
}
