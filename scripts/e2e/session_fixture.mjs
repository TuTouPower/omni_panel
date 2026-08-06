// t228 会话面板 web e2e 的合成会话与消息数据（demo 脱敏，无真实凭据/路径）。
// 同时被 synthetic.json 注入脚本与 gen_synthetic.mjs 复用，保证 fixture 可重建。
const T0 = Date.parse("2026-07-15T02:00:00Z");

const DAY = 24 * 3600 * 1000;

function sess(id, source, title, dir, calls, opts = {}) {
    return {
        id,
        source,
        env: "win",
        model: "model",
        title,
        directory: dir,
        input_tokens: opts.input ?? 800,
        output_tokens: opts.output ?? 400,
        cache_read_tokens: opts.cache_read ?? 100,
        cache_write_tokens: opts.cache_write ?? 50,
        calls,
        started_at: T0 - (opts.age ?? 1) * DAY,
        ended_at: T0 - (opts.recent_hours ?? 24),
    };
}

export const SESSIONS = [
    sess("s1", "claude_code", "登录页 bug 修复", "/proj/auth", 12, { input: 1200, output: 800 }),
    sess("s2", "opencode", "单元测试重构", "/proj/test", 6, { recent_hours: 30 }),
    sess("s3", "grok", "API 网关调优", "/proj/api", 9, { recent_hours: 40 }),
    sess("s4", "claude_code", "会话导出功能", "/proj/export", 4, { recent_hours: 50 }),
    sess("s5", "kimi_code", "数据库索引优化", "/proj/db", 7, { recent_hours: 60 }),
    sess("s6", "opencode", "前端组件库", "/proj/ui", 5, { recent_hours: 70 }),
    sess("s7", "grok", "性能压测报告", "/proj/bench", 11, { recent_hours: 80 }),
    sess("s8", "claude_code", "CI 流水线", "/proj/ci", 3, { recent_hours: 90 }),
    // s9 用于「槽满」用例：默认不勾选，单独打开验证超位 toast。
    sess("s9", "opencode", "部署发布", "/proj/deploy", 2, { recent_hours: 100 }),
];

function msg(id, role, text, minutes_ago) {
    return { id, role, text, timestamp: T0 - minutes_ago * 60000 };
}

export const MESSAGES = {
    s1: [
        msg("s1-m1", "user", "修复登录页 404 问题", 20),
        msg("s1-m2", "assistant", "已定位 auth 中间件缺失，补充处理", 18),
        msg("s1-m3", "user", "补登录单元测试", 5),
    ],
    s2: [
        msg("s2-m1", "user", "重构单元测试套件，统一断言", 30),
        msg("s2-m2", "assistant", "完成分层，断言收敛到 helper", 28),
    ],
    s3: [
        msg("s3-m1", "user", "API 网关超时调优方案", 40),
        msg("s3-m2", "assistant", "增加熔断与超时策略", 38),
    ],
    s4: [
        msg("s4-m1", "user", "实现会话导出功能", 50),
        msg("s4-m2", "assistant", "支持 Markdown 导出", 48),
    ],
    s5: [
        msg("s5-m1", "user", "数据库索引优化分析", 60),
        msg("s5-m2", "assistant", "新增 idx_sessions 覆盖查询", 58),
    ],
    s6: [
        msg("s6-m1", "user", "搭建前端组件库", 70),
        msg("s6-m2", "assistant", "发布到内部 registry", 68),
    ],
    s7: [
        msg("s7-m1", "user", "性能压测结果分析", 80),
        msg("s7-m2", "assistant", "P99 从 800ms 降到 200ms", 78),
    ],
    s8: [
        msg("s8-m1", "user", "配置 CI 流水线", 90),
        msg("s8-m2", "assistant", "集成 lint 与测试", 88),
    ],
    s9: [
        msg("s9-m1", "user", "执行生产发布", 100),
        msg("s9-m2", "assistant", "发布成功，回滚预案就绪", 99),
    ],
};

/** 转成 synthetic.json 的 responses key 形态。 */
export function build_session_responses() {
    const out = {};
    out["GET /v1/sessions"] = SESSIONS;
    for (const [id, messages] of Object.entries(MESSAGES)) {
        out[`GET /v1/sessionHistory?id=${id}`] = { messages, next_cursor: null };
    }
    return out;
}
