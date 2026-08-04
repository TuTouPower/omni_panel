export interface TokenStatsQueryKey {
    agent: string;
    platform: string;
    range_start: number;
    range_end: number;
    query_mode: string;
    gran: string;
    alias_fingerprint?: string;
}

export interface TokenStatsCacheEntry<T> {
    data: T;
    stale: boolean;
}

export interface TokenStatsQueryResult<T> {
    data: T;
    refreshed: boolean;
}

interface CacheEntry<T> extends TokenStatsCacheEntry<T> {
    key: string;
}

interface Inflight<T> {
    generation: number;
    promise: Promise<TokenStatsQueryResult<T>>;
}

export interface TokenStatsQueryCache<T> {
    load(
        query_key: TokenStatsQueryKey,
        fetcher: () => Promise<T>,
    ): Promise<TokenStatsQueryResult<T>>;
    peek(query_key: TokenStatsQueryKey): TokenStatsCacheEntry<T> | undefined;
    mark_stale(): void;
    size(): number;
}

export function create_token_stats_query_cache<T>(options: {
    max_entries: number;
}): TokenStatsQueryCache<T> {
    if (!Number.isInteger(options.max_entries) || options.max_entries < 1) {
        throw new Error("max_entries must be a positive integer");
    }

    const entries = new Map<string, CacheEntry<T>>();
    const inflight = new Map<string, Inflight<T>>();
    let generation = 0;

    const serialize_key = (query_key: TokenStatsQueryKey): string =>
        JSON.stringify([
            query_key.agent,
            query_key.platform,
            query_key.range_start,
            query_key.range_end,
            query_key.query_mode,
            query_key.gran,
            query_key.alias_fingerprint ?? "",
        ]);
    const touch = (entry: CacheEntry<T>): void => {
        entries.delete(entry.key);
        entries.set(entry.key, entry);
    };

    const trim = (): void => {
        while (entries.size > options.max_entries) {
            const oldest_key = entries.keys().next().value;
            if (oldest_key === undefined) return;
            entries.delete(oldest_key);
        }
    };

    return {
        load(query_key, fetcher) {
            const key = serialize_key(query_key);
            const cached = entries.get(key);
            if (cached?.stale === false) {
                touch(cached);
                return Promise.resolve({ data: cached.data, refreshed: false });
            }

            const current_generation = generation;
            const previous = inflight.get(key);
            if (previous?.generation === current_generation) return previous.promise;

            const promise = fetcher().then((data) => {
                if (generation === current_generation) {
                    const entry: CacheEntry<T> = { key, data, stale: false };
                    entries.set(key, entry);
                    touch(entry);
                    trim();
                }
                return { data, refreshed: true };
            });
            inflight.set(key, { generation: current_generation, promise });
            void promise.then(
                () => {
                    const active = inflight.get(key);
                    if (active?.promise === promise) inflight.delete(key);
                },
                () => {
                    const active = inflight.get(key);
                    if (active?.promise === promise) inflight.delete(key);
                },
            );
            return promise;
        },

        peek(query_key) {
            const entry = entries.get(serialize_key(query_key));
            if (!entry) return undefined;
            touch(entry);
            return { data: entry.data, stale: entry.stale };
        },

        mark_stale() {
            generation += 1;
            for (const entry of entries.values()) entry.stale = true;
        },

        size() {
            return entries.size;
        },
    };
}
