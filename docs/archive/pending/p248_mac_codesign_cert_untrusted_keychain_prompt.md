# p248 macOS 自签名证书未配置信任根导致钥匙串每次重启重复弹密码

- 现象：macOS 上打包或重启应用后，每次启动系统均弹出钥匙串授权对话框，请求访问“OmniPanel Safe Storage”并要求用户输入当前 macOS 系统账户密码；即使输入密码或点击允许，下次重启依然重复弹出。
- 影响：macOS 打包运行（`pnpm package` / `pnpm reload`）。每次启动打断用户心智并阻断启动，无法静默免密运行。
- 根因：
    1. Chromium / Electron 引擎初始化默认 Session 时，其网络层 `OSCrypt` 模块强制调用系统 Keychain 访问名为“OmniPanel Safe Storage”的密钥来加密本地 Cookie；
    2. `scripts/package-and-run.ts` 引入的自签证书 `OmniPanel Local Dev` 虽固定了 Designated Requirement，但该自签根证书未加入 macOS 系统的 Trust Settings（信任设置）；
    3. 通过 `security verify-cert` 实测验证返回 `CSSMERR_TP_NOT_TRUSTED`；macOS 安全策略对不受信任证书签名的应用执行严格防御，拒绝将其永久固化在 Keychain 条目的 ACL 白名单中，导致单次输密无法沉淀为永久授权，每次重启均再次弹窗。
        已确认同类位点：此前 `p245` 仅将 ad-hoc 重签切换为自签身份以固定 DR，但遗漏了证书本身的系统信任等级（`trustRoot`）与 Keychain ACL 持久化机制。
- 测试缺口：单元与集成测试均在无头环境下运行，未覆盖真机打包后的 macOS 钥匙串交互；缺乏针对本地证书信任链（`security verify-cert -p codeSigning`）的预检断言。
- 线索：`.scratch/omni_local_dev.pem` 经 `security verify-cert -c .scratch/omni_local_dev.pem -p codeSigning` 实测精确复现 `CSSMERR_TP_NOT_TRUSTED`；`security dump-trust-settings -d` 证实系统无任何信任条目。
- 处理：main
