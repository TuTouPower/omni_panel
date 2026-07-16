import type { TokenStatsBucket, TokenStatsSession } from "../../../shared/types/token-stats";

/**
 * Group sessions by (source, env, bucket_date, model) and sum token fields
 * into aggregated buckets. Sessions pass through unchanged.
 */
export function aggregate_sessions(sessions: TokenStatsSession[]): {
    buckets: TokenStatsBucket[];
    sessions: TokenStatsSession[];
} {
    const groups = new Map<string, TokenStatsBucket>();

    for (const s of sessions) {
        const bucket_date = new Date(s.started_at).toISOString().slice(0, 10);
        const key = `${s.source}|${s.env}|${bucket_date}|${s.model}`;

        let bucket = groups.get(key);
        if (!bucket) {
            bucket = {
                source: s.source,
                env: s.env,
                bucket_date,
                model: s.model,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                sessions: 0,
                calls: 0,
            };
            groups.set(key, bucket);
        }

        bucket.input_tokens += s.input_tokens;
        bucket.output_tokens += s.output_tokens;
        bucket.cache_read_tokens += s.cache_read_tokens;
        bucket.cache_write_tokens += s.cache_write_tokens;
        bucket.sessions += 1;
        bucket.calls += s.calls;
    }

    return {
        buckets: Array.from(groups.values()),
        sessions,
    };
}
