import { useState, useEffect, useCallback, useMemo } from "react";
import { Icon } from "../Icon";
import { Button } from "../ui/Button";
import { CodeChip } from "../ui/CodeChip";
import type { AddServiceId } from "../../lib/common-services";
import type { LocalScanResult } from "../../../shared/types/ipc";

const AUTH_LOCAL_PATHS: Partial<Record<AddServiceId, string[]>> = {
    claude: ["~/.claude/.credentials.json", "~/.config/claude/auth.json"],
    codex: ["~/.codex/auth.json"],
    antigravity: ["~/.antigravity/session.json"],
};

export interface LocalScanFormProps {
    readonly vendor_id: AddServiceId;
    readonly on_scan_result?: (result: LocalScanResult) => void;
}

export function LocalScanForm({ vendor_id, on_scan_result }: LocalScanFormProps) {
    const paths = useMemo(() => AUTH_LOCAL_PATHS[vendor_id] ?? [], [vendor_id]);
    const [phase, set_phase] = useState<"scanning" | "done">("scanning");
    const [scan_result, set_scan_result] = useState<LocalScanResult | null>(null);

    const trigger_scan = useCallback(async () => {
        set_phase("scanning");
        try {
            const api = (
                window as unknown as {
                    usageboard?: {
                        auth?: { scanLocal?: (id: string) => Promise<LocalScanResult> };
                    };
                }
            ).usageboard;
            const scan_fn = api?.auth?.scanLocal;
            const scan_promise: Promise<LocalScanResult> =
                typeof scan_fn === "function"
                    ? scan_fn(vendor_id)
                    : Promise.resolve({ found: false, path: paths[0] ?? "" });

            const [result] = await Promise.all([
                scan_promise.catch(() => ({ found: false, path: paths[0] ?? "" })),
                new Promise((resolve) => setTimeout(resolve, 600)),
            ]);

            set_scan_result(result);
            on_scan_result?.(result);
        } catch {
            set_scan_result({ found: false, path: paths[0] ?? "" });
        } finally {
            set_phase("done");
        }
    }, [vendor_id, paths, on_scan_result]);

    useEffect(() => {
        void trigger_scan();
    }, [trigger_scan]);

    const is_valid = Boolean(scan_result?.found && scan_result.details?.valid);

    return (
        <>
            <div className="mb-3.5 flex flex-col gap-2">
                <span className="mb-1 flex items-center gap-2 text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                    <Icon name="search" size={13} strokeWidth={1.8} />
                    扫描位置
                </span>
                {paths.map((p) => (
                    <CodeChip key={p} className="break-all px-2.5">
                        {p}
                    </CodeChip>
                ))}
            </div>

            {phase === "scanning" ? (
                <div className="flex items-center justify-center gap-2 py-6 text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">
                    <span className="flex animate-spin">
                        <Icon name="refresh" size={16} />
                    </span>
                    正在扫描本地授权文件…
                </div>
            ) : is_valid && scan_result?.details ? (
                <div className="flex flex-col">
                    <div className="mb-2.5 flex items-center gap-2">
                        <span className="flex items-center gap-2 text-[length:var(--text-body-md)] font-semibold text-[var(--color-success)]">
                            <Icon name="check" size={16} strokeWidth={2.2} />
                            已发现有效凭证
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto"
                            type="button"
                            onClick={() => {
                                void trigger_scan();
                            }}
                        >
                            <Icon name="refresh" size={13} strokeWidth={1.8} />
                            重新扫描
                        </Button>
                    </div>
                    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-outline)] bg-[var(--color-surface-container)] p-3.5">
                        <div className="flex items-center justify-between text-[length:var(--text-body-sm)]">
                            <span className="text-[var(--color-on-surface-muted)]">文件路径</span>
                            <span
                                className="font-mono text-[var(--color-on-surface)] truncate max-w-[200px]"
                                title={scan_result.path}
                            >
                                {scan_result.path}
                            </span>
                        </div>
                        {scan_result.details.email ? (
                            <div className="flex items-center justify-between text-[length:var(--text-body-sm)]">
                                <span className="text-[var(--color-on-surface-muted)]">
                                    账号邮箱
                                </span>
                                <span className="text-[var(--color-on-surface)] truncate max-w-[200px]">
                                    {scan_result.details.email}
                                </span>
                            </div>
                        ) : null}
                        {scan_result.details.accountId ? (
                            <div className="flex items-center justify-between text-[length:var(--text-body-sm)]">
                                <span className="text-[var(--color-on-surface-muted)]">
                                    账号 ID
                                </span>
                                <span className="font-mono text-[length:var(--text-body-xs)] text-[var(--color-on-surface)] truncate max-w-[200px]">
                                    {scan_result.details.accountId}
                                </span>
                            </div>
                        ) : null}
                        <div className="mt-1 flex items-center gap-2 text-[length:var(--text-body-xs)] text-[var(--color-on-surface-muted)]">
                            <Icon name="check" size={14} className="text-[var(--color-success)]" />
                            本地授权态已就绪，点击下方“导入账号”直接完成添加
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col">
                    <div className="mb-2.5 flex items-center gap-2">
                        <span className="text-[length:var(--text-body-md)] font-semibold text-[var(--color-on-surface-variant)]">
                            未发现有效凭证
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto"
                            type="button"
                            onClick={() => {
                                void trigger_scan();
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
                        <div className="mb-1 text-[length:var(--text-body-md)] font-semibold text-[var(--color-on-surface-variant)]">
                            {scan_result?.found ? "本地凭据无效或已损坏" : "未找到本地授权文件"}
                        </div>
                        <div className="max-w-[260px] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--color-on-surface-muted)]">
                            {scan_result?.details?.error ??
                                "请确保已安装对应的 CLI 工具并完成登录，然后点击重新扫描。"}
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
