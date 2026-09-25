# Bundle p3_contract — 视角3 契约Breaking

- [High][90] docs/archive/tasks/t507_grok_bot_usage_connector/spec.md:15 — grok_bot spec承诺ondemand缺失 — 实现仅weekly无GetCurrentPeriodUsage — 修复：补调用或改spec [CHALLENGED→归档非enforcing，转文档卫生，见#10]
- [High][90] connectors/grok_bot/connector.ts:134 — grok_bot 401无法触发oauth_refresh即时换票AC-003断裂 — catch走report_failed不throw — 修复：401/403直接throw含文案
- [High][90] schemas/plugin-metadata.schema.json:175 — schemas双schema分叉manifest通不过plugin-metadata — additionalProperties:false+字段集冲突 — 修复：二选一收口+双向safeParse测试
- [High][90] src/shared/schemas/plugin-output.ts:107 — pluginResultSchema死契约从未经校验 — 全仓零消费 — 修复：输出侧加校验或删死schema
- [Medium][85] connectors/muse/manifest.json:25 — muse cookieNames spec/实现漂移 — spec 4键实现1键 — 修复：更新spec记录理由
- [Medium][85] connectors/muse/connector.ts:37 — muse硬编码Server Action hash无版本契约 — 修复：抽常量+轮换SOP或抛MUSE_ACTION_STALE
- [Medium][85] src/preload/index.ts:559 — preload路由分权破缺grok_bot全路由满权 — 修复：拆readonly/settings+路由矩阵单测
- [Medium][85] src/web/usageboard-web.ts:146 — Web/Desktop语义分叉grok_bot Web桩+LocalAPI缺路由 — logout假成功 — 修复：补端点或throw unsupported
- [Medium][85] src/main/ipc/grok_bot_auth_ipc.ts:27 — 错误码无枚举字符串匹配IPC — 修复：GrokBotErrorCode枚举+判别联合
- [Medium][80] src/main/ipc/grok_bot_auth_ipc.ts:112 — 参数校验缺上限timeout/offset/limit/days — 修复：复用QUERY_LIMIT_MIN/MAX+clamp
- [Medium][85] src/main/core/config/auto-seed.ts:59 — auto-seed行为breaking无迁移 — 存量空实例不清理schemaVersion未bump — 修复：bump+清理+补AC
- [Medium][85] connectors/grok_bot/connector.ts:140 — 未校验as堆叠+unknown直转外部JSON 100+处 — 修复：外部边界zod safeParse
- [Medium][80] src/preload/oauth_api.ts:32 — 薄包装职责注水OAuthApis泛型+provider三源 — 修复：单源providers.ts
- [Medium][80] src/main/core/token-stats/token-stats-store.ts:405 — SELECT\*+无界查询面 — 修复：列显式+LIMIT/分页+单item上限文档
- [Low][80] src/shared/schemas/plugin-output.ts:46 — optionality碎片post_raw?/signal?/非判别联合 — 修复：post_raw必填或capability声明
- [Low][80] config/env/.env.example:1 — 配置键示例同步缺口缺GROK_BOT/MUSE占位 — 修复：补占位或声明交互登录
- [Low][80] connectors/grok_bot/manifest.json:1 — provider开放regex与TS闭枚举并存 — 修复：文档明确自定义走regex
- [Info][70] src/main/core/connector/net-client.ts:20 — 单item token约束缺失仅50MB/1MB — 修复：blueprint补上限决策
