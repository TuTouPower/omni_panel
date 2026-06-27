# OpenCode 用量统计实现进度记录

日期：2026-06-13
工作目录：`D:\Dev\Code\omni_usage\.claude\worktrees\opencode-usage`

## 目标

添加 OpenCode Web 登录 Cookie 用量统计，类似现有 MiMo：

- 通过网页登录 Cookie 认证。
- 只展示百分比，不展示 token 绝对值。
- 展示三类用量：
    - 滚动用量
    - 每周用量
    - 每月用量

## 已确认的 OpenCode 数据来源

从抓包文件 `C:\Users\TestUser\Downloads\capture_all_capture_1781283522049_o5yz5cb.json` 确认：

- OpenCode 使用 SolidJS server function。
- 响应不是 JSON，而是 `text/javascript`。
- 用量接口返回内容示例包含：

```js
rollingUsage: { status: "ok", resetInSec: 12210, usagePercent: 10 }
weeklyUsage: { status: "ok", resetInSec: 198063, usagePercent: 85 }
monthlyUsage: { status: "ok", resetInSec: 2465553, usagePercent: 42 }
```

## 协议结论

OpenCode 不适合硬编码 API id。

原因：`/_server?id=<server_ref>&args=<encoded>` 里的 `server_ref` 来自页面 JS：

```js
createServerReference("<64 hex>");
```

这个值可能随 OpenCode 构建变动。

正确方案：

1. 访问 `https://opencode.ai/go`。
2. 从页面脚本里找 `checkLoggedIn.get` 的 server reference。
3. 调用 `/_server` 获取 workspace id。
4. 访问 `https://opencode.ai/workspace/<workspace_id>/go`。
5. 从 workspace 页面脚本里找 `lite.subscription.get` 的 server reference。
6. 调用 `/_server` 获取用量文本。
7. 从 SolidJS payload 里解析 `rollingUsage / weeklyUsage / monthlyUsage`。

## 当前已改代码

### 1. SDK HTTP client 增加 text 响应支持

文件：`src/plugins/sdk/http-client.ts`

已做：

- `HttpClient` 增加：

```ts
getText(endpointKey: string, path: string, opts?: HttpRequestOptions): Promise<Result<string>>;
```

- 内部 `call()` 增加响应类型：

```ts
type ResponseType = "json" | "text";
```

- text 模式行为：
    - HTTP 状态码 `< 400`：返回原始 body text。
    - HTTP 状态码 `>= 400`：返回 `{ kind: "http", status, body: text }`。

### 2. HTTP client 相关生命周期实验

为了排查 HTTPS stub 超时，尝试过以下改动：

- `src/plugins/sdk/define-plugin.ts`
    - 尝试在插件 handler 完成后关闭 fd3 quit pipe。
    - 尝试 `process.exit(0)`。
    - 尝试 `process.stdout.write/end` 后退出。
    - 最后为了避免破坏现有插件运行速度，已回退到接近原始同步输出逻辑。

当前该文件仍有一处变化：

```ts
handler(ctx)
    .then(async (result) => {
        await ctx.http.close();
        finish(result);
    })
    .catch(async (err: unknown) => {
        await ctx.http.close();
        finish(normalizeError(err));
    });
```

这是为了尝试清理 undici dispatcher。

### 3. bundled resource hash 已自动更新

文件：`src/main/core/plugin/bundled_resource_verifier.ts`

`pnpm test` 的 pretest 自动更新了 SDK hash。

## 当前测试情况

### 已通过

以下 focused tests 通过过：

```bash
pnpm exec vitest run tests/unit/plugin/mimo-usage-plugin.test.ts
pnpm exec vitest run tests/integration/plugin/runner.test.ts
```

结果：通过。

### HTTPS stub 的状态

命令：

```bash
pnpm exec vitest run tests/integration/plugin/https_stub.test.ts --no-file-parallelism --testTimeout 30000
```

曾经在 runner 放宽“超时但已有 stdout”后通过，但这个方案有副作用，不应保留。

后来回退 runner 后，HTTPS stub 又失败：

- 前 4 个 case 在默认 5s test timeout 下超时。
- slow response case 仍触发 `PluginTimeoutError`。

### 完整测试状态

命令：

```bash
pnpm test
```

第一次完整测试：

- 主测试阶段只失败 1 个：
    - `tests/integration/config/secrets-store.test.ts`
    - Windows 临时文件 rename `EPERM`
- 单独重跑该文件通过，判断是瞬时 Windows 文件锁问题。

第二次完整测试：

- 非 plugin 阶段通过。
- plugin integration 阶段大量 5s timeout。
- 说明当前插件进程退出/测试超时问题尚未正确解决。

## 关键踩坑

### 1. HTTPS stub 不是请求没打到

用临时脚本验证过：

- 插件请求能到达 stub。
- stub requests 数量为 1。
- 请求头包含：

```json
{
    "connection": "close",
    "accept": "application/json",
    "authorization": "Bearer sk-test"
}
```

说明 TLS、证书、路由都不是主因。

### 2. 插件已经写出 stdout，但子进程不 close

临时 raw spawn 验证过：

- stdout 已经有完整 JSON：

```json
{"success":true,"schemaVersion":2,"items":[...]}
```

- 但 child process `close` 事件 5s 内不触发。

