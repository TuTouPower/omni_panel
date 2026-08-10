# p091 synthetic.json 2-space 缩进脱离仓库 prettier 规范（2026-08-08）

- 来源：t266 review f002 遗留
- 内容：`tests/e2e/fixtures/synthetic.json` 由 `scripts/e2e/gen_synthetic.mjs` 以 `JSON.stringify(out, null, 2)` 生成（2-space），仓库 prettier 配置 tabWidth=4，`pnpm format:check` 对该文件恒 warn。锚点版本同样 warn，属既有状态非 t266 引入。改脚本生成缩进为 prettier 对齐会破坏「产物与脚本一致」的再生成约定，故不动。
- 处理：未开
