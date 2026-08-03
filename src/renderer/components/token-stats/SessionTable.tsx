import { useMemo, useState } from "react";
import { fmtTime, fmtTok } from "../../lib/token-stats/format";
import { paletteFor } from "../../lib/token-stats/palette";
import { build_resolver } from "../../lib/token-stats/chart-data";
import type { SessionRow } from "../../lib/token-stats/types";

interface SessionTableProps {
    /** Pre-derived session rows (from token_stats_sessions, not raw records). */
    rows: SessionRow[];
    theme: "dark" | "light";
    /** model → color map for tags (derived from buckets Top5 by the parent). */
    modelColors: Map<string, string>;
    /** Models grouped under one label; tags display the alias and merge. */
    modelAliases?: readonly { alias: string; models: readonly string[] }[] | undefined;
    totalRows?: number;
    loadedOffset?: number;
    onPageChange?: ((offset: number) => void) | undefined;
}
const PAGE_SIZES = [10, 20, 50] as const;
type PageSize = (typeof PAGE_SIZES)[number];

type SortKey =
    | "title"
    | "agent"
    | "directory"
    | "models"
    | "calls"
    | "tokens"
    | "cacheRate"
    | "lastTs";
type SortDir = 1 | -1;

export function SessionTable({
    rows: input_rows,
    theme,
    modelColors,
    modelAliases,
    totalRows = input_rows.length,
    loadedOffset = 0,
    onPageChange,
}: SessionTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>("tokens");
    const [sortDir, setSortDir] = useState<SortDir>(-1);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);

    const rows = useMemo(
        () => sortSessionRows(input_rows, sortKey, sortDir),
        [input_rows, sortKey, sortDir],
    );

    const otherColor = paletteFor(theme).other;
    const colorForModel = (m: string) => modelColors.get(m) ?? otherColor;

    const resolve_model = useMemo(
        () => build_resolver((modelAliases ?? []).map((a) => ({ alias: a.alias, keys: a.models }))),
        [modelAliases],
    );
    /** Alias-resolved, deduped model tags; color follows the first raw model. */
    const display_models = (models: string[]) => {
        const out: { label: string; color: string }[] = [];
        const seen = new Set<string>();
        for (const m of models) {
            const label = resolve_model(m);
            if (seen.has(label)) continue;
            seen.add(label);
            out.push({ label, color: colorForModel(m) });
        }
        return out;
    };

    const pages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.min(page, pages);
    const requestedStart = (safePage - 1) * pageSize;
    const loadedEnd = loadedOffset + rows.length;
    const slice =
        requestedStart >= loadedOffset && requestedStart < loadedEnd
            ? rows.slice(requestedStart - loadedOffset, requestedStart - loadedOffset + pageSize)
            : [];
    const maxTokens = Math.max(...rows.map((r) => r.tokens), 1);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 1 ? -1 : 1));
        } else {
            setSortKey(key);
            setSortDir(-1);
        }
        setPage(1);
    };

    const go_to_page = (next_page: number): void => {
        const start = (next_page - 1) * pageSize;
        setPage(next_page);
        if (onPageChange && (start < loadedOffset || start >= loadedEnd)) {
            onPageChange(Math.floor(start / 100) * 100);
        }
    };

    return (
        <div className="card span-12">
            <h3>
                会话明细 <span className="hint">点击表头排序</span>
            </h3>
            <div className="tablewrap">
                <table>
                    <thead>
                        <tr>
                            <SortHeader
                                label="会话"
                                k="title"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                            />
                            <SortHeader
                                label="工具"
                                k="agent"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                            />
                            <SortHeader
                                label="工作目录"
                                k="directory"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                            />
                            <SortHeader
                                label="模型"
                                k="models"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                            />
                            <SortHeader
                                label="调用"
                                k="calls"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                            />
                            <SortHeader
                                label="Tokens"
                                k="tokens"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                            />
                            <SortHeader
                                label="缓存率"
                                k="cacheRate"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                            />
                            <SortHeader
                                label="最近活跃"
                                k="lastTs"
                                sortKey={sortKey}
                                sortDir={sortDir}
                                onSort={handleSort}
                            />
                        </tr>
                    </thead>
                    <tbody>
                        {slice.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="empty">
                                    该筛选条件下暂无记录
                                </td>
                            </tr>
                        ) : (
                            slice.map((r) => (
                                <tr key={r.identity_key ?? r.session_id}>
                                    <td className="t-title" title={r.title}>
                                        {r.title}
                                        <div
                                            className="t-dim t-mono"
                                            style={{ fontSize: "10.5px", marginTop: 3 }}
                                        >
                                            {r.slug ?? ""}
                                            {r.sub && <span className="chip sub">sub-agent</span>}
                                        </div>
                                    </td>
                                    <td>
                                        <span
                                            className={`chip ${
                                                r.agent === "claude-code"
                                                    ? "cc"
                                                    : r.agent === "kimi-code"
                                                      ? "kc"
                                                      : "oc"
                                            }`}
                                        >
                                            {r.agent === "claude-code"
                                                ? "Claude Code"
                                                : r.agent === "kimi-code"
                                                  ? "Kimi Code"
                                                  : "OpenCode"}
                                        </span>
                                    </td>
                                    <td className="t-dim t-mono">{r.directory}</td>
                                    <td>
                                        {display_models(r.models).map(({ label, color: c }) => (
                                            <span
                                                key={label}
                                                className="modeltag"
                                                style={{
                                                    color: c,
                                                    background: `${c}18`,
                                                    border: `1px solid ${c}30`,
                                                }}
                                            >
                                                {label}
                                            </span>
                                        ))}
                                    </td>
                                    <td className="t-mono t-dim">{r.calls}</td>
                                    <td>
                                        <div className="bar-cell">
                                            <div
                                                className="bar"
                                                style={{
                                                    width: `${String(Math.max(2, (r.tokens / maxTokens) * 90))}px`,
                                                }}
                                            />
                                            <span>{fmtTok(r.tokens)}</span>
                                        </div>
                                    </td>
                                    <td
                                        className="t-mono"
                                        style={{
                                            color:
                                                r.cacheRate > 0.7
                                                    ? "var(--ts-green)"
                                                    : r.cacheRate > 0.4
                                                      ? "var(--ts-amber)"
                                                      : "var(--ts-text-2)",
                                        }}
                                    >
                                        {(r.cacheRate * 100).toFixed(0)}%
                                    </td>
                                    <td className="t-mono t-dim">{fmtTime(r.lastTs)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className="pager">
                <span />
                <span className="btns">
                    <select
                        className="pgselect"
                        value={pageSize}
                        onChange={(e) => {
                            setPageSize(Number(e.target.value) as PageSize);
                            setPage(1);
                        }}
                    >
                        {PAGE_SIZES.map((s) => (
                            <option key={s} value={s}>
                                {s} / 页
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => {
                            go_to_page(safePage - 1);
                        }}
                    >
                        ‹ 上一页
                    </button>
                    <span className="cur">
                        {safePage} / {pages}
                    </span>
                    <button
                        type="button"
                        disabled={safePage >= pages}
                        onClick={() => {
                            go_to_page(safePage + 1);
                        }}
                    >
                        下一页 ›
                    </button>
                </span>
            </div>
        </div>
    );
}

function SortHeader({
    label,
    k,
    sortKey,
    sortDir,
    onSort,
}: {
    label: string;
    k: SortKey;
    sortKey: SortKey;
    sortDir: SortDir;
    onSort: (k: SortKey) => void;
}) {
    const active = sortKey === k;
    return (
        <th
            onClick={() => {
                onSort(k);
            }}
        >
            {label} <span className="arr">{active ? (sortDir === 1 ? "↑" : "↓") : "↕"}</span>
        </th>
    );
}

export function sortSessionRows(rows: SessionRow[], key: SortKey, dir: SortDir): SessionRow[] {
    const copy = [...rows];
    copy.sort((a, b) => {
        let cmp = 0;
        if (key === "title" || key === "directory" || key === "models" || key === "agent") {
            cmp = String(a[key]).localeCompare(String(b[key]));
        } else {
            cmp = a[key] - b[key];
        }
        return cmp * dir;
    });
    return copy;
}
