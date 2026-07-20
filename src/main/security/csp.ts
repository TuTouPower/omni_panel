// CSP directive construction for the renderer session.
//
// dev: script-src 必须含 'unsafe-inline'，否则 @vitejs/plugin-react 注入的
// React Refresh preamble（inline <script type="module">）会被 CSP 拦截，
// plugin-react 抛 "can't detect preamble"，所有 .tsx 模块加载失败 → renderer 全黑。
// prod: 无 React Refresh，保持最严格 'self'，不放 'unsafe-inline'。
//
// 抽成纯函数便于单测覆盖 dev/prod 两路，防止回退到缺 'unsafe-inline' 的 dev CSP。

export function build_csp_script_src(dev_origin: string | null): string {
    return dev_origin ? `'self' ${dev_origin} 'unsafe-eval' 'unsafe-inline'` : "'self'";
}

export function build_csp_connect_src(dev_origin: string | null, dev_host: string | null): string {
    return dev_origin
        ? `'self' ${dev_origin} ws://${dev_host ?? "*"} wss://${dev_host ?? "*"}`
        : "'self'";
}

export function build_csp_header(dev_origin: string | null, dev_host: string | null): string {
    const script_src = build_csp_script_src(dev_origin);
    const connect_src = build_csp_connect_src(dev_origin, dev_host);
    return `default-src 'self'; script-src ${script_src}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ${connect_src};`;
}
