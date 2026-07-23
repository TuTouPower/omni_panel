# OmniUsage 全量代码审阅 — Opus

- 审阅时间：2026-07-23
- 审阅模型：Claude Opus（主审 + 6 路并行子审，均继承主会话模型）
- 审阅范围：全量代码库（src 152 文件 / tests 196 文件 / 13 个 connectors / scripts / config / 构建工具链）
- 审阅方式：6 路并行只读子审按模块分工（main 核心 / connectors / renderer / IPC+security+shared / scripts+tests / 构建配置），主审对 critical 与关键 important 逐行复核验证
- 性质：单路独立审阅报告，不改源文件，不汇总其他模型

## 0. 执行摘要

共发现 **2 critical / 29 important / 38 minor**。最该立即处理的 5 项：

1. **[critical] local-api 无 auth 暴露明文密钥**（`src/main/core/local-api/server.ts:472,243,363`）— 服务绑 `0.0.0.0`，`/v1/secrets` GET、`/v1/config` POST、`/v1/secrets` POST、`/v1/connectors/*/refresh` POST 全部落在 `check_auth` 之前。同局域网任意主机可读明文密钥、篡改配置、注入密钥。**已主审验证**。
2. **[critical] mimo 余额阈值方向用反**（`connectors/mimo/connector.ts:160`）— `balance >= 0 ? "normal" : "critical"`，余额 0.01 元即将耗尽仍标 normal，只有负数才 critical，违反 domain.md 余额型反向不变量。**已主审验证**。
3. **[important] 图表 tooltip XSS**（`BarChart.tsx:91,96,99` / `MetricDonut.tsx:32`）— ECharts tooltip formatter 拼 HTML，label/seriesName/name 未转义，同目录已有 `escapeHtml` 却未统一使用。web 构建下可触发脚本执行。
4. **[important] 大量连接器 status 硬编码 "normal"** — claude/firecrawl 跳过阈值计算，使 percent/ratio 型 critical/warning 完全失效；CPA silent staleness（空响应既不 observation 也不 report_failed_account）违反"零有效观测视为采集异常"。
5. **[important] 测试反模式集中** — 3 类伪测试（重实现生产代码、重言式断言本地常量、"triggers" 用例只断言不崩溃）+ `setupFiles` 全局注入 mock 让 renderer 测试默认拿到完整 mock API。

### 严重度统计

| 模块                              | critical | important | minor  |
| --------------------------------- | -------- | --------- | ------ |
| main 核心                         | 1        | 2         | 4      |
| connectors                        | 1        | 7         | 14     |
| renderer                          | 0        | 4         | 10     |
| IPC / preload / security / shared | 0        | 2         | 5      |
| scripts + tests                   | 0        | 9         | 5      |
| 构建配置 / 依赖                   | 0        | 5         | 7      |
| **合计**                          | **2**    | **29**    | **45** |

> minor 实际合计去重后约 38 条（部分同模块同模式合并到"跨模块共性"节展开）。

---

## 1. Critical

### C1. local-api 无 auth 暴露明文密钥与写端点（已主审验证）

- 位置：`src/main/core/local-api/server.ts:472`（`active_server.listen(target_port, "0.0.0.0")`）、`:243`（`handle_web_config` 在路由链中先于 `check_auth` 调用）、`:255`（`check_auth` 位置）、`:363`（`/v1/secrets` GET 分支）、`:350`（`/v1/config` POST）、`:246`（`handle_web_connector`，含 `/v1/connectors/*/refresh` POST）
- 现象：路由顺序为 `/v1/health` → 静态资源 → web 读端点 → **`handle_web_config`（含 secrets 读/写、config 写）+ `handle_web_connector`（含 refresh 写）** → `/v1/events` → `check_auth` → `/v1/ingest`。注释（`:235-236`）声称"web read endpoints 无 auth 是内网决策，ingest 仍 token-gated"，但 `/v1/secrets` GET 返回 `handleConfigGetSecrets` 的明文密钥、`/v1/config` 与 `/v1/secrets` POST 可写，已远超"只读 panel"的注释意图。
- 影响：绑定 `0.0.0.0` 下，同一局域网任意主机可 `GET /v1/secrets?instanceId=xxx` 读全部明文密钥、`POST /v1/config` 篡改配置（可改 `endpointOverrides` 把密钥发往攻击者主机，与 architecture.md §6 已知限制叠加）、`POST /v1/secrets` 注入密钥、`POST /v1/connectors/*/refresh` 触发刷新。
- 建议：
    1. 将 `handle_web_config`、`handle_web_connector` 移到 `check_auth` 之后；
    2. `/v1/secrets` GET 即便 auth 后也应额外限制（loopback-only 或独立高权 token）；
    3. 若 web panel 真需跨机读，把"读 panel UI"与"读 secrets/写配置"拆成两个 token 等级；
    4. 重新评估 `0.0.0.0` 绑定——单机桌面应用默认应 `127.0.0.1`，跨机访问改为显式 opt-in。

