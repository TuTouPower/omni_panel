---
tid: "t510"
slug: "main_bootstrap_security_proxy"
title: "主进程启动安全、单实例、代理与窗口外链收敛"
status: "done"
branch: "t510_main_bootstrap_security_proxy"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "a3e79022df8b9f6d172e9cd04d908de976b23b74"
depends_on: ""
conflicts_with: ""
note: "审阅采纳项: A3, A15, A16, A18, A20, A63, A72, A74, A79, A135, A147"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 提取并使用 check_single_instance_lock 与 run_with_single_instance_lock，锁获取失败立即退出且在 whenReady 中短路，阻止后续初始化执行。
2. 修复 will-navigate 与 setWindowOpenHandler，拦截所有外部 http/https 导航并委托系统浏览器打开，内部 file:// 协议正常放行。
3. 补全 CSP 指令：object-src 'none'; frame-ancestors 'none'; base-uri 'self'。
4. 抽象 is_safe_cookie_string，在 verify_cookie 与 session 保存时防御 8KB 长度与 CRLF 换行注入。
5. 修复 Windows 权限配置，使用 os.userInfo().username 并支持注入解析器，测试防环境变量伪造。
6. auto-seed 升级迁移：Win/macOS 忽略大小写比较路径，清理历史存量空实例，并将 schemaVersion 递增至 2。
7. build_secret_param_keys 补全 oauth_pkce 密钥集（含 REFRESH_TOKEN）。
8. 代理支持：新增 useSystemProxy 开关，扩展 PAC 解析支持 socks5://。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-25 10:55 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t510_code_f001|minor|已修|规范 file 协议守卫表达式|src/main/window/window-manager.ts:140|
|t510_test_f001|important|已修|新增 single_instance.test.ts 自动化断言锁竞争与短路|tests/unit/main/single_instance.test.ts:1|
|t510_test_f002|important|已修|新增 vault_permissions.test.ts 自动化断言防环境变量篡改|tests/unit/main/vault_permissions.test.ts:1|
|t510_test_f003|important|已修|删除已失效旧测试，新增独立的 A15/A16 外部导航拦截测试|tests/unit/main/window_manager.test.ts:166|
|t510_test_f004|minor|已修|新增 apply_auto_seed_and_migrate 自动化断言配置版本递增|tests/unit/main/core/config/auto-seed.test.ts:191|

### Round 2 (2026-09-25 11:00 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t510_test_f005|important|已修|消除恒真断言，通过真实配置升级对象断言版本递增|tests/unit/main/core/config/auto-seed.test.ts:191|
|t510_test_f006|important|已修|消除测试内平行实现，直接测试生产导出的控制函数|tests/unit/main/single_instance.test.ts:24|

### Round 3 (2026-09-25 11:08 UTC+8)

Round 3 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 与 `pnpm test` 全部通过（329 套件，3974 用例通过，0 失败）
- 黑盒：单元与集成测试全量验证通过
- review：Round 3 PASS（`review_code.md` PASS，`review_test.md` PASS，check_review_status overall=PASS）
- AC 证据：见 `handoff.json`

### 结果摘要

- 实现了主进程单实例锁获取失败立即退出并短路初始化的安全防护。
- 实现了窗口内外部导航拦截与协议白名单，外部链接统一交由系统默认浏览器打开。
- 补齐了 Electron CSP 安全头（object-src, frame-ancestors, base-uri）。
- 增加了 Cookie 安全格式防 CRLF 注入与 8KB 长度防御。
- 修复了 Windows 文件权限命令生成防环境变量劫持。
- 实现了 auto-seed 路径大小写兼容与交互式空实例清理迁移，递增 schemaVersion。
- 补充了 oauth_pkce 的 REFRESH_TOKEN 密钥参数。
- 实现了系统代理开关与 SOCKS5 代理协议支持。
