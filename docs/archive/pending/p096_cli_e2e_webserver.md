# p096 cli e2e 项目继承全局 webServer（2026-08-09）

- 来源：t280 review Round 1 f005（minor）
- 内容：`tests/e2e/cli/cli_flow.spec.ts` 所在 cli 项目继承 playwright.config 全局 `webServer`（5174 vite preview mock），cli 测试自起 `--cli serve` 真实实例，不依赖 webServer；playwright 无按 project 关闭 webServer 的机制，vite preview 闲置启动（无害但多余）。future: playwright 支持 project 级 webServer 后可优化。
- 处理：t287
