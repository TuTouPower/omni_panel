# p260 Electron 42.2.0 ESM 导入触发 safeStorage 导致打包冷启动弹钥匙串授权

- 现象：macOS 上冷启动打包版 OmniPanel 时，系统弹出访问钥匙串中的密钥 “OmniPanel Safe Storage” 的密码输入框（请求“登录”钥匙串密码）。即使之前已在 t500 关闭 Cookie 加密 fuse，打包运行仍会弹出。
- 影响：打包版启动流程被系统对话框阻塞，主线程无法继续执行；妨碍自动化部署与自用体验。已确认同类位点：所有在主进程通过 ESM 导入 `electron` 导出的位置。
- 根因：当前打包依赖为 Electron 42.2.0。Electron 42 引入 `os_crypt_async`（PR #49054），其 `SafeStorage` 构造函数注册了 `app.ready` 钩子并在 `OnFinishLaunching` 中调用 `KeychainKeyProvider::GetKey()` 访问系统钥匙串。由于 Node ESM 规范在加载 `import { ... } from "electron"` 或 `await import("electron")` 时会 eager evaluate 命名空间内所有导出的 getter，导致业务虽未直接使用 `safeStorage` 却隐式实例化了它。配合打包脚本当前的 ad-hoc 签名缺乏稳定 Designated Requirement，macOS 无法继承授权记录，冷启动必弹窗。官方已在 PR #50419（42 分支 backport PR #51924，发布于 Electron 42.4.1）修复，改为仅在实际调用加密接口时才懒加载初始化。
- 测试缺口：现有单元测试和无头集成测试未跑在真实打包 macOS 钥匙串交互环境下；CI 无法自动化检测系统原生钥匙串弹窗。应在 `package.json` 中将 Electron 升级至 42.4.1+ 并锁定，结合构建依赖版本断言或真实打包冒烟验证。
- 线索：官方修复 PR #50419、Backport PR #51924、Electron 42.4.1 发布记录、系统钥匙串 `OmniPanel Safe Storage` 弹窗截图。
- 处理：main
