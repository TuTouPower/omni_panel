import { useMemo, useState } from "react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Checkbox } from "../ui/Checkbox";
import { Select } from "../ui/Select";
import { agent_color, palette_for } from "../../lib/echarts_token_resolver";
import { fmtTime, fmtTok } from "../../lib/token-stats/format";
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
    /** 单击行打开会话历史：传行 identity_key（source|env|session_id）。 */
    onOpenSession?: ((identity_key: string) => void) | undefined;
    /** 批量打开勾选会话：传勾选行的 identity_key 列表。 */
    onOpenSelected?: ((identity_keys: readonly string[]) => void) | undefined;
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
    onOpenSession,
    onOpenSelected,
}: SessionTableProps) {
    const [sortKey, setSortKey] = useState<SortKey>("tokens");
    const [sortDir, setSortDir] = useState<SortDir>(-1);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<PageSize>(10);
    // checkbox 选中态仅当前页有效，翻页清空（AC）。
    const [checked, set_checked] = useState<ReadonlySet<string>>(() => new Set());

    const rows = useMemo(
        () => sortSessionRows(input_rows, sortKey, sortDir),
        [input_rows, sortKey, sortDir],
    );

    const otherColor = palette_for(theme).other;
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
        // checkbox 选中态仅当前页有效，排序重置页后清空。
        set_checked(new Set());
    };

    const go_to_page = (next_page: number): void => {
        const start = (next_page - 1) * pageSize;
        setPage(next_page);
        // checkbox 选中态仅当前页有效。
        set_checked(new Set());
        if (onPageChange && (start < loadedOffset || start >= loadedEnd)) {
            onPageChange(Math.floor(start / 100) * 100);
        }
    };

    return (
        <Card className="col-span-12 overflow-hidden">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="m-0 text-[length:var(--text-title-md)] font-semibold text-[var(--color-on-surface)]">
                    会话明细
                </h3>
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={checked.size === 0}
                    onClick={() => {
                        onOpenSelected?.([...checked]);
                    }}
                >
                    打开历史{checked.size > 0 ? ` (${String(checked.size)})` : ""}
                </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-[var(--color-outline)]">
                <table className="w-full min-w-[900px] border-collapse text-[length:var(--text-body-md)]">
                    <thead className="bg-[var(--color-surface-raised)]">
                        <tr>
                            <th className="w-10 px-2 py-2" aria-hidden="true" />
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
                                <td
                                    colSpan={9}
                                    className="px-3 py-8 text-center text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]"
                                >
                                    该筛选条件下暂无记录
                                </td>
                            </tr>
                        ) : (
                            slice.map((r) => (
                                <tr
                                    key={r.identity_key ?? r.session_id}
                                    className="border-b border-[var(--color-hairline)] align-middle transition-colors hover:bg-[var(--color-surface-raised)]"
                                    onClick={() => {
                                        if (r.identity_key) onOpenSession?.(r.identity_key);
                                    }}
                                >
                                    <td
                                        className="w-10 px-2 py-2"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                        }}
                                    >
                                        <Checkbox
                                            checked={checked.has(r.identity_key ?? r.session_id)}
                                            onChange={() => {
                                                const key = r.identity_key ?? r.session_id;
                                                set_checked((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(key)) {
                                                        next.delete(key);
                                                    } else {
                                                        next.add(key);
                                                    }
                                                    return next;
                                                });
                                            }}
                                            aria-label={`选择 ${r.title}`}
                                        />
                                    </td>
                                    <td className="max-w-[220px] px-3 py-2" title={r.title}>
                                        <div className="truncate text-[var(--color-on-surface)]">
                                            {r.title}
                                        </div>
                                        <div className="mt-1 truncate font-mono text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                                            {r.slug ?? ""}
                                            {r.sub && (
                                                <Badge
                                                    variant="label"
                                                    color="var(--color-primary)"
                                                    dot={false}
                                                    className="ml-1 border border-[var(--color-accent-ring)] text-[length:var(--text-label-caps)]"
                                                >
                                                    sub-agent
                                                </Badge>
                                            )}
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2">
                                        <Badge
                                            variant="label"
                                            color={agent_color(r.agent, theme)}
                                            dot={false}
                                        >
                                            {r.agent === "claude-code"
                                                ? "Claude Code"
                                                : r.agent === "kimi-code"
                                                  ? "Kimi Code"
                                                  : r.agent === "grok"
                                                    ? "Grok"
                                                    : "OpenCode"}
                                        </Badge>
                                    </td>
                                    <td className="max-w-[240px] truncate px-3 py-2 font-mono text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                                        {r.directory}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-1">
                                            {display_models(r.models).map(({ label, color: c }) => (
                                                <Badge
                                                    key={label}
                                                    variant="label"
                                                    color={c}
                                                    dot={false}
                                                >
                                                    {label}
                                                </Badge>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                                        {r.calls}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="h-1.5 min-w-[2px] rounded-full bg-[var(--color-primary)]"
                                                style={{
                                                    width: `${String(Math.max(2, (r.tokens / maxTokens) * 90))}px`,
                                                }}
                                            />
                                            <span className="font-mono text-[length:var(--text-label-md)] text-[var(--color-on-surface)]">
                                                {fmtTok(r.tokens)}
                                            </span>
                                        </div>
                                    </td>
                                    <td
                                        className={
                                            r.cacheRate > 0.7
                                                ? "whitespace-nowrap px-3 py-2 font-mono text-[length:var(--text-label-md)] text-[var(--color-success)]"
                                                : r.cacheRate > 0.4
                                                  ? "whitespace-nowrap px-3 py-2 font-mono text-[length:var(--text-label-md)] text-[var(--color-warning)]"
                                                  : "whitespace-nowrap px-3 py-2 font-mono text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]"
                                        }
                                    >
                                        {(r.cacheRate * 100).toFixed(0)}%
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                                        {fmtTime(r.lastTs)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
                <Select
                    className="h-8 w-auto min-w-[96px] py-1 text-[length:var(--text-label-md)]"
                    value={pageSize}
                    onChange={(e) => {
                        setPageSize(Number(e.target.value) as PageSize);
                        setPage(1);
                        // checkbox 选中态仅当前页有效。
                        set_checked(new Set());
                    }}
                >
                    {PAGE_SIZES.map((s) => (
                        <option key={s} value={s}>
                            {s} / 页
                        </option>
                    ))}
                </Select>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => {
                        go_to_page(safePage - 1);
                    }}
                >
                    ‹ 上一页
                </Button>
                <span className="min-w-[64px] text-center font-mono text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                    {safePage} / {pages}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={safePage >= pages}
                    onClick={() => {
                        go_to_page(safePage + 1);
                    }}
                >
                    下一页 ›
                </Button>
            </div>
        </Card>
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
            className="cursor-pointer whitespace-nowrap px-3 py-2 text-left text-[length:var(--text-label-md)] font-[550] text-[var(--color-on-surface-variant)] transition-colors hover:text-[var(--color-on-surface)]"
            onClick={() => {
                onSort(k);
            }}
        >
            {label}{" "}
            <span className="text-[var(--color-on-surface-muted)]">
                {active ? (sortDir === 1 ? "↑" : "↓") : "↕"}
            </span>
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
