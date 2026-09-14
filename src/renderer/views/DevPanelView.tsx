import { useCallback, useEffect, useMemo, useState } from "react";
import type {
    DevPanelConfiguration,
    DevPanelScanResult,
    DevPanelState,
} from "../../shared/types/dev-panel";
import { CommitHeatmap } from "../components/dev-panel/CommitHeatmap";
import {
    Alert,
    Badge,
    Button,
    Card,
    Checkbox,
    Input,
    PanelTitleBar,
    Textarea,
} from "../components/ui";
import { use_config } from "../hooks/use-config";
import { useGlobalTheme, useTheme } from "../lib/theme";
import { use_panel_navigation } from "../lib/panel-navigation";

const DEFAULT_DEV_PANEL: DevPanelConfiguration = {
    scanRoots: ["~/kar/code"],
    commitCutoff: "2026-03-20",
    currentUserOnly: true,
};

function configuration_from(
    config: ReturnType<typeof use_config>["config"],
): DevPanelConfiguration {
    return config?.devPanel ?? DEFAULT_DEV_PANEL;
}

function summary_people(
    people: readonly { name: string; email: string; commits: number }[],
): string {
    if (people.length === 0) return "—";
    return people
        .slice(0, 3)
        .map((person) => `${person.name || person.email} (${String(person.commits)})`)
        .join("、");
}

function status_label(status: DevPanelState["status"]): string {
    switch (status) {
        case "running":
            return "扫描中";
        case "completed":
            return "已完成";
        case "failed":
            return "失败";
        case "cancelled":
            return "已取消";
        case "idle":
            return "尚未扫描";
    }
}

