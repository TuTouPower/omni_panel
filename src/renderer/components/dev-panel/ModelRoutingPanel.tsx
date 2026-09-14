import { useCallback, useEffect, useMemo, useState } from "react";
import type {
    DevPanelModelRoutingChannel,
    DevPanelModelRoutingConfig,
    DevPanelModelRoutingSaveResult,
    DevPanelModelRoutingTestResult,
} from "../../../shared/types/dev-panel-model-routing";
import { MODEL_ROUTING_SLOTS } from "../../../shared/types/dev-panel-model-routing";
import { Alert, Badge, Button, Card, Select } from "../ui";

const SLOT_LABELS: Record<string, string> = {
    default_model: "默认模型",
    default_haiku: "Haiku",
    default_sonnet: "Sonnet",
    default_opus: "Opus",
    default_vision: "Vision",
};

function error_text(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

function channel_model_values(channels: readonly DevPanelModelRoutingChannel[]): string[] {
    return channels
        .flatMap((channel) => [
            ...channel.models.filter((model) => !model.startsWith("default_")),
            ...Object.values(channel.model_mapping),
        ])
        .filter((model, index, all) => all.indexOf(model) === index);
}

function current_slot_values(
    channels: readonly DevPanelModelRoutingChannel[],
): Record<string, string> {
    const values: Record<string, string> = {};
    for (const channel of channels) {
        if (!channel.enabled || channel.group.toLowerCase() !== "default") continue;
        for (const slot of Object.keys(channel.model_mapping)) {
            if (!slot.startsWith("default_") || slot.endsWith("[1m]")) continue;
            const model = channel.model_mapping[slot];
            if (model && !values[slot]) values[slot] = model;
        }
    }
    return values;
}

function change_text(result: DevPanelModelRoutingSaveResult): string {
    const success = result.changes.filter((item) => item.status === "success").length;
    const failed = result.changes.filter((item) => item.status === "failed").length;
    const skipped = result.changes.filter((item) => item.status === "skipped").length;
    return `成功 ${String(success)} · 失败 ${String(failed)} · 未执行 ${String(skipped)}`;
}

export function ModelRoutingPanel() {
    const [config, set_config] = useState<DevPanelModelRoutingConfig | null>(null);
    const [channels, set_channels] = useState<readonly DevPanelModelRoutingChannel[]>([]);
    const [selections, set_selections] = useState<Record<string, string>>({});
    const [tests, set_tests] = useState<Record<string, DevPanelModelRoutingTestResult>>({});
    const [save_result, set_save_result] = useState<DevPanelModelRoutingSaveResult | null>(null);
    const [snapshot, set_snapshot] =
        useState<Awaited<ReturnType<typeof window.usageboard.devPanel.modelRouting.getSnapshot>>>(
            null,
        );
    const [loading, set_loading] = useState(true);
    const [saving, set_saving] = useState(false);
    const [error, set_error] = useState<string | null>(null);

    const load = useCallback(async () => {
        set_loading(true);
        set_error(null);
        try {
            const [next_config, next_channels, next_snapshot] = await Promise.all([
                window.usageboard.devPanel.modelRouting.getConfig(),
                window.usageboard.devPanel.modelRouting.getChannels(),
                window.usageboard.devPanel.modelRouting.getSnapshot(),
            ]);
            set_config(next_config);
            set_channels(next_channels.channels);
            set_snapshot(next_snapshot);
            const values = [...next_config.models, ...channel_model_values(next_channels.channels)];
            const unique_values = values.filter((value, index) => values.indexOf(value) === index);
            const current_values = current_slot_values(next_channels.channels);
            set_selections((current) =>
                Object.fromEntries(
                    MODEL_ROUTING_SLOTS.map((slot) => [
                        slot,
                        current[slot] ?? current_values[slot] ?? unique_values[0] ?? "",
                    ]),
                ),
            );
        } catch (load_error: unknown) {
            set_error(error_text(load_error, "读取模型路由配置失败"));
        } finally {
            set_loading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const options = useMemo(() => {
        const values = [
            ...(config?.models ?? []),
            ...channel_model_values(channels),
            ...Object.values(selections),
        ].filter((value) => value.length > 0);
        return values.filter((value, index) => values.indexOf(value) === index);
    }, [channels, config?.models, selections]);

    const run_test = useCallback(
        async (slot: string) => {
            const model = selections[slot];
            if (!model) return;
            set_tests((current) => ({
                ...current,
                [slot]: { success: false, model_name: null, error: "测试中…" },
            }));
            try {
                const result = await window.usageboard.devPanel.modelRouting.test({ slot, model });
                set_tests((current) => ({ ...current, [slot]: result }));
            } catch (test_error: unknown) {
                set_tests((current) => ({
                    ...current,
                    [slot]: {
                        success: false,
                        model_name: null,
                        error: error_text(test_error, "模型自检失败"),
                    },
                }));
            }
        },
        [selections],
    );

    const save = useCallback(async () => {
        if (!window.confirm("保存模型路由会修改外部渠道配置，确定继续吗？")) return;
        set_saving(true);
        set_error(null);
        try {
            const result = await window.usageboard.devPanel.modelRouting.save({
                selections,
                confirmed: true,
            });
            set_save_result(result);
            set_snapshot(result.snapshot);
            const next_channels = await window.usageboard.devPanel.modelRouting.getChannels();
            set_channels(next_channels.channels);
        } catch (save_error: unknown) {
            set_error(error_text(save_error, "保存模型路由失败"));
        } finally {
            set_saving(false);
        }
    }, [selections]);

    return (
        <Card>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-[length:var(--text-title-sm)] font-semibold">模型路由</h2>
                    <p className="mt-1 text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                        读取外部 New API 配置；凭证只在主进程使用，不会传到页面。
                    </p>
                </div>
                <Badge variant="accent">
                    {loading ? "读取中" : `${String(channels.length)} 个渠道`}
                </Badge>
            </div>
            {error && <Alert className="mb-3">{error}</Alert>}
            {config && (
                <div className="mb-3 rounded-md bg-[var(--color-surface-raised)] px-3 py-2 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                    配置：<span className="font-mono">{config.config_path}</span>
                    {config.settings_present
                        ? " · 已读取 Claude [1m] 设置"
                        : " · 未找到 Claude 设置"}
                </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
                {MODEL_ROUTING_SLOTS.map((slot) => {
                    const result = tests[slot];
                    return (
                        <div
                            key={slot}
                            className="rounded-md border border-[var(--color-outline)] p-3"
                        >
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <label
                                    className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]"
                                    htmlFor={`dev-model-${slot}`}
                                >
                                    {SLOT_LABELS[slot] ?? slot}
                                </label>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={!selections[slot] || loading}
                                    onClick={() => void run_test(slot)}
                                >
                                    测试
                                </Button>
                            </div>
                            <Select
                                id={`dev-model-${slot}`}
                                value={selections[slot] ?? ""}
                                disabled={loading || options.length === 0}
                                onChange={(event) => {
                                    set_selections((current) => ({
                                        ...current,
                                        [slot]: event.target.value,
                                    }));
                                }}
                            >
                                {options.length === 0 && <option value="">无可用模型</option>}
                                {options.map((model) => (
                                    <option key={model} value={model}>
                                        {model}
                                    </option>
                                ))}
                            </Select>
                            {result && (
                                <div className="mt-2 text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                                    {result.success
                                        ? `返回模型：${result.model_name ?? "未返回名称"}`
                                        : result.error}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                    {snapshot
                        ? `快照 ${snapshot.snapshot_id.slice(0, 8)} · ${String(snapshot.channel_count)} 个渠道`
                        : "保存前会在宿主本地保留快照"}
                </div>
                <Button
                    disabled={loading || saving || options.length === 0}
                    onClick={() => void save()}
                >
                    {saving ? "保存中…" : "保存模型路由"}
                </Button>
            </div>
            {save_result && (
                <div className="mt-3">
                    <Alert tone={save_result.success ? "success" : "warning"}>
                        {change_text(save_result)} · 快照已保留
                    </Alert>
                    <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-[length:var(--text-body-sm)]">
                            <thead className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                                <tr className="border-b border-[var(--color-hairline)]">
                                    <th className="px-2 py-2">渠道</th>
                                    <th className="px-2 py-2">状态</th>
                                    <th className="px-2 py-2">变更</th>
                                </tr>
                            </thead>
                            <tbody>
                                {save_result.changes.map((change) => (
                                    <tr
                                        key={change.channel_id}
                                        className="border-b border-[var(--color-hairline)] last:border-0"
                                    >
                                        <td className="px-2 py-2">{change.channel_name}</td>
                                        <td className="px-2 py-2">{change.status}</td>
                                        <td className="px-2 py-2">
                                            {[
                                                ...change.mapping_changes,
                                                ...change.added_models.map((model) => `+${model}`),
                                                ...change.removed_models.map(
                                                    (model) => `-${model}`,
                                                ),
                                            ].join(" · ") || "无变化"}
                                            {change.error ? ` · ${change.error}` : ""}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </Card>
    );
}
