export const session_meta: Record<string, { login_url: string; cookie_names: string[] }> = {
    mimo: {
        login_url: "https://platform.xiaomimimo.com/console/plan-manage",
        cookie_names: ["api-platform_serviceToken", "api-platform_slh", "api-platform_ph"],
    },
    kimi: {
        login_url: "https://www.kimi.com/login",
        cookie_names: ["access_token", "refresh_token"],
    },
    opencode_go: {
        login_url: "https://opencode.ai/auth",
        cookie_names: ["*"],
    },
};
