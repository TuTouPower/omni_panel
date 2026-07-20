# Task plan

## 步骤与验证

1. CI web e2e 策略：ci.yml 不跑 web project（web e2e 需本机 fixture）；ci.yml 注释说明 → 验证：ci.yml 含说明
2. webServer 决策：保留顶层（Playwright 无 project 级 webServer，拆 config 成本 > 收益），ADR 008 记 → 验证：decisions.md ADR 008
3. testing.md 补 web e2e 章节（录制 `pnpm e2e:gen-data` 流程 + CI 不跑 web + 三路 project 对照表）→ 验证：testing.md 含
4. handoff.md 追加 e2e 改造交接段 → 验证：handoff.md 含
5. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 无代码风险（纯文档 + ci.yml 注释）

## Finalization 时更新的 blueprint

- decisions.md：ADR 008 webServer 顶层保留 + CI web e2e 跳过