### C2. mimo 余额阈值方向用反（已主审验证）

- 位置：`connectors/mimo/connector.ts:160`
- 现象：`status: balance >= 0 ? "normal" : "critical"`。余额 `balance`（剩余金额）≥0 即 normal，只有负数才 critical。
- 违反：domain.md §4 不变量 6 与 conventions.md 连接器阈值约定——余额型（越低越危险）应反向：`ratio=balance/limit; ratio<=0.1?"critical":ratio<=0.2?"warning":"normal"`，与 deepseek 余额型语义对齐。
- 影响：用户余额 0.01 元（即将耗尽）时 UI 仍标"正常"，核心告警功能失效，直接误导。
- 建议：改用 `status_for_balance(balance, limit)` 或等价 ratio 反向判定。

---

## 2. Important

### 2.1 main 核心

- **I1 vault 主密钥损坏时静默覆盖**（`src/main/core/vault/file-vault-backend.ts:66-80`）— `ensure_master_key` 中显式 `throw new Error("Invalid vault key length")` 被同一 `catch {}`（`:73`）捕获，与 ENOENT 走同一分支：生成新 key 覆盖旧文件。`vault.key` 若被截断/部分写入（磁盘满、异常关机），所有旧密文永久不可解密，用户密钥静默丢失。建议：catch 区分 ENOENT 与显式 throw；key 文件存在但长度不对时报错不覆盖，强制从 `.bak` 恢复。
- **I2 is_auth_error 误匹配 "token"**（`src/main/core/scheduler/refresh-service.ts:54-62`）— `lower.includes("token")` 命中任何含 "token" 的错误（JSON "unexpected token"、"token pool exhausted"），触发非必要交互式 re-login 窗口（`:349-370`）。建议：仅在 HTTP 401 / `unauthorized` / `invalid_token` / `www-authenticate` 响应头时触发。

### 2.2 connectors

- **I3 claude status 硬编码 "normal"**（`connectors/claude/connector.ts:85,104`）— 已用 `pct()` 算百分比却未应用 90/75 阈值，5 小时/一周窗口达 95% 仍标 normal。建议：复用 `status_for_pct(used)`。
- **I4 firecrawl status 硬编码 "normal"**（`connectors/firecrawl/connector.ts:77`）— `status: "normal" as const` 写进 `base`，credits/tokens 用尽（used/limit ≥ 0.9）也标 normal。建议：`status_for_ratio(used, limit)`。
- **I5 CPA silent staleness**（`connectors/cpa/connector.ts:524-540`）— `fetch_provider` 在 manager 转发上游非 2xx 时 `parse_api_body` 静默返回 `{}`，`parse_provider` 返回 `[]`，该账号既无 observation 也未 `report_failed_account`，违反"采集成功但零有效观测视为采集异常"。建议：`parse_api_body` 非 2xx throw，或 main 检测 `keys.length===0` 时 `report_failed_account`。
- **I6 deepseek 固定 account_id 致多实例 collapse**（`connectors/deepseek/connector.ts:65`）— `account_id: "deepseek"` 固定，`/user/balance` 不返回账号标识，多 API key 实例会在 store collapse。建议：对 API_KEY 做 hash 生成稳定区分。
- **I7 firecrawl 固定 account_id**（`connectors/firecrawl/connector.ts:67`）— 同上，建议 API key hash。
- **I8 kimi cycleDurationMs 语义相反**（`connectors/kimi/connector.ts:62-63,93-95`）— `reset_at - now`（距下次重置剩余时间，周期开始≈7d、临近重置≈0）当"周期时长"填，与 claude/cpa/glm 固定周期常量用法相反。建议：直接用 `7*24*3_600_000` 与 `5*3_600_000`。
- **I9 opencode_go cycleDurationMs 语义混淆**（`connectors/opencode_go/connector.ts:176`）— `reset_in_sec * 1000`（距重置剩余秒数）当"周期时长"。建议：rolling 用 null，weekly/monthly 用固定常量。

