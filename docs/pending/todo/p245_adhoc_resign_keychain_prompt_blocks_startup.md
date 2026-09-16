# p245 ad-hoc 重签后首次启动被 macOS 钥匙串授权弹窗阻塞（启动停在日志初始化之前）

- 现象：`pnpm package`（或 `pnpm reload`）重启打包版后，应用进程存活但**无任何新日志、本地 API 端口不监听、健康检查无响应**。本次实测（2026-09-16，`artifacts/mac-arm64`）：旧实例 18:33:27 正常关闭后，新实例 CPU 0%、仅 GPU helper，`~/Library/Application Support/OmniPanel/logs/app-2026-09-16.log` 再无新增行；`cli.json` 仍指向旧 pid。
- 根因：`sample <pid>` 显示主线程阻塞在 `SecItemCopyMatching` → `CSSM_DecryptDataFinal` → `mach_msg`（钥匙串解密等待），同时系统 `SecurityAgent` 进程在跑 = **钥匙串授权弹窗正等待用户点击**。触发条件是 `scripts/package-and-run.ts` 的 ad-hoc 重签（`codesign --force --deep --sign -`）：ad-hoc 签名绑定二进制哈希，每次打包签名都不同 → 之前记住的钥匙串 ACL 失效（vault/safeStorage 密钥），于是每次重签后首次启动都会再次弹授权；在日志初始化（`initLogging`）之前就会用到该密钥，所以表现为「启动无输出即卡死」。
- 影响：打包自检与「打包重启」流程会看起来卡死；agent 无法点击系统弹窗，只能人工介入；若无人值守，启动会一直停在该阻塞上。
- 处置选项（未选定，属环境/工具链决策）：
    1. 用**稳定自签名证书**签名（同一 identity 复用），使钥匙串 ACL 连续，仅在证书首次使用时授权一次；
    2. 打包脚本在重启后探测「无日志/端口无监听 + SecurityAgent 存在」并明确提示用户点击「始终允许」；
    3. 产物签名未变化时跳过重签（`codesign -dv` 校验失败才签）。
- 未验证项：`[deploy]` 点击「允许/始终允许」后启动是否继续正常（需人工点击；本次由用户侧完成）。
- 线索：`sample "$(pgrep -f 'MacOS/Omni[P]anel')" 3 -mayDie`（主线程停在 `SecItemCopyMatching`）；`pgrep -l SecurityAgent`；直接启动二进制时 stdout 为空（`/tmp/app_direct.log`）。
- 处理：未开