说明问题是插件子进程仍有 active handle，runner 等不到退出。

### 3. runner 放宽超时不是好方案

曾改过 runner：

```ts
if (timedOut && stdout.length === 0) reject(...)
else resolve(...)
```

这能让 HTTPS stub focused tests 通过。

但完整 plugin integration 会变慢并大量触发 5s test timeout。

结论：不能用这个方案。

### 4. `dispatcher.close()` 可能太慢

尝试让 `ctx.http.close()` 调 `dispatcher.close()`。

现象：插件仍可能在 15s 后才退出或不退出。

后续改成 `dispatcher.destroy()`，但 focused HTTPS 仍未稳定通过。

## 当前风险

当前代码处于“Task 1 尚未完成”的中间状态。

需要注意：

- `src/plugins/sdk/http-client.ts` 里新增了 `close()`。
- `src/plugins/sdk/define-plugin.ts` 里 handler 完成后会 `await ctx.http.close()`。
- 这可能影响所有 bundled plugin 的退出时间。
- 不能继续 Task 2-6，直到 Task 1 的退出问题被彻底解决。

## 建议下一步

### 优先修 Task 1

不要继续 OpenCode provider/plugin/UI。

先把 SDK text 支持做稳：

1. 保留 `getText()`。
2. 重新设计 HTTP client 清理方式。
3. 明确插件进程为什么 stdout 后不 close。
4. focused tests 必须通过：

```bash
pnpm exec vitest run tests/unit/plugin/mimo-usage-plugin.test.ts
pnpm exec vitest run tests/integration/plugin/runner.test.ts
pnpm exec vitest run tests/integration/plugin/https_stub.test.ts --no-file-parallelism
```

5. 再跑完整：

```bash
pnpm test
```

### 可考虑的修复方向

#### 方向 A：避免每个 HTTP client 创建自己的 Agent

当前 `new Agent()` 可能引入额外生命周期问题。

可以试：

- 不自建 Agent。
- 不加 `close()`。
- 只用 undici 默认 dispatcher。
- 在请求 options 里用 dispatcher 只处理 proxy 场景。

#### 方向 B：给 HTTPS stub 测试显式提高 test timeout

当前 HTTPS stub 本来有 15s/20s 插件 timeout，Vitest 默认 5s 不匹配。

即使逻辑正确，默认 `pnpm test` 也会因为 5s 超时失败。

应在 `tests/integration/plugin/https_stub.test.ts` 给前 4 个测试加 `{ timeout: 25_000 }`，或 describe 级别设置。

但这只能解决 Vitest 5s timeout，不解决插件子进程 15s 才 close 的问题。

#### 方向 C：先单独验证非 HTTPS plugin 是否被当前 `ctx.http.close()` 拖慢

跑：

```bash
pnpm exec vitest run tests/integration/plugin --no-file-parallelism
```

观察是不是只有 HTTP 插件慢，还是所有插件都慢。

## 尚未开始的计划任务

### Task 2：注册 OpenCode provider

预计修改：

- `src/shared/schemas/plugin-output.ts`
- `src/plugins/sdk/result.ts`
- `src/renderer/lib/provider-usage.ts`
- `src/renderer/components/Icon.tsx`

### Task 3：添加 OpenCode bundled plugin

预计新增：

- `assets/plugins/opencode-usage-plugin.ts`
- `tests/unit/plugin/opencode-usage-plugin.test.ts`

插件核心逻辑：

- `SESSION_COOKIE` 参数。
- `ctx.http.getText()`。
- 解析 SolidJS server payload。
- 输出三条 percent usage item。

### Task 4：泛化 Cookie 登录

预计修改：

- `src/main/ipc/auth-ipc.ts`

目标：

- MiMo 使用 `persist:mimo-login`。
- OpenCode 使用 `persist:opencode-login`。

### Task 5：设置 UI 和 Cookie refresh

预计修改：

- `src/renderer/components/AddAccountDialog.tsx`
- `src/renderer/components/SettingsForm.tsx`
- `src/main/core/cookie-refresh/cookie-refresh-service.ts`

### Task 6：文档和最终验证

预计：

- 更新受影响 docs。
- 跑 `pnpm test`。
- 涉及 UI 后必须手工点击验证。
- 涉及打包后必须 `pnpm package && ./artifacts/win-unpacked/OmniUsage.exe` 验证。

## 当前 git 状态要点

已修改文件大致包括：

- `src/plugins/sdk/http-client.ts`
- `src/plugins/sdk/define-plugin.ts`
- `src/main/core/plugin/runner.ts` 曾改过但已回退关键逻辑
- `src/main/core/plugin/bundled_resource_verifier.ts`
- 新增本文档：`docs/opencode_usage_progress.md`
- worktree marker：`docs/superpowers/plans/2026-06-13-opencode-usage.md`

继续前建议先看：

```bash
git diff -- src/plugins/sdk/http-client.ts src/plugins/sdk/define-plugin.ts src/main/core/plugin/runner.ts
```

## 结论

OpenCode 协议和实现方案已基本明确。

阻塞点不是 OpenCode 本身，而是为了支持 `text/javascript` 响应改 SDK 后，引发/暴露了 bundled plugin 子进程退出问题。

必须先修好插件 HTTP client 生命周期和 HTTPS stub 测试，再继续 OpenCode provider/plugin/UI。
