# Task plan

## 步骤与验证

1. 读 `src/main/core/local-api/server.ts` 路由顺序 + `check_auth` 位置，列敏感端点当前绑定与 auth 前后 -> 验证：（已完成）端点清单：L243 secrets/config GET·POST、L246 connectors POST/refresh，均落 L255 check_auth 前；L472 绑 0.0.0.0
2. 读 `docs/specs/web-panel.md` §2 既有决策原文 -> 验证：（已完成）§2 明文「局域网不考虑安全」「secrets 明文返回」
3. 出方案对比（A/B/C/D）+ 推荐 -> 验证：（已完成）见 task.md 过程记录
4. **交用户决策** -> 验证：（已完成）用户选 **A 保持现状**
5. 按 A 落地：改 web-panel.md §2 补风险接受 + §8 记录评估结论；无代码改动 -> 验证：文档更新覆盖风险面 + 决策 A 记录
6. 收尾：未改代码/测试，按 Step 6「否→改必要文档后直接收尾」，不走双审

## 风险与回退

- 风险：用户选择「保持现状」-> 本 task 不改代码，仅补 §2 风险接受说明
- 风险：收紧后破坏现有 LAN 跨机访问使用场景
- 回退：保留 opt-in 配置项（默认收紧，用户可显式放开）

## Finalization 时更新的 blueprint

- `docs/specs/web-panel.md` §2：按用户决策更新（收紧则改决策；保持现状则补风险接受）
- `docs/blueprint/architecture.md`：若 auth 体系变更，更新 local-api 章节
