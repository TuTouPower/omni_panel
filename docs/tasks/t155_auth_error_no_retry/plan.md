# Task plan

## 步骤与验证

1. 红：在 `tests/unit/scheduler/` 新增错误分类单测（403、"invalid management key" 等应判 auth error）；在 `tests/integration/scheduler/refresh-service.test.ts` 加用例：key 类 auth error 时 connector 只被调用 1 次 → 验证：`pnpm vitest run` 相关文件红。
2. 绿：扩展 `is_auth_error`（refresh-service.ts:54）覆盖 403/invalid key 变体；重试循环中 auth error（且非待触发 re-login 的 session 场景）直接 `break` 出循环走 stale 标记路径 → 验证：单测转绿。
3. 回归：跑 `tests/integration/scheduler/refresh-service.test.ts` 全量 + `pnpm test` 黑盒 → 验证：全绿。
4. 评估调度层退避：若单次不重试后仍被高频调度打 401，评估对认证失败实例拉长刷新间隔（如指数退避或暂停至配置变更）；做与不做都在 task.md 记录理由 → 验证：若做，补单测；若不做，task.md 写明。

## 风险与回退

- 风险：误伤依赖首次 auth error 触发 auto re-login 的 session 流程——re-login 必须在第一次 auth error 时照常触发，重登录成功后允许继续重试；只有"非 session 连接器"或"re-login 已做过仍 auth error"才停止重试。
- 风险：`is_auth_error` 靠消息子串匹配，扩展 403 可能误伤"403 但非认证问题"的瞬时响应（如 WAF 拦截）；接受该误伤（403 重试通常同样无意义），reviewer 若异议再收窄。
- 回退：`git revert` 本 task commit 即可，无数据迁移。

## Finalization 时更新的 blueprint

- `docs/blueprint/domain.md` 或 `architecture.md`：刷新重试策略条目（auth error 不重试的语义）——若有对应小节则更新，无则写"无"。
