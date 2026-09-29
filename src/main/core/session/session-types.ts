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
     * 花云快照：隐藏窗（show:false）下 document.hidden 为 true，Cloudflare 质询不执行。
     * 无焦点显示并保持透明，让页面绘制，同时不抢用户当前窗口。
     */
    present_for_capture?(): void;
    /** 质询或登录页需要人点时，取消透明并带到前台。 */
    reveal?(): void;
    /** 失败日志用。只返回地址和标题，不返回正文。 */
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
    /** 质询/登录页持续多久后把窗口亮出来。缺省 8s。 */
    readonly reveal_after_ms?: number;
    /** 亮窗之后再给用户多久。缺省 120s。 */
    readonly reveal_budget_ms?: number;
    /**
     * 亮窗后继续采集的上限（缺省 30 分钟）：用户过质询/重新登录期间保持登记与轮询，
     * 拿到用量就写回并关窗，窗口关闭即取消。到期仍未完成才把窗口交接给用户。
     */
    readonly handover_wait_ms?: number;
    /**
     * 定时刷新用：vault 里的快照仍在新鲜期内时跳过开窗（手动刷新不传，强制重抓）。
     */
    readonly skip_if_fresh?: boolean;
}
