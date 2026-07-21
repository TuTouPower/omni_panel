# Task plan

## 步骤与验证

1. 改 gen_fixture trend 段（遍历 state items 录全部）→ 验证：读源码
2. 改 mock_server trend 精确匹配 → 验证：读源码
3. 改 gen_synthetic trend 拷贝全部 → 验证：读源码
4. 启 packaged app → gen-data（录全 trend）→ gen-synthetic → 验证：responses.json/synthetic.json trend 多条
5. `MOCK_FIXTURE=synthetic pnpm test:e2e:web` → 验证：跑通
6. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：trend 全录慢（55 组合）→ 可接受（一次性，gitignore）
- 回退：trend 段还原首条 + 前缀匹配

## Finalization 时更新的 blueprint

- 无
