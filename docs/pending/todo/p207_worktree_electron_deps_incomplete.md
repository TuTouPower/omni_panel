# p207 task worktree node_modules electron 安装不完整

- 来源：t438 实施期发现
- 内容：task worktree 的 `node_modules/electron` 缺 `dist` 二进制与 `path.txt`（主仓同版本 42.2.0 完整），session-locator/subscription-service 等加载 `electron` 的单测在 worktree 内崩溃；实施时从主仓手动复制补齐（node_modules 非 git 改动）。需核对 worktree 依赖创建流程（pnpm install 时机/electron postinstall 是否被跳过），保证新 worktree 开箱可跑测试。
- 处理：未开
