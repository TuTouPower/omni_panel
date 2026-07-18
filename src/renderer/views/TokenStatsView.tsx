import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentSessionUsage } from "../../shared/types/token-stats";
import type { TokenStatsStatus } from "../../shared/types/ipc";
import { MetricDonut } from "../components/token-stats/MetricDonut";
import { BarChart } from "../components/token-stats/BarChart";
import { Heatmap } from "../components/token-stats/Heatmap";
import { SessionTable } from "../components/token-stats/SessionTable";
import { Segmented } from "../components/token-stats/Segmented";
import { RangePicker } from "../components/token-stats/RangePicker";
import { filtered } from "../lib/token-stats/filter";
import { metricValue, prevRangeRecords, hitRateOf } from "../lib/token-stats/aggregate";
import { fmtInt, fmtRelativeTime, fmtTok } from "../lib/token-stats/format";
import {
    modelSegments,
    compositionSegments,
    projectSegments,
    oneValue,
    sumTokensValue,
} from "../lib/token-stats/chart-data";
import type { AgentFilter, Granularity, Metric, XAxis } from "../lib/token-stats/types";
import "../styles/token-stats.css";

const MODULE = "TokenStatsView";

type Theme = "dark" | "light";
type RangePreset = "24h" | "7d" | "30d";

const AGENT_OPTIONS: { value: AgentFilter; label: string }[] = [
    { value: "all", label: "全部工具" },
    { value: "claude-code", label: "Claude Code" },
    { value: "opencode", label: "OpenCode" },
];

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
    { value: "24h", label: "24 小时" },
    { value: "7d", label: "7 天" },
    { value: "30d", label: "1 月" },
];

const THEME_OPTIONS: { value: Theme; label: string }[] = [
    { value: "dark", label: "🌙 深色" },
    { value: "light", label: "☀️ 浅色" },
];

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
    { value: "tokens", label: "Token" },
    { value: "sessions", label: "Session" },
    { value: "calls", label: "调用次数" },
];

const GRAN_OPTIONS: { value: Granularity; label: string }[] = [
    { value: "hour", label: "小时" },
    { value: "day", label: "天" },
];

const XAXIS_OPTIONS: { value: XAxis; label: string; disabled?: boolean }[] = [
    { value: "time", label: "时间" },
    { value: "project", label: "项目" },
    { value: "session", label: "会话" },
];

const PRESET_MS: Record<RangePreset, number> = {
    "24h": 24 * 3600000,
    "7d": 7 * 24 * 3600000,
    "30d": 30 * 24 * 3600000,
};

function presetRange(preset: RangePreset): { start: number; end: number } {
    const end = Date.now();
    return { start: end - PRESET_MS[preset], end };
}

