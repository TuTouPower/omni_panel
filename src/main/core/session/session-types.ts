/**
 * 会话窗口/控制器契约与花云快照选项。
 *
 * 单独成文件是为了避免 session-manager 与 flowercloud_dom 互相 import
 * 触发 dependency-cruiser 的 no-circular 规则（该规则不豁免 type-only 依赖）。
 */

export interface SessionCookie {
    readonly name: string;
    readonly value: string;
}

export interface SessionWindow {
    loadURL(url: string): Promise<void>;
    close(): void;
    isDestroyed(): boolean;
    on(event: "closed", listener: () => void): this;
    /**
     * t492: 读取登录窗页面的 localStorage。kimi_web 用它取 refresh token
     * （SPA 把 refresh_token 写在 localStorage，见 d060）。缺省表示宿主不支持。
     */
    read_local_storage?(key: string): Promise<string | null>;
    /** 读取登录窗或后台会话窗口当前页面的 DOM HTML。 */
    read_html?(): Promise<string | null>;
    /**
     * 失败日志用。只返回地址和标题，不返回正文。
     *
     * 花云快照不再需要任何前台化方法：s040 证明隐藏窗（`show:false`）里
     * `document.hidden` 已是 false、Cloudflare 脚本照常执行，而 `show()` + 聚焦会把
     * 托管式挑战升级为必须人工点击的交互挑战（见 `docs/findings/d063`）。
     */
    read_page_hint?(): Promise<{ url: string; title: string } | null>;
}

export interface SessionController {
    on_before_send_headers(
        handler: (details: {
            url: string;
            requestHeaders: Record<string, string>;
            resource_type: string;
        }) => void,
    ): void;
    get_cookies(url: string): Promise<SessionCookie[]>;
    set_cookie?(url: string, name: string, value: string, domain?: string): Promise<void>;
}

export interface FlowercloudSnapshotOptions {
    readonly timeout_ms?: number;
    readonly poll_ms?: number;
    /** 首次看到用量后再等多久，避开 JS 把旧数字换成当前用量之前的那一帧。 */
    readonly settle_ms?: number;
    /**
     * 定时刷新用：vault 里的快照仍在新鲜期内时跳过开窗（手动刷新不传，强制重抓）。
     */
    readonly skip_if_fresh?: boolean;
}

/**
 * 一次花云 DOM 抓取的结果。失败时不写 vault，`reason` 为可读原因
 * （由 `flower_failure_reason` 从页面分类翻译）。
 */
export interface FlowercloudSnapshotResult {
    readonly ok: boolean;
    readonly reason?: string;
}