### 2.3 renderer

- **I10 BarChart tooltip XSS**（`src/renderer/components/token-stats/BarChart.tsx:91,96,99`）— ECharts tooltip formatter 拼接 HTML，`label`/`p.seriesName`/`otherDetails` 未转义；xaxis=session 时 label 是用户会话标题，xaxis=project 时是目录名，seriesName 是 model/项目名。ECharts tooltip 经 innerHTML 渲染。`chart-data.ts:323` 已有 `escapeHtml` 却只用于 `extra` 字段。建议：所有动态字符串经 escapeHtml，或 formatter 返回 DOM 节点。
- **I11 MetricDonut tooltip XSS**（`src/renderer/components/token-stats/MetricDonut.tsx:32`）— `${p.name}` 未转义，segment.name 为原始 model 名/目录名。建议：escapeHtml(p.name) 或在 segment 构造时统一转义。
- **I12 AccountRow 把 unknown 误标"正常"**（`src/renderer/components/AccountRow.tsx:29-40`）— `get_account_status` 只识别 disabled/error/auth，`status="unknown"` 落入 `:39` 返回"正常"。配合 `SettingsView.tsx:1506-1515` 的 `map_status`，pending/loading → unknown → AccountRow 显示"正常"，未连接账号被误标正常。建议：unknown 单独返回"未连接"。
- **I13 SettingsForm 未 catch 保存错误**（`src/renderer/components/SettingsForm.tsx:220-258`）— `void onSave(...).then(...).finally(...)` 无 `.catch`，onSave 或 then 内 await 抛错变 unhandled rejection，finally 重置 saving 但用户看不到错误。对比 `CpaConnectorSettings.tsx:212-233` 有 `.catch(setError)`。建议：补 .catch。

### 2.4 IPC / preload / security / shared

- **I14 CONFIG_GET_SECRETS 不校验 route**（`src/main/ipc/config-ipc.ts:432`）— 只调 `assert_valid_sender`，未校验 sender 所在 route；preload route 分权是唯一防线。被 XSS 的非设置窗（或 contextIsolation 被绕过）可直接拉所有明文密钥。建议：主进程解析 `event.senderFrame.url` hash 或维护 webContents→route 映射，非 setting route 直接拒绝。与 C1 叠加形成密钥访问链路的纵深防御缺失。
- **I15 file:// 任意路径放行**（`src/main/ipc/helpers.ts:24`）— `url.startsWith("file://")` 任意路径放行，未限到打包 index.html 路径，任何能进 renderer 进程的 file:// HTML 都能调 IPC。建议：与 `rendererIndexPath` 白名单比对。

### 2.5 scripts + tests

- **I16 task.py save 非原子**（`scripts/task.py:52-54`）— `write_text` 直接覆盖，无 tmp+rename+fsync；中断/掉电即损坏权威 task JSON。建议：临时文件 + `os.replace` 原子替换。
- **I17 task.py finish/drop 非事务**（`scripts/task.py:153-163,166-177`）— 跨 3 次磁盘写且非事务（active→done、archive append、active remove），任一次中断会留下 done task 同时在 active 与 archive，重跑 `finish` 被 `require_status("active")` 拒绝。建议：先 append archive 确认落盘后再清 active，或加恢复入口。
- **I18 deep_freeze 测试重实现生产代码**（`tests/unit/main/deep_freeze.test.ts:3-14`）— 注释自承重写生产 `runtime.ts:19` 的 `deep_freeze` 再测副本，生产改了测试不会失败。建议：导出生产函数或改用集成入口测副作用。
- **I19 observation_store_migration 测 SQLite 自己**（`tests/unit/observation_store_migration.test.ts:34-43`）— 测试内手写 `PRAGMA + ALTER TABLE` 断言 ALTER 成功，生产 `observation-store.ts:116-132` 真实迁移从未被调用。建议：导入并调用生产迁移入口。
- **I20 tray_menu 测试重言式**（`tests/unit/main/tray_menu.test.ts:12-60`）— `ZH_LABELS`/`EN_LABELS` 是测试内本地常量，断言"数组包含自身元素"，生产 `TrayMenu.tsx:58-153` 真实 label 完全未触碰。仅 IPC_CHANNELS 部分有效。
- **I21 两个 refresh e2e 仅断言"不崩溃"**（`tests/e2e/electron/tray_menu_actions.spec.ts:37-48`、`tests/e2e/web/scheduler.spec.ts:37-47`）— 用例名"triggers refresh"，实际只断言按钮可见 + 1000ms 死等。建议：断言刷新请求发出或 spinner 状态翻转。
- **I22 setupFiles 全局注入 mock**（`tests/smoke/setup.ts:17,205-219`）— 作为所有 vitest 测试的 `setupFiles`，在 unit/integration 的 beforeEach 里覆盖 `window.usageboard`，renderer 测试默认拿到完整 mock API，掩盖真实集成问题，与"少 mock 多真实"冲突。建议：拆成 renderer-only 或仅 smoke 套件加载。
- **I23 synthetic fixture 下永久 skip 关键 case**（`tests/e2e/web/multi_account.spec.ts:39`、`popup_card_states.spec.ts:31`、`settings_provider_accounts.spec.ts:38`、`opencode_go_usage.spec.ts:22`）— `test.skip(true,...)` 跳过 KIMI 合并强校验、failed card 渲染、accounts 行、opencode_go 多账号；CI 永不执行，关键路径仅本地 real-fixture 覆盖。CI 绿不代表这些路径真覆盖。

