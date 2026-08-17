# p199 schemas/plugin-output.schema.json 导出物过期：provider enum 缺 4 provider、items 缺 cycleDurationMs

- 现象：导出 schema 与 zod 源脱节（合并 High[85] 与 High[80] 两条，同根因）：① `provider` enum 落后于 zod 源，缺 getoneapi/exa/tikhub/grok 四 provider（enum 仅 11 个：claude/codex/antigravity/kimi/glm/minimax/deepseek/tavily/firecrawl/mimo/opencode_go，zod 源 `usageProviderSchema` 已含 15 个）；② items 缺 `cycleDurationMs` 字段，且 `additionalProperties:false` 会拒绝含该字段的插件输出（`usageItemSchema` 声明了 `cycleDurationMs: z.number().nonnegative().nullable().optional()`，所有连接器脚本如 connectors/claude/connector.ts:80、connectors/opencode_go/connector.ts:329 都输出该字段）。
- 影响：该 JSON 是跨服务/插件对外契约；外部消费者按它校验会误判合法输出非法（缺 provider 被判非法、含 cycleDurationMs 的输出校验失败）。
- 根因（产品缺陷）：`scripts/export-schemas.ts` 导出物未随 zod 源重跑——`git log` 确认导出物最后更新于 2026-07-03（`1a3bc4f9 chore: remove gemini provider`），zod 源最后更新于 2026-08-05（`1fc78fed`），`pnpm schema:export` 未随 t050/t051/grok 连接器重跑。修复：运行 `pnpm schema:export` 重新生成并提交 schema.json，或在 CI 中加入「导出物与源一致」检查（对比 `zodToJsonSchema` 输出）。
- 测试缺口：无「导出物与源一致」检查（对比 `zodToJsonSchema` 输出）；`package.json` 仅 `schema:export` 脚本，CI（ci.yml/nightly.yml/release.yml）与 `pnpm check` 均不执行，漂移会持续累积。
- 线索：docs/reviews/review_20260813_114911/review_intensive.md 第 15、17 行
- 来源：review_20260813_114911/review_intensive
- 处理：ed51a5e8