function readSavedTheme(): Theme {
    try {
        const raw = localStorage.getItem("usage-theme");
        return raw === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
}

function saveTheme(theme: Theme) {
    try {
        localStorage.setItem("usage-theme", theme);
    } catch {
        // ignore
    }
}

export function TokenStatsView() {
    const [records, setRecords] = useState<AgentSessionUsage[]>([]);
    const [status, setStatus] = useState<TokenStatsStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [agent, setAgent] = useState<AgentFilter>("all");
    const [preset, setPreset] = useState<RangePreset | null>("30d");
    const [custom, setCustom] = useState<{ start: number; end: number } | null>(null);
    const [metric, setMetric] = useState<Metric>("tokens");
    const [xaxis, setXaxis] = useState<XAxis>("time");
    const [gran, setGran] = useState<Granularity>("day");
    const [theme, setTheme] = useState<Theme>(readSavedTheme());

    const currentRange = useMemo(
        () =>
            custom ? { ...custom } : preset ? presetRange(preset) : { start: 0, end: Date.now() },
        [custom, preset],
    );

    const updatedAgo = useMemo(() => {
        if (!status?.last_updated) return null;
        return fmtRelativeTime(Date.now() - status.last_updated);
    }, [status?.last_updated]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [recs, st] = await Promise.all([
                window.usageboard.tokenStats.getRecords({}),
                window.usageboard.tokenStats.getStatus(),
            ]);
            setRecords(recs);
            setStatus(st);
        } catch (err: unknown) {
            window.usageboard.log({
                level: "error",
                module: MODULE,
                message: `Failed to load token stats: ${err instanceof Error ? err.message : String(err)}`,
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        return window.usageboard.tokenStats.onUpdated(() => {
            void loadData();
        });
    }, [loadData]);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        saveTheme(theme);
    }, [theme]);

    const agentFiltered = useMemo(
        () => records.filter((r) => agent === "all" || r.agent === agent),
        [records, agent],
    );

    const currentRecords = useMemo(
        () => filtered(agentFiltered, { agent: "all", ...currentRange }),
        [agentFiltered, currentRange],
    );

    const prevRecords = useMemo(
        () => prevRangeRecords(agentFiltered, currentRange),
        [agentFiltered, currentRange],
    );

    const isSessionMetric = metric === "sessions";
    const effectiveXaxis = isSessionMetric ? "time" : xaxis;

    useEffect(() => {
        if (effectiveXaxis !== "time") return;
        if (preset === "24h") setGran("hour");
        else setGran("day");
    }, [preset, effectiveXaxis]);

    const deltaHtml = useCallback((current: number, previous: number, pp = false) => {
        if (previous <= 0 && !(pp && previous !== 0)) {
            return <b style={{ color: "var(--ts-text-3)" }}>前段无数据</b>;
        }
        if (pp) {
            const d = (current - previous) * 100;
            return d >= 0 ? (
                <b className="up">▲ {d.toFixed(1)} pp</b>
            ) : (
                <b className="down">▼ {Math.abs(d).toFixed(1)} pp</b>
            );
        }
        const d = previous === 0 ? 0 : (current - previous) / previous;
        return d >= 0 ? (
            <b className="up">▲ {(d * 100).toFixed(1)}%</b>
        ) : (
            <b className="down">▼ {Math.abs(d * 100).toFixed(1)}%</b>
        );
    }, []);

    const totalTokens = metricValue(currentRecords, "tokens");
    const totalSessions = metricValue(currentRecords, "sessions");
    const totalCalls = metricValue(currentRecords, "calls");
    const hitRate = hitRateOf(currentRecords);

    const prevTokens = metricValue(prevRecords, "tokens");
    const prevSessions = metricValue(prevRecords, "sessions");
    const prevCalls = metricValue(prevRecords, "calls");
    const prevHitRate = hitRateOf(prevRecords);

    const handlePresetChange = (p: RangePreset) => {
        setPreset(p);
        setCustom(null);
        setGran(p === "24h" ? "hour" : "day");
    };

    const handleCustomApply = (range: { start: number; end: number }) => {
        setCustom(range);
        setPreset(null);
    };

    const handleMetricChange = (m: Metric) => {
        setMetric(m);
        if (m === "sessions") setXaxis("time");
    };

    return (
        <div className="token-stats">
            <header>
                <div className="brand">
                    <h1>
                        <span className="dot" />
                        Agent Session Usage
                        {updatedAgo && <span className="update-ago">{updatedAgo}</span>}
                    </h1>
                </div>
                <div className="controls">
                    <Segmented
                        options={AGENT_OPTIONS}
                        value={agent}
                        onChange={(v) => {
                            setAgent(v);
                        }}
                    />
                    <Segmented
                        options={RANGE_OPTIONS}
                        value={preset}
                        onChange={(v) => {
                            handlePresetChange(v);
                        }}
                    />
                    <Segmented
                        options={THEME_OPTIONS}
                        value={theme}
                        onChange={(v) => {
                            setTheme(v);
                        }}
                    />
                    <RangePicker
                        start={currentRange.start}
                        end={currentRange.end}
                        active={custom !== null}
                        onApply={handleCustomApply}
                    />
                </div>
            </header>

            {loading ? (
                <div className="empty">加载中...</div>
            ) : currentRecords.length === 0 ? (
                <div className="empty">该筛选条件下暂无记录</div>
            ) : (
                <>
                    <div className="grid">
                        <div className="card span-3">
                            <h3>
                                总 Token 消耗{" "}
                                <span className="delta">{deltaHtml(totalTokens, prevTokens)}</span>
                            </h3>
                            <MetricDonut
                                centerValue={fmtTok(totalTokens)}
                                centerLabel="tokens"
                                segments={modelSegments(currentRecords, sumTokensValue, theme)}
                                format={fmtTok}
                                theme={theme}
                            />
                        </div>
                        <div className="card span-3">
                            <h3>
                                会话数{" "}
                                <span className="delta">
                                    {deltaHtml(totalSessions, prevSessions)}
                                </span>
                            </h3>
                            <MetricDonut
                                centerValue={fmtInt(totalSessions)}
                                centerLabel="sessions"
                                segments={projectSegments(currentRecords, theme)}
                                format={fmtInt}
                                theme={theme}
                            />
                        </div>
                        <div className="card span-3">
                            <h3>
                                调用次数{" "}
                                <span className="delta">{deltaHtml(totalCalls, prevCalls)}</span>
                            </h3>
                            <MetricDonut
                                centerValue={fmtInt(totalCalls)}
                                centerLabel="calls"
                                segments={modelSegments(currentRecords, oneValue, theme)}
                                format={fmtInt}
                                theme={theme}
                            />
                        </div>
                        <div className="card span-3">
                            <h3>
                                缓存命中率{" "}
                                <span className="delta">
                                    {deltaHtml(hitRate, prevHitRate, true)}
                                </span>
                            </h3>
                            <MetricDonut
                                centerValue={`${(hitRate * 100).toFixed(1)}%`}
                                centerLabel="hit rate"
                                segments={compositionSegments(currentRecords)}
                                format={fmtTok}
                                theme={theme}
                            />
                        </div>
                    </div>

                    <div className="grid">
                        <div className="card span-8">
                            <h3 className="bar-chart-header">
                                <span className="h3ctrl">
                                    {effectiveXaxis === "time" && (
                                        <Segmented
                                            options={GRAN_OPTIONS}
                                            value={gran}
                                            onChange={(v) => {
                                                setGran(v);
                                            }}
                                            size="sm"
                                        />
                                    )}
                                    <Segmented
                                        options={XAXIS_OPTIONS.map((o) => ({
                                            ...o,
                                            disabled: isSessionMetric && o.value !== "time",
                                        }))}
                                        value={effectiveXaxis}
                                        onChange={(v) => {
                                            setXaxis(v);
                                        }}
                                        size="sm"
                                    />
                                </span>
                            </h3>
                            <div className="bar-chart-wrap">
                                <div className="bar-metric">
                                    <Segmented
                                        options={METRIC_OPTIONS}
                                        value={metric}
                                        onChange={(v) => {
                                            handleMetricChange(v);
                                        }}
                                        size="sm"
                                    />
                                </div>
                                <BarChart
                                    records={currentRecords}
                                    metric={metric}
                                    xaxis={effectiveXaxis}
                                    gran={gran}
                                    start={currentRange.start}
                                    end={currentRange.end}
                                    theme={theme}
                                    topOffset={44}
                                />
                            </div>
                        </div>
                        <div className="card span-4">
                            <h3>时段热力</h3>
                            <Heatmap records={currentRecords} metric={metric} theme={theme} />
                        </div>
                    </div>

                    <div className="grid">
                        <SessionTable records={currentRecords} metric={metric} theme={theme} />
                    </div>
                </>
            )}
        </div>
    );
}