### 2.6 构建配置 / 依赖

- **I24 11 个 ESLint 插件装了不用**（`package.json:86-105,116`）— `eslint.config.ts` 实际只用 `typescript-eslint`、`eslint-plugin-import-x`、`eslint-plugin-react-hooks`；未使用：`@typescript-eslint/eslint-plugin`、`@typescript-eslint/parser`、`eslint-plugin-import`、`eslint-plugin-jsx-a11y`、`eslint-plugin-n`、`eslint-plugin-perfectionist`、`eslint-plugin-promise`、`eslint-plugin-react`、`eslint-plugin-security`、`eslint-plugin-sonarjs`、`eslint-plugin-unicorn`，且被 knip `ignoreDependencies` 静默。建议：按需启用规则或移除，别让"装了即等于查了"造成错觉。
- **I25 esbuild 错放 dependencies**（`package.json:124`、`electron.vite.config.ts:9`）— 列入 `dependencies` 且 `rollupOptions.external` 外部化，但 src/scripts/tests/connectors 内无任何 import/require。建议：移到 devDependencies 或删 external 条目。
- **I26 package-and-run 误杀所有 electron.exe**（`scripts/package-and-run.ts:13`）— Windows 下 `taskkill /f /t /im electron.exe` 通杀系统内所有以 `electron.exe` 为进程名的应用。建议：按路径过滤仅杀 `artifacts/win-unpacked/OmniUsage.exe`。
- **I27 根 index.html 遗留引用不存在文件**（`index.html:10`）— 引用 `/src/renderer.ts`（文件不存在）；实际入口是 `src/renderer/index.html` 与 `src/web/index.html`。建议：删除该遗留文件。
- **I28 @types/node 未显式声明**（`package.json` devDependencies）— src/main 大量用 `node:*` 与 `process.*`，靠 vite/vitest 传递解析 `@types/node@25.9.1`，上游变更即 typecheck 全红。建议：显式加入 devDependencies。

---

## 3. Minor

### 3.1 main 核心

- `src/main/core/scheduler/snapshot-cache.ts:90-129` — `deserialize_entry` switch 无 default，缓存被篡改时 status 非法值隐式返回 undefined 写入 runtimeStore Map（getSnapshot 的 `?? idle` 兜底不崩但破坏类型契约）。建议：default 返回 `{status:"idle"}`。
- `src/main/core/local-api/server.ts:120` — `serve_static` 的 `decodeURIComponent(url.pathname)` 无 try-catch，畸形百分号编码（`%ZZ`）抛 URIError 落 500。建议：try-catch 后 400 或 fallback index.html。
- `src/main/core/connector/net-client.ts:347-419` — `get_raw` 不检查 `content-type: text/html`，与 `do_request`（`:302-311`）不一致；captive portal 场景 probe 会拿到 HTML。建议：同样检测 HTML 并抛错。
- `src/main/index.ts:849` — `before-quit` 的 `void local_api.stop()` 未 await，will-quit 的 `Promise.all` 未含 server 关闭，keep-alive 连接延迟退出。建议：纳入 will-quit flush 等待集合。