export function DevPanelView() {
    useTheme();
    const theme = useGlobalTheme();
    const navigate = use_panel_navigation();
    const { config, save, loading, error } = use_config();
    const [roots_text, set_roots_text] = useState(DEFAULT_DEV_PANEL.scanRoots.join("\n"));
    const [cutoff, set_cutoff] = useState(DEFAULT_DEV_PANEL.commitCutoff);
    const [current_user_only, set_current_user_only] = useState(DEFAULT_DEV_PANEL.currentUserOnly);
    const [state, set_state] = useState<DevPanelState>({
        status: "idle",
        scan_id: null,
        started_at: null,
        result: null,
        error: null,
    });
    const [form_error, set_form_error] = useState<string | null>(null);

    useEffect(() => {
        const next = configuration_from(config);
        set_roots_text(next.scanRoots.join("\n"));
        set_cutoff(next.commitCutoff);
        set_current_user_only(next.currentUserOnly);
    }, [config]);

    const refresh_status = useCallback(async () => {
        try {
            set_state(await window.usageboard.devPanel.getStatus());
        } catch (error: unknown) {
            set_form_error(error instanceof Error ? error.message : "读取扫描状态失败");
        }
    }, []);

    useEffect(() => {
        void refresh_status();
        const timer = window.setInterval(() => {
            void refresh_status();
        }, 1000);
        return () => {
            window.clearInterval(timer);
        };
    }, [refresh_status]);

    const configuration = useMemo<DevPanelConfiguration>(
        () => ({
            scanRoots: roots_text
                .split("\n")
                .map((root) => root.trim())
                .filter((root) => root.length > 0),
            commitCutoff: cutoff,
            currentUserOnly: current_user_only,
        }),
        [cutoff, current_user_only, roots_text],
    );

    const scan = useCallback(async () => {
        if (loading || !config) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(configuration.commitCutoff)) {
            set_form_error("截止日期格式必须为 YYYY-MM-DD");
            return;
        }
        set_form_error(null);
        try {
            await save({ ...config, devPanel: configuration });
            await window.usageboard.devPanel.scan(configuration);
            await refresh_status();
        } catch (error: unknown) {
            set_form_error(error instanceof Error ? error.message : "启动扫描失败");
        }
    }, [config, configuration, loading, refresh_status, save]);

    const cancel = useCallback(async () => {
        await window.usageboard.devPanel.cancel();
        await refresh_status();
    }, [refresh_status]);

    const result: DevPanelScanResult | null = state.result;
    return (
        <div className="flex h-screen min-h-0 flex-col bg-[var(--color-surface-window)] text-[var(--color-on-surface)]">
            <PanelTitleBar
                panel="Dev"
                onNavigate={navigate}
                onRefresh={() => void refresh_status()}
                refreshing={state.status === "running"}
            />
            <main className="min-h-0 flex-1 overflow-y-auto p-[var(--spacing-panel-padding)]">
                <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
                    <Card>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <h1 className="text-[length:var(--text-title-md)] font-bold">
                                    Commit 历史
                                </h1>
                                <p className="mt-1 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                                    主进程只读执行 Git，按本地日期聚合；不会修改仓库。
                                </p>
                            </div>
                            <Badge variant="accent">{status_label(state.status)}</Badge>
                        </div>
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                            <label className="flex flex-col gap-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                                扫描根目录（每行一个）
                                <Textarea
                                    value={roots_text}
                                    rows={3}
                                    placeholder="~/kar/code"
                                    onChange={(event) => {
                                        set_roots_text(event.target.value);
                                    }}
                                    data-testid="dev-scan-roots"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                                起始日期（含）
                                <Input
                                    type="date"
                                    value={cutoff}
                                    onChange={(event) => {
                                        set_cutoff(event.target.value);
                                    }}
                                    data-testid="dev-cutoff"
                                />
                            </label>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <label className="flex items-center gap-2 text-[length:var(--text-body-sm)]">
                                <Checkbox
                                    checked={current_user_only}
                                    onChange={(event) => {
                                        set_current_user_only(event.target.checked);
                                    }}
                                />
                                仅统计当前 Git 作者
                            </label>
                            <div className="flex gap-2">
                                {state.status === "running" && (
                                    <Button variant="secondary" onClick={() => void cancel()}>
                                        取消扫描
                                    </Button>
                                )}
                                <Button
                                    onClick={() => void scan()}
                                    disabled={loading || state.status === "running"}
                                >
                                    开始扫描
                                </Button>
                            </div>
                        </div>
                        {form_error && <Alert className="mt-3">{form_error}</Alert>}
                        {error && <Alert className="mt-3">{error}</Alert>}
                    </Card>

                    {result && (
                        <>
                            {result.identity_warning && (
                                <Alert tone="warning">{result.identity_warning}</Alert>
                            )}
                            {result.errors.length > 0 && (
                                <Alert tone={result.status === "failed" ? "error" : "warning"}>
                                    <div className="font-semibold">部分目录未能读取</div>
                                    <ul className="mt-1 list-disc pl-5">
                                        {result.errors.slice(0, 8).map((item) => (
                                            <li
                                                key={`${item.root}|${item.path ?? ""}|${item.message}`}
                                            >
                                                {item.path ?? item.root}: {item.message}
                                            </li>
                                        ))}
                                    </ul>
                                </Alert>
                            )}
                            <Card>
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h2 className="text-[length:var(--text-title-sm)] font-semibold">
                                        提交热力图
                                    </h2>
                                    <span className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                                        {result.timezone} · {result.cutoff} 起 · {result.scanned_at}
                                    </span>
                                </div>
                                <div className="mt-1 truncate font-mono text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                                    根目录：{result.scan_roots.join(" · ") || "（未配置）"}
                                </div>
                                <CommitHeatmap daily={result.daily} theme={theme} />
                            </Card>
                            <Card>
                                <div className="mb-3 flex items-baseline justify-between gap-2">
                                    <h2 className="text-[length:var(--text-title-sm)] font-semibold">
                                        仓库摘要
                                    </h2>
                                    <span className="text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                                        {String(
                                            result.daily.reduce((sum, item) => sum + item.count, 0),
                                        )}{" "}
                                        commits · 数据版本 {String(result.data_version)}
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-left text-[length:var(--text-body-sm)]">
                                        <thead className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                                            <tr className="border-b border-[var(--color-hairline)]">
                                                <th className="px-2 py-2">仓库</th>
                                                <th className="px-2 py-2">提交数</th>
                                                <th className="px-2 py-2">作者</th>
                                                <th className="px-2 py-2">提交者</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.repositories.map((repository) => (
                                                <tr
                                                    key={repository.path}
                                                    className="border-b border-[var(--color-hairline)] last:border-0"
                                                >
                                                    <td className="px-2 py-2">
                                                        <div className="font-semibold">
                                                            {repository.repository}
                                                        </div>
                                                        <div className="font-mono text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                                                            {repository.path}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2 tabular-nums">
                                                        {String(repository.commits)}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        {summary_people(repository.authors)}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        {summary_people(repository.committers)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {result.repositories.length === 0 && (
                                        <div className="py-6 text-center text-[var(--color-on-surface-muted)]">
                                            没有符合条件的提交
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
