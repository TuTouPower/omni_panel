import { ProxyAgent } from "undici";
import { MAX_CONNECTIONS_PER_ORIGIN } from "../../../shared/constants";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("proxy-pool");

// Process-level ProxyAgent cache keyed by proxy URL.
//
// Previously create_connector_context and grok_oauth_manager each built a fresh
// ProxyAgent per request/refresh. net-client's agent was never closed (socket +
// TLS handle leak across refreshes); grok's was closed every call, defeating
// connection reuse. Both behaviors are fixed by sharing one agent per proxy URL
// for the process lifetime and closing them together at shutdown.
const pool = new Map<string, ProxyAgent>();

export function get_proxy_agent(proxy_url: string): ProxyAgent {
    let agent = pool.get(proxy_url);
    if (!agent) {
        agent = new ProxyAgent({
            uri: proxy_url,
            connections: MAX_CONNECTIONS_PER_ORIGIN,
        });
        pool.set(proxy_url, agent);
        log.debug(`proxy-pool: created ProxyAgent for ${proxy_url}`);
    }
    return agent;
}

export async function close_all_proxy_agents(): Promise<void> {
    const agents = [...pool.values()];
    pool.clear();
    if (agents.length === 0) return;
    await Promise.all(
        agents.map((agent) =>
            agent.close().catch((err: unknown) => {
                log.warn("proxy-pool: error closing ProxyAgent", err);
            }),
        ),
    );
    log.debug(`proxy-pool: closed ${String(agents.length)} ProxyAgent(s)`);
}