### 3.2 connectors

- `connectors/codex/connector.ts:122` — `status:"normal"`，`limit=null` 时无法算阈值，应 `"unknown"` 让 UI 不误报健康。
- `connectors/cpa/connector.ts:43-47` — `to_pct` 启发式 `raw<=1?raw*100:raw`，`utilization` 缺失时 `to_number(undefined)=0` → 返回 0% → `status_for_pct(0)="normal"`，数据缺失被误报"健康零用量"。建议：缺失返回 null 并跳过 status。
- `connectors/cpa/connector.ts:311-312` — `if (remaining<=1) remaining*=100` 启发式边界 1 歧义（1% vs 1.0 fraction），`min_remaining` 初值 100 与 fraction 路径混用易漏报。
- `connectors/glm/connector.ts:39-46` — `period_key` 用 `unit/number` 魔数（3/5、6/1、5/1）识别周期，API 新增编码静默 skip。
- `connectors/glm/connector.ts:128`、`connectors/kimi/connector.ts:67,100`、`connectors/mimo/connector.ts:124`、`connectors/minimax/connector.ts:156`、`connectors/tavily/connector.ts:72`、`connectors/grok/connector.ts:24` — 固定 `account_id` 字符串（详见 §4 共性 P2）。
- `connectors/kimi/connector.ts:46` — path `"coding/v1/usages"` 缺前导 `/`，与 manifest 不一致，靠 `new URL(path,base)` 隐式补全。
- `connectors/mimo/connector.ts:135-165` — `items.map` 若 items 为 `[]`，observations 为空，main 末尾静默返回 `[]`，违反"零有效观测视为采集异常"。
- `connectors/minimax/connector.ts:150` — `models.length===0 return []` 静默返回，同上。
- `connectors/minimax/connector.ts:189` — `cycleDurationMs: end_time - start_time`，数据异常 `end<start` 得负值，schema 未防护 `>=0`。
- `connectors/opencode_go/connector.ts:109` — `text.slice(index, index+300)` 固定 300 字符窗口，minified bundle 中 `$R[N]` 定义在窗口外会漏解析。
- `connectors/opencode_go/connector.ts:54-94` — `subscription_hash_from_query`/`nearest_subscription_hash` 依赖 minified bundle 结构，上游改 minifier 即失效，fragile-by-design，建议 docs 标注监控点。

### 3.3 renderer

- `src/renderer/components/GrokLoginSection.tsx:139-147` — `verification_uri_complete` 直接作 `<a href>`，未校验 scheme（应拒非 http/https）。
- `src/renderer/components/SettingsForm.tsx:229-235` — 保存成功后 `labelEdits` 未清空，下次未改动仍重写相同值。
- `src/renderer/views/TrayMenu.tsx:182` — `sep_indexes=new Set([3,5,10])` 硬编码与 items 顺序强耦合，增删菜单项易错位。
- `src/renderer/views/TrayMenu.tsx:21` — `decodeURIComponent(m[1]??"")` 无 try/catch，hash 含非法 % 序列会抛。
- `src/renderer/components/AliasEditor.tsx:51` — `key={i}` 用数组索引，删中间项 React 错位复用 input DOM。
- `src/renderer/components/token-stats/SessionTable.tsx:275-281` — `<th onClick>` 无 role/keyboard handler，键盘用户无法触发排序。
- `src/renderer/hooks/use-echarts.ts:21-23` — resize 监听无 throttle，拖窗口时高频同步 resize。
- `src/renderer/components/LabelMapDialog.tsx:42-62` — async IIFE 无 cancelled 标志，卸载后仍 setState（与 SettingsForm 的 cancelled 模式不一致）。
- `src/renderer/components/TrendSparkline.tsx:39,63-65` — `valid_points` 与 `valid` 重复过滤同 null 判定，可合并。
- `src/renderer/views/PopupView.tsx:31,705-722` — `VITE_ENABLE_TOKEN_PANEL` gating 下 TokenPanel 永远 `has_real_data={false}`，dead UI 路径；若不再启用应移除。
- `src/renderer/views/SettingsView.tsx:1880-1934` — "清除""重置"按钮无 onClick（装饰性），点击无反馈。

### 3.4 IPC / preload / security / shared

