<!-- omni_powers: blueprint/conventions -->

# OmniUsage 编码约定

编码规范的唯一真相源。技术栈/目录见 `architecture.md`；业务不变量见 `domain.md`；测试见 `test.md`。

## 1. 命名

- 变量、函数、文件名、目录名一律 **`snake_case`**。例外：大写文件名（`CLAUDE.md`/`README.md`）保持原样。
- React 组件文件与组件名用 **`PascalCase`**（`CpaCard.tsx`、`SettingsView.tsx`）——沿用现有渲染层风格。
- 类型/接口用 `PascalCase`（`ConnectorConfiguration`、`Observation`）。
- 常量用 `UPPER_SNAKE_CASE`（`DEFAULT_TIMEOUT_MS`、`MAX_HEIGHT_RATIO`）。
- 术语中英一律以 `domain.md` §5 为准，落后词先改表再改代码。

## 2. 风格

- 缩进 **4 空格**，禁止 tab（prettier 强制）。
- 严格 TypeScript；共享类型放 `src/shared/`，主/渲染各自不重复定义。
- 不可变优先：runtime-store `getAll` 返回拷贝；observation/config 经 Zod 校验后视为只读 DTO。
- 精准修改：只动必须动的，删除因自己修改而变无用的 import/变量，不动既有死代码。

## 3. 日志

- **禁止 `print`/`console.log` 调试输出**，一律走 `src/shared/lib/logger.ts` 模块化 logger（scheduler / runtime / connector-sandbox / vault / session / local-api / ipc）。
- 日志 7 天滚动；scrubber 强制内联在写入路径，**开发期同样脱敏**，secret 一律记为 `***`。
- renderer 日志经 `LOG_RENDERER` IPC 转发主进程，preload 侧限流（100 条/秒），meta 仅 dev 保留。

## 4. 浏览器/网络 API 约定

- **所有出网走宿主 NetClient（undici）**，不在连接器/渲染层直接 `fetch`。代理、endpoint override、超时、SSRF 防护统一在此生效。
- 连接器脚本沙箱内无 `fetch/require/fs/process/timer`，只能用注入的 `ctx.http` / `ctx.files` / `ctx.params` / `ctx.log`。
- 渲染进程无 `fs/child_process/ipcRenderer` 直连，只调 `window.usageboard.*` 白名单。

## 5. 写一个新连接器（适配器步骤）

1. 建 `connectors/{id}/manifest.json`，按 `src/shared/schemas/manifest.ts` 的 `manifest_schema`（`.strict()`）填：`id` / `provider`（必须在 `connectorProviderSchema` 白名单）/ `capabilities` / `parameters` / `endpoints` / 能力配置（`poll`/`local`/`session`/`observe`）。
    - secret 参数若脚本要读明文，设 `exposeToScript:true`（默认 false）。
    - 需强制用户显式配 endpoint（如 CPA 本地 Manager）设 `requireExplicitEndpoints:true`。
2. 写 `connectors/{id}/connector.ts`：
    - `declare const ctx: ConnectorContext;`（契约见 `src/main/core/connector/host-io.ts`）。
    - 入口 `function main(): ScriptObservation[]`（可 `async`）。**禁止 `import`/`export` 语句**（运行时正则拦截）。
    - 用 `ctx.http.get_json/post_json/get_raw(endpoint_key, path, opts?)`、`ctx.files.read/list(pathPattern)`、`ctx.params[name]`、`ctx.log.*`。
3. 返回 `ScriptObservation[]`（snake_case 字段，见 `src/shared/schemas/observation.ts`）。**不要设 `source_instance_id`**——宿主盖章。
4. `account_id` 用服务商返回的稳定标识（邮箱/UUID/workspace id），**绝不用实例+序号**（`domain.md` 不变量 3）。
5. 新 provider 需同步：`usageProviderSchema` 枚举、`src/renderer/lib/provider-usage.ts` 的 `PROVIDER_ORDER` + `PROVIDER_LABELS`、logo 资源。
6. 补测试（见 `test.md`）。

> 阈值约定：percent 型（used 是百分比）用 90 critical / 75 warning；ratio 型（used/limit）用 0.9 / 0.75；余额型（越低越危险，如 DeepSeek）反向。

## 6. 提交 & 质量门

- Commit message 走行业规范：`feat/fix/refactor/docs/test/chore(scope): 描述`，不受极简模式影响。
- 一次 commit 一个连贯改动，不混入无关变更。
- 合并前跑 `pnpm check`（typecheck + lint + format:check + deadcode + arch）与 `pnpm test`。
- 改代码后检查 `docs/` 与 `CLAUDE.md` 是否受影响，一并更新。
