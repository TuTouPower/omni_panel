# p249 打包启动因 Cookie 加密 fuse 两次弹钥匙串密码

- 现象：macOS 上启动打包版 OmniPanel（`pnpm package` / `pnpm reload` / 打开 `OmniPanel.app`）会弹出钥匙串授权，要求输入当前 macOS 账户密码；常见要过两次。点允许后下次启动仍可能再弹。dev `pnpm start` 走另一条目 `Electron Safe Storage`，表现不同。
- 影响：打包自用流程每次被系统对话框打断；主线程在 `initLogging` 前就堵在 `SecItemCopyMatching`（见 p245），看起来像启动卡死。agent 点不了系统弹窗。
- 根因：产品约定不做系统钥匙串 / safeStorage（自管 Vault），但 `electron-builder.yml` 与 `electron-builder.test.yml` 的 `electronFuses.enableCookieEncryption` 为 `true`。Chromium OSCrypt 在默认 Session 初始化时强制访问钥匙串条目 `OmniPanel Safe Storage`（acct=`OmniPanel Key`）以加密磁盘 Cookie。业务代码没有 `safeStorage`。两次弹窗来自 OSCrypt（主进程 / 网络进程）再叠加登录钥匙串解锁，不是业务写了两次密码。
    p245 把 ad-hoc 换成自签 `OmniPanel Local Dev` 只固定了 codesign DR，OSCrypt 照样每次访问钥匙串。p248 写对了「OSCrypt + 证书不被信任」，但 8d7c5d1e 把它和用量面板高度一起归档，零行 fuse/钥匙串代码。本机 `security verify-cert -p codeSigning` 仍 `CSSMERR_TP_NOT_TRUSTED`。
    已确认同类位点：`electron-builder.yml`、`electron-builder.test.yml` 两处 fuse。Cookie 登录 `persist:session-login:*` 依赖 Chromium Cookie 库，关加密后已有加密库可能读失败，须重新 cookie 登录；Vault 里已抽出的密钥不受影响。
- 测试缺口：单测/集成不启动打包 App、不触钥匙串。应加构建配置断言两份 yml 的 `enableCookieEncryption` 为 false；关 fuse 后 cookie 登录/静默刷新路径要有「明文 Cookie 库仍可读」的说明或回归。真机打包弹窗无法在 CI 覆盖。
- 线索：`.scratch/keychain_prompt_20260918.md`
- 处理：t500