- `src/main/ipc/helpers.ts:26` — `url.startsWith(dev_url)` 前缀匹配可被相似前缀绕过（`http://localhost:5173evil.com`）。建议：比较 origin 或尾部加 `/`。
- `src/main/ipc/session-ipc.ts:18` — `cookie_names` 只用 `Array.isArray`，未校验元素类型；`login_url` 接受任意 HTTPS，未像 auth-ipc 限定到 manifest endpoints+loginDomains。建议：`z.array(z.string())` + 校验信任域。
- `src/main/ipc/config-ipc.ts:407-408` — `redact_config_raw` 用作 `CONFIG_GET_SECRETS` 的 redactResult，但对返回的 flat `Record<string,string>` 明文 value 走 else 分支不生效（依赖 scrubber 兜底）。建议：该通道单独 redactResult 全替换 \*\*\*。
- `src/shared/lib/config_redaction.ts:2-17` 与 `src/shared/lib/logger.ts:23-24` — secret key 正则两处各自维护且覆盖不一致（"authorization" 仅 logger；"publicKey"/"auth_header" 两处都不脱敏）。建议：抽统一模块。
- `schemas/plugin-output.schema.json:117-132` 与 `src/shared/schemas/plugin-output.ts:65` — JSON Schema 未把 `status` 列入 required（仅 default），Zod 用 `.default("unknown")`，跨契约歧义。建议：JSON Schema 加 required 对齐 Zod。

### 3.5 scripts + tests

- `scripts/process_logo.py:39-61` — `process_image` 声明 `-> Image.Image` 实际返回 `(Image, tuple)`，类型注解错误。
- `scripts/ensure_electron_abi.mjs:74-78` — `project_dir` 单引号插值进 PowerShell `-match`，路径含单引号/正则元字符可破坏命令。建议：参数化或转义。
- `scripts/render_icon.mjs:6`、`render-test-icons.mjs:6`、`export-schemas.ts:20-28` — 输入/输出路径依赖 `process.cwd()`，未在项目根执行会错位；与 `gen-build-info.ts` 用 `__dirname` 不一致。
- `tests/integration/connector/*.test.ts`、`tests/unit/connector/tier1-poll-executor.test.ts`、`tests/unit/renderer/components/cpa_card.test.tsx` — 14 个文件用 `vi.fn()` 不 import `{ vi }`，依赖 `globals:true`，与 firecrawl/grok 显式 import 风格不一致。
- `tests/unit/connector/net-client-agent.test.ts:1-13` — 仅断言常量 `MAX_CONNECTIONS_PER_ORIGIN===6` 与 `typeof init_global_network==="function"`，未测 Agent 行为。
- `tests/e2e/electron/auto_seed.spec.ts:26,84` — 固定 `waitForTimeout(5000)`，机器慢时 flaky。建议改 `expect().toBeVisible` 轮询。
- 测试命名 — 180 文件中 64 个含连字符（`config-store.test.ts` 等），违反"测试命名 snake_case"契约；但 src/ 同款（152 中 71 kebab），属项目级既有约定漂移，非测试专属。

### 3.6 构建配置 / 依赖

- `electron-builder.yml:15-17` — `out/web/**` 经 `files:out/**` 进 asar 又经 `extraResources.from:out/web` 复制到 `resources/web`，重复一份。建议：`files` 用 `!out/web/**` 排除，或去掉 extraResources 条目。
- `package.json:25` — `lint` glob 未含 `connectors/`，连接器 TS 有类型检查却无 lint。建议：加 `connectors`。
- `package.json:25` — `eslint ... *.ts` 只匹配根级 `.ts`，遗漏 `*.mts`。建议：追加 `*.mts`。
- `scripts/ensure_electron_abi.mjs:77` — PowerShell 单引号拼接未转义单引号（与上文 e2e 同源）。
- `vitest.config.mts:29-34` — 覆盖率门槛 15%/25% 对主体代码过宽。建议：逐步上调至至少 40/50。
- `tsconfig.json:31` — `baseUrl:"."` 无 `paths` 别名（无害无用）。建议：删除或显式映射。
- `knip.json:2-7` — `entry` 未含 `connectors/**/*.ts`，可能漏判"仅连接器引用的 src 代码"为 dead。建议：connectors 作 entry。
- `.husky/pre-push` — 推送前跑 `pnpm test` 会触发 `ensure_node_abi` 重建 better-sqlite3 native，推送慢且破坏同机正在跑的 dev 会话 ABI。建议：pre-push 改 `typecheck && lint`，test 进 CI。

