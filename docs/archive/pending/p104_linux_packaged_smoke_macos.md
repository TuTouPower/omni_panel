# p104 Linux packaged smoke 启动脚本使用 macOS 路径（2026-08-09）

- 来源：t274 打包验证
- 内容：Linux 上 `pnpm package` 已生成 `artifacts/linux-unpacked/omni_panel`，但 `scripts/package-and-run.ts` 的非 Windows 分支固定拼接 macOS `OmniPanel.app` 路径，导致包装启动阶段返回 `ENOENT`；直接使用 Linux 产物运行 `pnpm test:packaged` 可通过。
- 处理：直接修复（package-and-run.ts 非 Win 分支改为 linux-unpacked）
