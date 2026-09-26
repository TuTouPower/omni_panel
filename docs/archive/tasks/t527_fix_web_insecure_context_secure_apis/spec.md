# Task spec

## 背景

LocalAPI 绑 `0.0.0.0:17863` 的既定用途是局域网访问 web 面板（`docs/specs/web-panel.md`、ADR R7）。实测经任何**非 loopback HTTP origin**（局域网 IP `http://192.168.31.76:17863/`、mDNS 名 `http://karsondemacbook-pro.local:17863/`）打开 web 面板一律白屏：HTML/CSS/JS 资源均 200、`<title>` 正常，但 `#root` 空白，控制台报 `TypeError: crypto.randomUUID is not a function`。经 `http://127.0.0.1:17863/` 访问正常。

根因：`crypto.randomUUID` 与 `navigator.clipboard` 是 **Secure Context 专属 API**；Chromium 只把 https / `localhost` / `127.0.0.1` / `file` 视为可信源，局域网 IP 和 `*.local` 走明文 HTTP 时非安全上下文，这两个 API 为 `undefined`。`src/web/usageboard-web.ts:267` 在 `install_web_usageboard()` 顶层调用 `crypto.randomUUID()`，位于 React 挂载前，异常中断入口脚本即白屏。同机制另有 3 处无守卫位点在 web 模式触发时抛错。详见 p262。

## 契约区

### 范围

- 让 web 面板在非安全上下文（LAN IP / 非 loopback 主机名 + 明文 HTTP）下正常启动与主要交互可用。
- 覆盖 p262 已确认全部位点：
    - `src/web/usageboard-web.ts`：page connection id 生成不再硬依赖 `crypto.randomUUID`。
    - `src/renderer/components/AddAccountDialog.tsx`：`generate_instance_id` 不再硬依赖 `crypto.randomUUID`。
    - `src/renderer/components/workspace/SelectionTray.tsx`、`src/renderer/components/workspace/WorkspaceView.tsx`：`navigator.clipboard` 缺失时守卫，行为对齐既有 `SessionCard`/`SessionPane` 的静默降级。
- 补齐覆盖上述位点的自动化测试（含非 loopback origin 的启动验证）。

### 非范围

- 不改 LocalAPI 认证/绑定模型，不引入 HTTPS/证书。
- 不新增剪贴板回退实现（如 `execCommand`），沿用现有「缺失即静默降级」约定。
- 不改桌面 Electron（file:// 安全上下文）行为。
- 不处理本 task 未命中的其它浏览器 API。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：在 `crypto.randomUUID` 不可用（模拟非安全上下文）时，web 入口 `install_web_usageboard()` 不抛异常，且 App 正常挂载（`#root` 渲染出内容）。
- [ ] AC-002：在 `crypto.randomUUID` 不可用环境下，web bridge 仍能生成 page connection id；两个 bridge 实例（模拟两个 tab）生成的 connection id 互不相同（保持 d042 跨页唯一语义）。
- [ ] AC-003：在 `crypto.randomUUID` 不可用环境下，web 模式「添加账号」选择厂商不抛异常，生成的 instance id 非空且带厂商前缀。
- [ ] AC-004：在 `navigator.clipboard` 不可用环境下，session-library 选择托盘复制（`SelectionTray`）与工作台选择复制（`WorkspaceView` 的 Ctrl+Shift+C）不抛异常（同步 TypeError 不发生）。
- [ ] AC-005：经真实非 loopback HTTP origin 加载 web 面板时正常渲染（`#root` 非空），且无 `crypto.randomUUID is not a function` 类 pageerror。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。AC-001～004 走 vitest/jsdom：测试内删除对应 API 再驱动生产代码路径，断言不抛异常与产物契约。AC-005 走 playwright web e2e：浏览器通过 host 解析规则把非 loopback 主机名（如 `omni-insecure.test`）映射到预览服务，origin 主机字符串非可信 → 触发非安全上下文，断言 `#root` 非空且无 pageerror。

## 上下文区

- 来源：p262（2026-09-27 用户报告；本机 headless chromium 复现：`127.0.0.1` 正常，`192.168.31.76` / `karsondemacbook-pro.local` 白屏并复现 `crypto.randomUUID is not a function`）。

### 有意不测

- `crypto.subtle`、`navigator.mediaDevices`/`serviceWorker`/`geolocation`/`credentials`、`showOpenFilePicker` 等其它 secure-context-only API：已全量扫描 renderer/web 无命中，不在本 task 范围。

### 测试策略

- 单测（vitest）：
    - web bridge 启动路径：在 `crypto.randomUUID` 置 `undefined` 下调用 `create_web_usageboard()`，断言不抛且 connection id 非空；两次实例 id 不同。
    - `AddAccountDialog`：`crypto.randomUUID` 缺失下触发厂商选择，断言 instance id 非空带前缀、无抛错。
    - `SelectionTray` / `WorkspaceView`：`navigator.clipboard` 置 `undefined` 下触发复制路径，断言无同步抛错。
- e2e（playwright，`web` project 或新增用例）：host 解析规则映射非 loopback 主机名 → 预览服务，加载首页断言 `#root` 非空、无致命 pageerror；覆盖 AC-005 的端口端到端路径。
- 回归基线：既有 clipboard 守卫位点（`SessionCard`、`SessionPane`）行为不变。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。Chromium Secure Context 判定（`crypto.randomUUID`/`navigator.clipboard` 在非 loopback HTTP origin 下为 `undefined`）已由本机实测复现；`crypto.getRandomValues` 仍可在非安全上下文使用是候选回退依据，由实现期测试确认。

### 风险与回退

- 风险：回退 id 生成若退化为低熵实现，可能影响 d042 跨 tab 唯一性；playwright host 解析规则方案在个别环境不可用。
- 回退：id 生成保持高熵；e2e 用例不可用时降级为单测 + 手工 LAN 验证并记录。

### 依赖与约束

- 需 `out/web` 构建产物；playwright chromium 支持 `--host-resolver-rules`。
- 约束：`crypto.getRandomValues`（若采用）在非安全上下文可用，`crypto.subtle` 不可用，不得依赖后者。

### Finalization 时更新的 blueprint

- `docs/specs/web-panel.md`：累积记录 web 面板须在非安全上下文（LAN 明文 HTTP）可启动与交互；secure-context-only API 须守卫或提供非安全上下文可行的回退。
