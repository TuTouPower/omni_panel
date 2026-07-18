import type { AgentSessionUsage } from "../../../shared/types/token-stats";

export type Metric = "tokens" | "sessions" | "calls";
export type XAxis = "time" | "project" | "session";
export type Granularity = "hour" | "day";
export type AgentFilter = "all" | "claude-code" | "opencode";

export interface TimeRangeState {
    preset: "24h" | "7d" | "30d" | null;
    custom: { start: number; end: number } | null;
}

export interface FilterOpts {
    agent: AgentFilter;
    start: number;
    end: number;
}

export interface SessionRow {
    session_id: string;
    title: string;
    slug: string | null;
    directory: string;
    agent: string;
    version: string | null;
    sub: boolean;
    models: string[];
    calls: number;
    tokens: number;
    cacheRate: number;
    lastTs: number;
}

export type { AgentSessionUsage };
