# Task spec

## 背景

主进程初始化、网络边界、窗口导航与系统代理配置存在多项安全与健壮性缺口：单实例锁失败未 return 导致双进程竞争；外部链接可替换内部窗口界面；打开外部 URL 缺乏白名单控制；CSP 策略不全；Cookie 缺乏防 CRLF 注入；Windows 权限设置依赖易受污染的环境变量；auto-seed 存在路径大小写重复与空实例残留；系统代理不可关闭且不支持 SOCKS5 代理。

## 契约区

### 范围

- `src/main/index.ts` 单实例锁竞争失败后立即 `return`，阻断后续全部初始化。
- 确认并加固 `background_serve` 进程启动与父进程退出逻辑。
- 拦截窗口内 `will-navigate` 外部跳转，统一调用系统浏览器并校验协议。
- 为 `setWindowOpenHandler` 与外部 URL 打开入口建立协议与域名白名单。
- 完善 Electron CSP，补充 `object-src 'none'; frame-ancestors 'none'; base-uri 'self'`。
- `verify_cookie` 增加 8KB 长度上限与拒绝换行符（`\r`、`\n`）校验。
- Windows 平台 vault 权限配置改用 `os.userInfo().username` 获取用户名。
- auto-seed 在 Win/macOS 下大小写无关比较可执行文件路径，避免重复实例。
- 升级配置 schemaVersion，执行存量空实例数据迁移与清理。
- `build_secret_param_keys` 支持包含 `oauth_pkce` 的 REFRESH_TOKEN。
- 设置增加“使用系统代理”开关（默认开启），支持 SOCKS5 代理协议配置。

### 非范围

- 不修改 LocalAPI 免认证 LAN 模型（维持现状，见 R7）。
- 不启用 Chromium Cookie 钥匙串加密（维持现状，见 R10）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：第二个应用实例启动且单实例锁获取失败时，立即退出进程，不执行数据库建表或服务监听。
- [ ] AC-002：窗口内发生外部网页导航时被 `will-navigate` 拦截，内部视图不变，外部 URL 经系统浏览器打开。
- [ ] AC-003：打开外部链接时校验 URL 协议，仅放行安全 http/https 链接，拒绝危险协议。
- [ ] AC-004：主窗口与辅助窗口响应头包含补齐后的完整 CSP 指令。
- [ ] AC-005：输入含有换行符或长度超过 8KB 的 Cookie 时，`verify_cookie` 返回错误并不予保存。
- [ ] AC-006：Windows 下生成权限命令时采用当前真实登录用户名，不受环境变量覆盖影响。
- [ ] AC-007：auto-seed 对不同大小写的同一路径识别为同一应用，不产生重复实例。
- [ ] AC-008：系统升级后自动清除存量空实例，配置版本号递增。
- [ ] AC-009：密钥参数键生成函数返回结果中包含 OAuth PKCE 的 REFRESH_TOKEN。
- [ ] AC-010：在设置中关闭系统代理后，出站请求直接直连；代理配置支持 `socks5://` 协议解析。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试

## 上下文区

- 来源：`docs/reviews/review_20260925_085413/adoption_decision.md`（采纳项 A3, A15, A16, A18, A20, A63, A72, A74, A79, A135, A147）

### 有意不测

- 无

### 测试策略

- 编写单实例锁竞争与提前返回单元测试。
- 编写导航拦截器与外部链接白名单测试。
- 编写 CSP 头部断言测试、Cookie 输入边界校验测试。
- 编写 auto-seed 大小写规范化测试与配置迁移清理测试。
- 编写代理开关状态与 SOCKS5 URL 解析单元测试。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若代理设置变更影响了底层 undici Agent，可能导致出站网络请求异常。
- 回退：保持默认仍使用系统代理，并在网络错误时输出明确日志，可配置回退。

### 依赖与约束

- 依赖 Node.js 内置 crypto 与 os 模块，遵循已定义安全边界。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：记录代理开关与外链安全策略
