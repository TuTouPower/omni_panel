# p181 esbuild/unrs-resolver build scripts 被 pnpm 10 忽略，评估白名单

- 来源：t392 遗留（reviewer Round 3 观察项）
- 内容：升级 pnpm 10 后，esbuild/unrs-resolver 的 build scripts 被 pnpm 10 默认 deny（输出「approve-builds」提示）。两者是 optionalDependencies 二进制（有预编译产物），3154 测试证明无功能影响，非回归。后续可评估是否加入 onlyBuiltDependencies 白名单、pnpm 10 CI 兼容（corepack pin 已就位）。
- 处理：已修复（2026-08-16 直接修复：esbuild/unrs-resolver 已加入 pnpm-workspace.yaml onlyBuiltDependencies，`pnpm install --frozen-lockfile` 验证无 approve-builds 警告）
