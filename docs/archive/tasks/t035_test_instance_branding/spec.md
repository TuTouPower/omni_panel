# Task spec

## 背景

`pnpm start:test` 测试实例已能独立 userData，但图标与端口与正常实例相同：同时启动时 local-api 17863 冲突，且托盘/窗口图标无法区分。需让测试实例视觉可辨 + 端口隔离。

## 范围

- `assets/logo-test.svg`：logo.svg 蓝渐变换黄（logo_grad + bar_grad + circle）
- `scripts/render-test-icons.mjs`：从 logo-test.svg 生成 `assets/icon-test.png`(1024) + `assets/icon-test.ico` + `assets/tray-icon-test.png`(64)
- `src/main/core/paths.ts`：`TEST_INSTANCE=1` env 时 `get_app_icon_path`/`get_tray_icon_path` 返回 _-test._ 资源
- `src/main/core/local-api/server.ts`：`OMNI_USAGE_PORT` env 覆盖 DEFAULT_PORT
- `scripts/start-test.mjs`：设 `TEST_INSTANCE=1` + `OMNI_USAGE_PORT=17864`
- `package.json`：加 `icons:test` 脚本（生成测试图标）

## 非范围

- 不改正常实例图标/端口
- 不处理两个 dev 实例的 out/ 编译冲突（同时启动建议正常用打包 exe + 测试 dev）
- 不改 renderer dev server 端口（vite 自动让位）

## 验收标准

- [ ] `pnpm icons:test` 生成 3 个 _-test._ 资源
- [ ] TEST_INSTANCE=1 时托盘/窗口/tray 用黄色图标
- [ ] OMNI_USAGE_PORT=17864 时 local-api 监听 17864
- [ ] `pnpm start:test` 启动后图标黄 + 端口 17864
- [ ] 正常 `pnpm start` 图标蓝 + 端口 17863 不受影响
- [ ] pnpm test/typecheck 绿

## 依赖与约束

- 测试图标资源入库（assets/_-test._）
- local-api 端口被占已有回退机制（listen 失败回退 0）