---

## 4. 跨模块共性问题

- **P1 连接器空响应静默**：cpa（`fetch_provider` 空体）/ mimo（空 items）/ minimax（空 models）直接 `return []`，不 throw 也不 `report_failed_account`，触发 architecture.md 定义的"ready+空→清空历史"风险。grok 已做正确处置，可作模板统一推广。
- **P2 固定 account_id 字符串**：deepseek / firecrawl / glm / grok / kimi(无 api) / mimo / minimax / tavily / codex 都写死 provider 名，多 API key 实例会在 store collapse，违反 domain.md §4 不变量 3（accountId 必须稳定）。其中 firecrawl/deepseek/tavily 等可基于 API_KEY hash 补稳定标识。建议：抽统一的 `account_id_from_key(key)` 工具，或在 host 层对"无稳定远端 id 的 poll 型连接器"自动加 key hash 后缀。
- **P3 cycleDurationMs 语义混淆**：kimi、opencode_go、minimax 把"距 reset 剩余时间"或"end-start"当"周期时长"填，与 claude/cpa/glm/mimo 的固定周期常量用法冲突。下游任何依赖该字段算"进度/刷新节奏"的逻辑都会错。建议：在 observation schema 注释明确语义，并在 host 层做 `cycleDurationMs>=0` 校验。
- **P4 redaction 规则重复维护**：`config_redaction.ts` 与 `logger.ts` 各持一份 secret key 正则且覆盖不一致。建议：抽单一模块，连接器/IPC/日志统一引用。
- **P5 阈值未集中化**：status 硬编码 "normal"（claude/firecrawl）、阈值方向用反（mimo）、limit=null 误报（codex）本质都是 conventions.md 阈值约定（percent 90/75、ratio 0.9/0.75、余额反向）未在连接器侧统一实现。建议：提供 `status_for_pct`/`status_for_ratio`/`status_for_balance` 注入 ctx 或共享 helper，消除各连接器手写判定。

---

## 5. 亮点

- **安全基线扎实**：TS 5.9 开到 `strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + verbatimModuleSyntax`；Electron fuses 全收紧（`runAsNode:false`/`onlyLoadAppFromAsar:true`/关 NODE_OPTIONS）；contextIsolation/sandbox/webSecurity 默认开；CSP prod 严格 `'self'` 且构造抽纯函数带单测；`pnpm.overrides` 修 tar/tmp CVE；IPC sender 校验不依赖 NODE_ENV；cookie_parser 已防 CRLF 与分号注入。
- **vault 是生产级实现**：GCM 加密 + atomic write + `.bak` 回退 + mutex 串行化；config-store "corrupt 不 fallback default" 防止 auto_seed 覆盖数据丢失；token-stats-store 用 SQLite `user_version` 做迁移（非摆设的 `schemaVersion` 字段）。
- **进程边界守得住**：渲染层未发现直连 ipcRenderer/fs/child_process；密钥只走 hasSecret 布尔与 getSecrets；聚合规则 sum(used)/sum(limit) 在 `provider-usage.ts:506-535` 实现正确；CPA 账号并入真实 provider 卡片符合不变量 10。
- **测试规模与真实度**：180 文件覆盖 scheduler/vault/observation-store/oauth(grok 单文件 33 用例覆盖并发/轮换/登出竞态)/13 connector/30+ 组件/25+ e2e；secrets/vault/config/observation 全用真实 SQLite + 真实文件系统，符合"少 mock 多真实"。
- **packaged smoke 真实启动** `artifacts/win-unpacked/OmniUsage.exe`；测试分层（unit/contract:live/e2e electron+web+packaged）与 `docs/guides/testing.md` 对应清楚。

---

## 6. 方法与局限

- 6 路并行子审按模块分工读源码、各自返回带 file:line 的 findings；主审对 2 个 critical（C1 local-api 机制与绑定、C2 mimo 阈值方向）及关键 IPC 越权链路逐行复核验证。
- 局限：子审单遍读代码，未运行测试/打包验证；部分 minor（如连接器解析边界）依据代码静态推断，未构造真实上游响应回归。e2e 的 real-fixture 路径未实际执行。
- 本报告不修改任何源文件；落地修复建议按 AGENTS.md 拆 task，每 task 走红/绿/黑盒/双审流程，critical（C1/C2）优先。
